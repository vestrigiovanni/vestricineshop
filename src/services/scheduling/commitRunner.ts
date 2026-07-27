/**
 * Crea davvero gli spettacoli: metadati, sub-eventi Pretix, sync.
 *
 * È l'unico posto dove questa sequenza esiste. Il wizard web e l'app Swift la
 * usano entrambi attraverso il registro dei lavori, così non ci sono due
 * implementazioni che possono divergere — era esattamente il difetto di
 * `adminBulkScheduleMovie`, che faceva le stesse cose con regole leggermente
 * diverse e per giunta in parallelo.
 */

import { createJob, getJob, updateJob, type CommitError } from './commitJobs';

export interface CommitShowInput {
  tmdbId: string;
  /** Data di calendario 'YYYY-MM-DD' (dopo la mezzanotte è il giorno dopo). */
  date: string;
  /** 'HH:mm' in ora di Roma. */
  time: string;
  title?: string;
  /**
   * Spettacoli da rimuovere per far posto a questo: la sovrascrittura.
   *
   * Sono id Pretix, e vengono eliminati **qui**, un attimo prima di creare il
   * rimpiazzo — non quando l'utente li sceglie. Così un piano abbandonato a
   * metà non lascia dietro di sé un buco in palinsesto, e la sala resta scoperta
   * per i pochi secondi della sostituzione invece che per tutta la revisione.
   */
  replaces?: number[];
  /**
   * Procedere anche se su ciò che si sostituisce ci sono biglietti venduti.
   * Senza, la rimozione si rifiuta e lo spettacolo nuovo non viene creato.
   */
  forceReplace?: boolean;
}

export interface CommitInput {
  seatingPlanId: number;
  shows: CommitShowInput[];
}

export function showKeyOf(s: CommitShowInput): string {
  return `${s.tmdbId}@${s.date}T${s.time}`;
}

/**
 * Avvia la creazione e restituisce subito l'id del lavoro.
 *
 * Il lavoro prosegue in sottofondo: chi ha chiamato interroga
 * `getJob(jobId)` per sapere come va. Deliberatamente **non** si aspetta la
 * fine, perché creare trenta spettacoli supera la durata di una richiesta.
 */
export function startCommit(input: CommitInput): string {
  const shows = input.shows.slice(0, 200);
  const uniqueFilms = new Set(shows.map((s) => s.tmdbId)).size;
  const job = createJob(uniqueFilms + shows.length + 1);

  // Nessun await: il lavoro vive per conto suo e riferisce tramite il registro.
  void run(job.id, { ...input, shows }).catch((err) => {
    console.error('[commitRunner] ❌ lavoro interrotto', err);
    updateJob(job.id, {
      state: 'error',
      step: err instanceof Error ? err.message : 'Errore imprevisto',
    });
  });

  return job.id;
}

async function run(jobId: string, input: CommitInput): Promise<void> {
  const { adminPrepareMetadata, adminScheduleMovie, adminSyncNewlyCreatedEvents } =
    await import('@/actions/adminActions');
  const { planningGetFilmInfo, planningDeleteShow } = await import('@/actions/planningActions');

  const shows = [...input.shows].sort((a, b) =>
    `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)
  );
  const uniqueIds = [...new Set(shows.map((s) => s.tmdbId))];

  updateJob(jobId, { state: 'running', step: 'Preparo i metadati' });

  // La piantina della sala si rinfresca qui, una volta: da qui in avanti ogni
  // creazione la trova in cache invece di riscaricarla. È fresca *e* costa una
  // chiamata sola invece di una per spettacolo.
  const { getSeatingPlanDetail } = await import('@/services/pretix');
  await getSeatingPlanDetail(input.seatingPlanId, true).catch(() => null);

  const info = new Map((await planningGetFilmInfo(uniqueIds)).map((f) => [f.tmdbId, f]));
  let done = 0;

  // ── 1. Metadati arricchiti e premi MUBI ───────────────────────────────────
  // Qui si può andare in parallelo: sono TMDB e MUBI, non Pretix, e i film non
  // si toccano fra loro. Il vincolo della sequenzialità riguarda solo la
  // creazione degli spettacoli più sotto. Quattro alla volta perché MUBI è uno
  // scraping e non merita di essere martellato.
  const meta: Record<string, unknown> = {};
  const METADATA_CONCURRENCY = 4;

  for (let i = 0; i < uniqueIds.length; i += METADATA_CONCURRENCY) {
    const batch = uniqueIds.slice(i, i + METADATA_CONCURRENCY);
    updateJob(jobId, {
      step: `Metadati e premi · ${batch.map((id) => info.get(id)?.title ?? id).join(', ')}`,
      done,
    });
    await Promise.all(
      batch.map(async (tmdbId) => {
        try {
          meta[tmdbId] = await adminPrepareMetadata(tmdbId);
        } catch (err) {
          console.error('[commitRunner] metadati', tmdbId, err);
          meta[tmdbId] = null;
        }
      })
    );
    done += batch.length;
    updateJob(jobId, { done });
  }

  // ── 2. Creazione, uno alla volta ──────────────────────────────────────────
  const created: number[] = [];
  const errors: CommitError[] = [];

  // Il palinsesto viaggia di spettacolo in spettacolo: si legge da Pretix una
  // volta sola (dentro la prima creazione) e poi si passa avanti aggiornato.
  // Prima veniva riletto per intero — tutte le pagine — a ogni spettacolo, ed
  // era il vero costo di un commit lungo: sei proiezioni, sei scansioni, più i
  // backoff quando Pretix rispondeva 429.
  //
  // I controlli non cambiano: ogni spettacolo viene comunque confrontato con
  // quelli esistenti e con quelli creati un attimo prima nello stesso lotto.
  let blocked: { start: number; end: number; title: string; runtime: number }[] | undefined;

  for (let i = 0; i < shows.length; i++) {
    const s = shows[i];
    const f = info.get(s.tmdbId);
    const label = `${f?.title ?? s.title ?? s.tmdbId} · ${s.date} ${s.time}`;
    updateJob(jobId, { step: `Spettacolo ${i + 1}/${shows.length} · ${label}`, done });

    if (!f) {
      errors.push({ key: showKeyOf(s), label, error: 'Film non trovato su TMDB.' });
      done++;
      updateJob(jobId, { errors: [...errors] });
      continue;
    }

    // ── Sovrascrittura: prima si libera il posto ────────────────────────────
    // Se la rimozione fallisce non si crea niente: lo spettacolo nuovo
    // andrebbe a sbattere contro quello vecchio, e ci ritroveremmo con un
    // errore al posto di una sostituzione. Il caso più frequente è il rifiuto
    // per biglietti venduti, che è esattamente il rifiuto che vogliamo.
    let blockedByReplace = false;
    const replaces = s.replaces ?? [];

    // Quando gli spettacoli da togliere sono più d'uno si guardano *tutti*
    // prima di toccarne uno. Cancellando in fila, se il secondo ha biglietti
    // venduti ci si ferma dopo aver già eliminato il primo: resterebbe un buco
    // in palinsesto senza niente al suo posto, ed è il danno peggiore fra
    // quelli possibili qui. Con una sola rimozione il controllo lo fa già
    // `planningDeleteShow` prima di cancellare, e questo giro sarebbe sprecato.
    if (replaces.length > 1 && !s.forceReplace) {
      const { countSoldTickets } = await import('@/services/pretix');
      for (const pretixId of replaces) {
        let refusal: string | null = null;
        try {
          const sold = await countSoldTickets(pretixId);
          if (sold > 0) {
            refusal = sold === 1
              ? "C'è già 1 biglietto venduto su uno degli spettacoli da sostituire."
              : `Ci sono già ${sold} biglietti venduti su uno degli spettacoli da sostituire.`;
          }
        } catch {
          // Non sapere quanti biglietti ci sono non autorizza a cancellare.
          refusal = 'Non sono riuscito a controllare i biglietti venduti sugli spettacoli da sostituire.';
        }
        if (refusal) {
          errors.push({ key: showKeyOf(s), label, error: refusal });
          blockedByReplace = true;
          break;
        }
      }
    }

    for (const pretixId of blockedByReplace ? [] : replaces) {
      updateJob(jobId, { step: `Sostituisco · libero le ${s.time} del ${s.date}`, done });
      try {
        const removal = await planningDeleteShow(pretixId, s.forceReplace ?? false);
        if (!removal.deleted) {
          errors.push({
            key: showKeyOf(s),
            label,
            error: removal.error ?? 'Non è stato possibile rimuovere lo spettacolo da sostituire.',
          });
          blockedByReplace = true;
          break;
        }
        // Il palinsesto che ci portavamo dietro ora è vecchio di uno
        // spettacolo: rileggerlo è l'unico modo di non credere ancora occupato
        // il posto che abbiamo appena liberato.
        blocked = undefined;
      } catch (err) {
        errors.push({
          key: showKeyOf(s),
          label,
          error: err instanceof Error ? err.message : 'Rimozione fallita.',
        });
        blockedByReplace = true;
        break;
      }
    }

    if (blockedByReplace) {
      done++;
      updateJob(jobId, { done, errors: [...errors] });
      continue;
    }

    const res = await adminScheduleMovie(
      {
        id: s.tmdbId,
        title: f.title,
        overview: f.overview,
        posterPath: f.posterPath,
        language: f.language,
        subtitles: f.subtitles,
        versionLanguage: f.versionLanguage,
      },
      s.date,
      s.time,
      input.seatingPlanId,
      false,
      0,
      true, // il sync si fa una volta sola, alla fine
      meta[s.tmdbId] ?? undefined,
      blocked
    );

    if (res.success && res.subeventId) {
      created.push(res.subeventId);
      blocked = (res as { blockedAfter?: typeof blocked }).blockedAfter ?? blocked;
    } else {
      errors.push({ key: showKeyOf(s), label, error: res.error || 'errore sconosciuto' });
      // Fallito a metà: non sappiamo se il sub-evento sia nato prima dell'errore,
      // quindi la lista in mano non è più affidabile. Si rilegge da Pretix al
      // giro dopo — capita di rado, e meglio lento che con un doppione.
      blocked = undefined;
    }

    done++;
    updateJob(jobId, { done, created: [...created], errors: [...errors] });
  }

  // ── 3. Sync chirurgico, solo su ciò che è appena nato ─────────────────────
  if (created.length > 0) {
    updateJob(jobId, { step: 'Sincronizzo il database', done });
    const sync = await adminSyncNewlyCreatedEvents(created);
    if (!sync.success) {
      errors.push({ key: 'sync', label: 'Sincronizzazione database', error: sync.error ?? 'errore' });
    }
  }

  updateJob(jobId, {
    state: 'done',
    step: 'Completato',
    done: getJob(jobId)?.total ?? done + 1,
    created: [...created],
    errors: [...errors],
  });
}
