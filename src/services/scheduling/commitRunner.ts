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
  const { planningGetFilmInfo } = await import('@/actions/planningActions');

  const shows = [...input.shows].sort((a, b) =>
    `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)
  );
  const uniqueIds = [...new Set(shows.map((s) => s.tmdbId))];

  updateJob(jobId, { state: 'running', step: 'Preparo i metadati' });

  const info = new Map((await planningGetFilmInfo(uniqueIds)).map((f) => [f.tmdbId, f]));
  let done = 0;

  // ── 1. Metadati arricchiti e premi MUBI, una volta per film ────────────────
  const meta: Record<string, unknown> = {};
  for (const tmdbId of uniqueIds) {
    const title = info.get(tmdbId)?.title ?? tmdbId;
    updateJob(jobId, { step: `Metadati e premi · ${title}`, done });
    try {
      meta[tmdbId] = await adminPrepareMetadata(tmdbId);
    } catch (err) {
      console.error('[commitRunner] metadati', tmdbId, err);
      meta[tmdbId] = null;
    }
    done++;
  }

  // ── 2. Creazione, uno alla volta ──────────────────────────────────────────
  const created: number[] = [];
  const errors: CommitError[] = [];

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
      meta[s.tmdbId] ?? undefined
    );

    if (res.success && res.subeventId) created.push(res.subeventId);
    else errors.push({ key: showKeyOf(s), label, error: res.error || 'errore sconosciuto' });

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
