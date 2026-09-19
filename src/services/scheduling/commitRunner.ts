/**
 * Crea davvero gli spettacoli: metadati, sub-eventi Pretix, sync.
 *
 * È l'unico posto dove questa sequenza esiste. Il wizard web e l'app Swift la
 * usano entrambi attraverso il registro dei lavori, così non ci sono due
 * implementazioni che possono divergere.
 *
 * ── COME AVANZA ──────────────────────────────────────────────────────────────
 * Nessuno lavora in sottofondo. `startCommit` scrive solo l'elenco delle
 * intenzioni e torna; poi ogni chiamata a `tickCommit` fa **un lotto** di
 * lavoro e riferisce. Chi guarda la barra è anche chi la fa avanzare.
 *
 * La versione precedente lanciava una promessa e la lasciava correre dopo aver
 * risposto: su Vercel l'istanza viene congelata appena la risposta è partita,
 * quindi quel lavoro moriva a metà — ed era la ragione per cui la pagina
 * doveva restare aperta per ore e un wifi caduto portava via tutto.
 *
 * ── PERCHÉ ORA SI PUÒ ANDARE IN PARALLELO ────────────────────────────────────
 * Prima gli spettacoli si creavano uno alla volta perché due creazioni in volo
 * insieme non si vedevano a vicenda. Ma il piano è noto **per intero** prima di
 * cominciare: l'occupazione della sala si legge una volta per tick, e a ogni
 * spettacolo si passa come `knownBlocked` la sala più *tutti* i suoi fratelli
 * del lotto. Ogni creazione vede quindi esattamente ciò che vedeva prima —
 * anzi di più, perché vede anche quelli che verranno dopo — e la sequenzialità
 * non serve più. È da lì che arriva la velocità.
 */

import {
  MAX_ATTEMPTS,
  addJobError,
  claimBatch,
  createJob,
  getJob,
  getJobHead,
  jobCreatedIds,
  jobFilmIds,
  jobItems,
  jobSpecsToWrite,
  markCreated,
  markFailed,
  releaseUnworked,
  patchJob,
  retryFailed,
  type CommitItemRow,
  type CommitJob,
} from './commitJobs';
import { MIN_GAP_MINUTES } from './times';
import { normalizeProjectionSpecs, normalizeProjectionSpecsNote } from '@/constants/projectionSpecs';

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
  /**
   * Creare anche se lo spettacolo esce dalla fascia d'apertura: comincia prima
   * delle 10:00, oppure il film finisce dopo l'01:00.
   *
   * Vale **solo** sull'orario d'apertura. Le sovrapposizioni con ciò che è già
   * in sala restano rifiutate come sempre.
   */
  allowOutsideHours?: boolean;
  /**
   * Come si proietta: codici da `constants/projectionSpecs` (4K, DOLBY_VISION,
   * ATMOS, IMAX). Diventano i bollini che il pubblico vede sullo spettacolo.
   *
   * Si scrivono sul database del sito **dopo** il sync e non passano da Pretix:
   * il sync notturno riscrive da Pretix tutto ciò che Pretix conosce, e queste
   * lì non esistono. Ciò che non conosce, non lo tocca.
   */
  specs?: string[];
  /** La riga libera, per ciò che le caselle non prevedono. */
  specsNote?: string;
}

export interface CommitInput {
  seatingPlanId: number;
  shows: CommitShowInput[];
}

export function showKeyOf(s: { tmdbId: string; date: string; time: string }): string {
  return `${s.tmdbId}@${s.date}T${s.time}`;
}

/** Quanti spettacoli si creano insieme dentro un tick. */
const SHOW_CONCURRENCY = 5;

/** Quanti spettacoli prende in carico un tick. Due ondate da cinque. */
const BATCH_SIZE = 10;

/** Quanti film si preparano per tick: i metadati sono la parte lenta. */
const METADATA_BATCH = 3;

/** Quanti metadati si preparano insieme. MUBI è uno scraping, non si martella. */
const METADATA_CONCURRENCY = 3;

/**
 * Oltre questo, un film senza metadati si programma lo stesso.
 *
 * Il tetto è largo di proposito: questa fase esiste soprattutto per i **premi**,
 * che arrivano da uno scraping di MUBI e qualche secondo lo prendono sempre.
 * Stringerlo per far tornare prima il lotto vorrebbe dire programmare settimane
 * senza allori, cioè rinunciare alla cosa per cui la fase era stata scritta.
 *
 * Quando scade davvero — MUBI giù, rete che non va — lo spettacolo si crea lo
 * stesso e la cosa viene **detta**: compare fra gli errori del lavoro, così si
 * sa quale film recuperare dal pannello film con "Aggiorna premi", invece di
 * scoprirlo settimane dopo guardando una scheda spoglia.
 */
const METADATA_TIMEOUT_MS = 25_000;

/** Quanto può durare un tick prima di restituire il controllo. */
const TICK_BUDGET_MS = 25_000;

/**
 * Avvia la creazione: scrive l'elenco e restituisce l'id del lavoro.
 *
 * Non crea **niente** su Pretix. Il lavoro comincia al primo `tickCommit`.
 */
export async function startCommit(input: CommitInput): Promise<string> {
  const shows = input.shows.slice(0, 400);

  // Le durate servono a calcolare i conflitti senza rileggere TMDB a ogni tick:
  // si chiedono una volta sola, qui.
  const { planningGetFilmInfo } = await import('@/actions/planningActions');
  const info = new Map(
    (await planningGetFilmInfo([...new Set(shows.map((s) => s.tmdbId))]).catch(() => []))
      .map((f) => [f.tmdbId, f])
  );

  return createJob(
    input.seatingPlanId,
    shows.map((s) => ({
      key: showKeyOf(s),
      tmdbId: s.tmdbId,
      date: s.date,
      time: s.time,
      title: info.get(s.tmdbId)?.title ?? s.title,
      runtime: info.get(s.tmdbId)?.runtime || undefined,
      payload: {
        ...(s.replaces?.length ? { replaces: s.replaces, forceReplace: s.forceReplace ?? false } : {}),
        ...(s.allowOutsideHours ? { allowOutsideHours: true } : {}),
        ...(s.specs?.length ? { specs: s.specs } : {}),
        ...(s.specsNote ? { specsNote: s.specsNote } : {}),
      },
    }))
  );
}

/** Rimette in gioco i falliti di un lavoro. Il tick successivo li riprende. */
export async function retryCommit(jobId: string): Promise<number> {
  return retryFailed(jobId);
}

/**
 * Fa avanzare il lavoro di un lotto e riferisce a che punto è.
 *
 * Torna sempre in fretta: chi chiama la richiama finché `state` non è `done` o
 * `error`. È sicuro chiamarla da due parti insieme — le righe si prenotano, e
 * una riga già presa non viene lavorata due volte.
 */
export async function tickCommit(jobId: string): Promise<CommitJob | null> {
  const head = await getJobHead(jobId);
  if (!head) return null;
  if (head.state === 'done' || head.state === 'error') return getJob(jobId);

  const deadline = Date.now() + TICK_BUDGET_MS;

  try {
    if (head.phase === 'metadata') {
      await runMetadataPhase(jobId, head.metaDone, deadline);
      return getJob(jobId);
    }

    if (head.phase === 'shows') {
      await runShowsPhase(jobId, head.seatingPlanId, deadline);
      return getJob(jobId);
    }

    if (head.phase === 'sync') {
      await runSyncPhase(jobId);
      return getJob(jobId);
    }

    // `done` senza stato concluso non dovrebbe esistere, ma se capita il
    // cliente resterebbe a interrogare per sempre un lavoro finito.
    await patchJob(jobId, { state: 'done', step: 'Completato' });
  } catch (err) {
    console.error('[commitRunner] ❌ tick interrotto', err);
    // Un tick che esplode non condanna il lavoro: le righe non concluse
    // tornano disponibili da sole e il tick successivo riprende. Si segnala e
    // si lascia che ci riprovi.
    await addJobError(jobId, {
      key: 'tick',
      label: 'Avanzamento della creazione',
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return getJob(jobId);
}

// ── 1. Metadati arricchiti e premi MUBI ──────────────────────────────────────
// Sono TMDB e MUBI, non Pretix, e i film non si toccano fra loro: si va in
// parallelo. Il vincolo della sequenzialità riguardava solo la creazione, e
// nemmeno più quella.

async function runMetadataPhase(jobId: string, metaDone: string[], deadline: number): Promise<void> {
  const { adminPrepareMetadata } = await import('@/actions/adminActions');

  const all = await jobFilmIds(jobId);
  const done = new Set(metaDone);
  const todo = all.filter((id) => !done.has(id));

  if (todo.length === 0) {
    await patchJob(jobId, { phase: 'shows', state: 'running', step: 'Creo gli spettacoli' });
    return;
  }

  await patchJob(jobId, {
    state: 'running',
    step: `Metadati e premi · ${done.size}/${all.length} film`,
  });

  const slice = todo.slice(0, METADATA_BATCH);
  for (let i = 0; i < slice.length && Date.now() < deadline; i += METADATA_CONCURRENCY) {
    const batch = slice.slice(i, i + METADATA_CONCURRENCY);
    await Promise.all(
      batch.map(async (tmdbId) => {
        try {
          await withTimeout(adminPrepareMetadata(tmdbId), METADATA_TIMEOUT_MS);
        } catch (err) {
          // Un film senza metadati si programma lo stesso: la creazione li
          // rilegge da TMDB. Perdere i premi è un difetto, non un blocco — ma
          // è un difetto che va detto, o resterebbe una scheda spoglia di cui
          // nessuno sa più il perché.
          console.error('[commitRunner] metadati', tmdbId, err);
          await addJobError(jobId, {
            key: `meta-${tmdbId}`,
            label: `Premi e metadati · film ${tmdbId}`,
            error: 'Non sono riuscito a leggere i premi (MUBI non ha risposto). Gli spettacoli si creano lo stesso: recuperali dal pannello film con «Aggiorna premi».',
          });
        }
        done.add(tmdbId);
      })
    );
  }

  const remaining = all.filter((id) => !done.has(id));
  await patchJob(jobId, {
    metaDone: [...done],
    phase: remaining.length === 0 ? 'shows' : 'metadata',
    step:
      remaining.length === 0
        ? 'Creo gli spettacoli'
        : `Metadati e premi · ${done.size}/${all.length} film`,
  });
}

// ── 2. Creazione ─────────────────────────────────────────────────────────────

async function runShowsPhase(jobId: string, seatingPlanId: number, deadline: number): Promise<void> {
  const batch = await claimBatch(jobId, BATCH_SIZE);

  if (batch.length === 0) {
    // Non resta niente da prendere: o è finito, o ciò che resta è in mano a un
    // altro tick e tornerà da sé. Solo quando non c'è più nessuna riga aperta
    // si passa al sync.
    const job = await getJob(jobId);
    if (job && job.pending === 0) {
      await patchJob(jobId, { phase: 'sync', step: 'Sincronizzo il database' });
      return;
    }
    // C'è ancora lavoro, ma è prenotato da qualcun altro — di solito un tick
    // che non è mai tornato, e la cui prenotazione scadrà da sé. Si aspetta un
    // attimo prima di rispondere, altrimenti chi interroga girerebbe a vuoto
    // centinaia di volte in attesa che quella prenotazione scada.
    await patchJob(jobId, { step: 'Aspetto che si liberi il lotto precedente…' });
    await new Promise((r) => setTimeout(r, 2500));
    return;
  }

  await patchJob(jobId, { state: 'running', step: stepLabel(batch) });

  // La piantina della sala e il palinsesto si leggono **una volta per tick**.
  // Prima si rileggevano a ogni spettacolo: su un lotto da cento erano cento
  // scansioni dello stesso palinsesto, con in più i 429 e i loro backoff.
  const { getSeatingPlanDetail } = await import('@/services/pretix');
  const { getBlockedIntervals } = await import('@/actions/adminActions');
  const [, existing] = await Promise.all([
    getSeatingPlanDetail(seatingPlanId, true).catch(() => null),
    getBlockedIntervals(seatingPlanId),
  ]);

  // Ogni spettacolo del lotto vede la sala **più tutti i suoi fratelli del
  // piano**, tranne sé stesso. È ciò che rende sicuro il parallelo: nessuna
  // creazione può atterrare addosso a un'altra, perché le conosce già tutte.
  const siblings = await plannedIntervals(jobId);
  const blockedFor = (key: string) => [
    ...existing,
    ...siblings.filter((s) => s.key !== key).map(({ start, end, title, runtime }) => ({ start, end, title, runtime })),
  ];

  // Metadati e anagrafica dei film del lotto: una lettura sola, non una per
  // spettacolo. Lo stesso film compare cinque volte in una settimana, e
  // chiederlo cinque volte era tempo regalato.
  const filmIds = [...new Set(batch.map((b) => b.tmdbId))];
  // Le durate che il lavoro si è già scritto: servono a non perdere i metadati
  // dei film la cui scheda non ha la durata (vedi `loadPreparedMetadata`).
  const runtimes = new Map(
    batch.filter((b) => b.runtime).map((b) => [b.tmdbId, b.runtime!])
  );
  const { planningGetFilmInfo } = await import('@/actions/planningActions');
  const [meta, infoList] = await Promise.all([
    loadPreparedMetadata(filmIds, runtimes),
    planningGetFilmInfo(filmIds).catch(() => []),
  ]);
  const info = new Map(infoList.map((f) => [f.tmdbId, f]));

  // Le sostituzioni si fanno in fila: eliminano roba, e farlo in parallelo
  // significherebbe liberare un posto mentre qualcun altro lo sta valutando.
  const replacing = batch.filter((b) => (b.payload.replaces ?? []).length > 0);
  const plain = batch.filter((b) => (b.payload.replaces ?? []).length === 0);

  await runWithConcurrency(
    plain.map((item) => () => createOne(item, seatingPlanId, blockedFor(item.key), meta, info)),
    SHOW_CONCURRENCY,
    deadline
  );

  for (const item of replacing) {
    if (Date.now() > deadline) break;
    await createOne(item, seatingPlanId, blockedFor(item.key), meta, info);
  }

  // Ciò che il tempo non ha permesso di fare torna subito disponibile, col
  // tentativo non contato: il tick successivo lo riprende senza aspettare che
  // scada la prenotazione.
  await releaseUnworked(batch.map((b) => b.id));

  const job = await getJob(jobId);
  if (job && job.pending === 0) {
    await patchJob(jobId, { phase: 'sync', step: 'Sincronizzo il database' });
  }
}

/** Crea un singolo spettacolo e ne scrive l'esito sulla sua riga. */
async function createOne(
  item: CommitItemRow,
  seatingPlanId: number,
  blocked: { start: number; end: number; title: string; runtime: number }[],
  meta: Map<string, unknown>,
  info: Map<string, { title: string; overview: string; posterPath: string; language: string; subtitles: string; versionLanguage: string }>
): Promise<void> {
  const { adminScheduleMovie } = await import('@/actions/adminActions');

  const label = `${item.title ?? item.tmdbId} · ${item.date} ${item.time}`;

  try {
    const f = info.get(item.tmdbId);
    if (!f) {
      await markFailed(item.id, 'Film non trovato su TMDB.', false);
      return;
    }

    // ── Sovrascrittura: prima si libera il posto ────────────────────────────
    const replaces = item.payload.replaces ?? [];
    if (replaces.length > 0) {
      const refusal = await freeTheSlot(replaces, item.payload.forceReplace ?? false);
      if (refusal) {
        await markFailed(item.id, refusal, false);
        return;
      }
    }

    const res = await adminScheduleMovie(
      {
        id: item.tmdbId,
        title: f.title,
        overview: f.overview,
        posterPath: f.posterPath,
        language: f.language,
        subtitles: f.subtitles,
        versionLanguage: f.versionLanguage,
      },
      item.date,
      item.time,
      seatingPlanId,
      false,
      0,
      true, // il sync si fa una volta sola, alla fine
      meta.get(item.tmdbId) ?? undefined,
      blocked,
      item.payload.allowOutsideHours ?? false
    );

    if (res.success && res.subeventId) {
      await markCreated(item.id, res.subeventId);
      return;
    }

    const message = res.error || 'errore sconosciuto';
    await markFailed(item.id, message, isRetryable(message));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[commitRunner] creazione fallita', label, message);
    await markFailed(item.id, message, isRetryable(message));
  }
}

/**
 * Libera la destinazione di una sostituzione.
 *
 * Quando gli spettacoli da togliere sono più d'uno si guardano **tutti** prima
 * di toccarne uno: cancellando in fila, se il secondo ha biglietti venduti ci
 * si fermerebbe dopo aver già eliminato il primo, e resterebbe un buco in
 * palinsesto senza niente al suo posto. Restituisce il motivo del rifiuto, o
 * `null` se il posto è libero.
 */
async function freeTheSlot(replaces: number[], force: boolean): Promise<string | null> {
  const { planningDeleteShow } = await import('@/actions/planningActions');

  if (replaces.length > 1 && !force) {
    const { countSoldTickets } = await import('@/services/pretix');
    for (const pretixId of replaces) {
      try {
        const sold = await countSoldTickets(pretixId);
        if (sold > 0) {
          return sold === 1
            ? "C'è già 1 biglietto venduto su uno degli spettacoli da sostituire."
            : `Ci sono già ${sold} biglietti venduti su uno degli spettacoli da sostituire.`;
        }
      } catch {
        // Non sapere quanti biglietti ci sono non autorizza a cancellare.
        return 'Non sono riuscito a controllare i biglietti venduti sugli spettacoli da sostituire.';
      }
    }
  }

  for (const pretixId of replaces) {
    try {
      const removal = await planningDeleteShow(pretixId, force);
      if (!removal.deleted) {
        return removal.error ?? 'Non è stato possibile rimuovere lo spettacolo da sostituire.';
      }
    } catch (err) {
      return err instanceof Error ? err.message : 'Rimozione fallita.';
    }
  }

  return null;
}

// ── 3. Sync chirurgico, specifiche e premi ───────────────────────────────────

async function runSyncPhase(jobId: string): Promise<void> {
  const created = await jobCreatedIds(jobId);

  // I premi si fotografano **prima** del sync, non dopo: il sync ricrea le
  // schede film da TMDB, dove i premi non esistono, e il legame a cascata se li
  // porta via. Leggerli dopo significherebbe leggere il vuoto — era la ragione
  // per cui una settimana appena programmata risultava senza allori.
  const awardsSnapshot = await snapshotAwards(jobId);

  if (created.length > 0) {
    await patchJob(jobId, { step: 'Sincronizzo il database' });
    const { adminSyncNewlyCreatedEvents } = await import('@/actions/adminActions');
    const sync = await adminSyncNewlyCreatedEvents(created);
    if (!sync.success) {
      await addJobError(jobId, {
        key: 'sync',
        label: 'Sincronizzazione database',
        error: sync.error ?? 'errore',
      });
    }
  }

  // ── Le specifiche di proiezione, dopo il sync ──────────────────────────────
  // Dopo e non prima: è il sync a creare le righe `PretixSync`, e scrivere su
  // una riga che non c'è ancora non scriverebbe niente. Il sync non le può
  // sovrascrivere — legge da Pretix, e Pretix di queste colonne non sa nulla.
  const specs = await jobSpecsToWrite(jobId);
  if (specs.length > 0) {
    await patchJob(jobId, { step: 'Scrivo le specifiche di proiezione' });
    const prisma = (await import('@/lib/prisma')).default;
    for (const { pretixId, specs: codes, note } of specs) {
      try {
        await prisma.pretixSync.update({
          where: { pretixId },
          data: {
            projectionSpecs: normalizeProjectionSpecs(codes),
            projectionSpecsNote: normalizeProjectionSpecsNote(note ?? undefined),
          },
        });
      } catch (err) {
        console.error('[commitRunner] specifiche non scritte per', pretixId, err);
        await addJobError(jobId, {
          key: `specs-${pretixId}`,
          label: `Specifiche di proiezione · spettacolo ${pretixId}`,
          error: 'Lo spettacolo è stato creato, ma i bollini non sono stati salvati.',
        });
      }
    }
  }

  // ── I premi, di nuovo, in fondo ───────────────────────────────────────────
  // Si riscrivono qui, dopo tutto ciò che poteva cancellarli, dalla fotografia
  // presa prima del sync. Non costa nessuna chiamata di rete.
  if (awardsSnapshot.size > 0) {
    await patchJob(jobId, { step: 'Riporto i premi sulle schede film' });
    const { saveOverride } = await import('@/services/db.service');
    for (const [tmdbId, awards] of awardsSnapshot) {
      try {
        await saveOverride(tmdbId, { awards });
      } catch (err) {
        // Un premio mancante non invalida uno spettacolo già creato: si
        // recupera dal pannello film con "Aggiorna premi".
        console.error('[commitRunner] premi non riscritti per', tmdbId, err);
      }
    }
  }

  const job = await getJob(jobId);
  await patchJob(jobId, {
    phase: 'done',
    state: job && job.errors.length > 0 && job.created.length === 0 ? 'error' : 'done',
    step: 'Completato',
  });
}

/** I premi dei film del lavoro, così come stanno adesso: la copia da rimettere. */
async function snapshotAwards(
  jobId: string
): Promise<Map<string, { type: string; label: string; details?: string; year?: number }[]>> {
  const prisma = (await import('@/lib/prisma')).default;
  const out = new Map<string, { type: string; label: string; details?: string; year?: number }[]>();

  const rows = await prisma.planningCommitItem.findMany({
    where: { jobId, pretixId: { not: null } },
    select: { tmdbId: true },
    distinct: ['tmdbId'],
  });
  if (rows.length === 0) return out;

  const awards = await prisma.movieAward
    .findMany({ where: { tmdbId: { in: rows.map((r) => r.tmdbId) } } })
    .catch(() => []);

  for (const a of awards) {
    const list = out.get(a.tmdbId) ?? [];
    list.push({
      type: a.type,
      label: a.label,
      ...(a.details ? { details: a.details } : {}),
      ...(a.year != null ? { year: a.year } : {}),
    });
    out.set(a.tmdbId, list);
  }

  return out;
}

// ── Utilità ──────────────────────────────────────────────────────────────────

/**
 * I metadati preparati nella fase 1, ricostruiti dal database.
 *
 * Fra un tick e l'altro non sopravvive niente in memoria, e rifare lo scraping
 * MUBI a ogni lotto sarebbe assurdo. Ma `adminPrepareMetadata` ha già scritto
 * tutto su `MovieOverride`: da lì si rimette insieme lo stesso oggetto che la
 * creazione si aspetta, senza una sola chiamata di rete.
 */
async function loadPreparedMetadata(
  tmdbIds: string[],
  runtimes: Map<string, number>
): Promise<Map<string, unknown>> {
  const prisma = (await import('@/lib/prisma')).default;
  const out = new Map<string, unknown>();
  if (tmdbIds.length === 0) return out;

  const rows = await prisma.movieOverride
    .findMany({ where: { tmdbId: { in: tmdbIds } }, include: { awards: true } })
    .catch(() => []);

  for (const o of rows) {
    // La durata deve arrivare da qualche parte: senza, `adminScheduleMovie`
    // userebbe il suo fallback prudente di 120 minuti, e quel numero finirebbe
    // sia nel `date_to` del sub-evento sia nel calcolo dei conflitti. Se la
    // scheda non ce l'ha, si prende quella che il lavoro si era già scritto
    // all'avvio; e solo se manca pure quella si rinuncia — rinunciare qui vuol
    // dire far rileggere tutto da TMDB, **premi compresi**, e quelli da TMDB
    // non ci sono.
    const runtime = o.runtime ?? runtimes.get(o.tmdbId) ?? 0;
    if (!runtime) continue;
    out.set(o.tmdbId, {
      tmdbId: o.tmdbId,
      title: o.customTitle ?? '',
      overview: o.customOverview ?? '',
      poster_path: o.customPosterPath ?? '',
      backdrop_path: o.customBackdropPath ?? '',
      logo_path: o.customLogoPath ?? '',
      tagline: o.tagline ?? '',
      genres: o.genres ?? [],
      release_date: o.releaseDate ?? '',
      runtime,
      rating: o.customRating || 'T',
      director: o.customDirector ?? '',
      cast: o.customCast ?? '',
      voteAverage: o.voteAverage ?? null,
      awards: o.awards.map((a) => ({
        type: a.type,
        label: a.label,
        details: a.details ?? undefined,
        year: a.year ?? undefined,
      })),
    });
  }

  return out;
}

/** Gli intervalli occupati dal piano stesso, in millisecondi assoluti. */
async function plannedIntervals(
  jobId: string
): Promise<{ key: string; start: number; end: number; title: string; runtime: number }[]> {
  const { toDate } = await import('date-fns-tz');
  const items = await jobItems(jobId);

  return items.map((it) => {
    const start = toDate(`${it.date}T${it.time}`, { timeZone: 'Europe/Rome' }).getTime();
    const runtime = it.runtime || 120;
    return {
      key: it.key,
      start,
      // Come per le voci che arrivano da `getBlockedIntervals`, la fine include
      // già la pausa: un solo confronto copre le pause in entrambi i versi.
      end: start + (runtime + MIN_GAP_MINUTES) * 60000,
      title: it.title ?? 'Spettacolo in programmazione',
      runtime,
    };
  });
}

function stepLabel(batch: CommitItemRow[]): string {
  const first = batch[0];
  const last = batch[batch.length - 1];
  if (batch.length === 1) return `Creo · ${first.title ?? first.tmdbId} · ${first.date} ${first.time}`;
  return `Creo ${batch.length} spettacoli · dal ${first.date} ${first.time} al ${last.date} ${last.time}`;
}

/**
 * Vale la pena riprovare?
 *
 * Un 429 di Pretix o una rete che cade sono inciampi: al giro dopo va. Un
 * conflitto d'orario o un film senza durata sono rifiuti, e riprovarli darebbe
 * tre volte lo stesso esito occupando il posto di qualcos'altro.
 */
function isRetryable(message: string): boolean {
  const m = message.toLowerCase();
  if (m.includes('conflitto') || m.includes('orario non consentito')) return false;
  if (m.includes('non trovato') || m.includes('biglietti venduti')) return false;
  if (m.includes('429') || m.includes('rate limit')) return true;
  if (m.includes('timeout') || m.includes('fetch failed') || m.includes('econn')) return true;
  if (/\b5\d\d\b/.test(m)) return true;
  return true; // nel dubbio si riprova: i tentativi sono comunque contati
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Esegue i lavori a `limit` per volta, fermandosi se il tempo del tick finisce. */
async function runWithConcurrency(
  tasks: (() => Promise<void>)[],
  limit: number,
  deadline: number
): Promise<void> {
  let index = 0;
  const worker = async () => {
    for (;;) {
      if (Date.now() > deadline) return;
      const i = index++;
      if (i >= tasks.length) return;
      await tasks[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}

export { MAX_ATTEMPTS };
