'use server';

/**
 * Azioni del wizard di programmazione.
 *
 * Sono un guscio sottile: tutta la matematica degli orari sta in
 * `services/scheduling`, e qui si fa solo il lavoro che richiede il mondo
 * esterno — leggere la sala da Pretix, i film dal catalogo, scrivere gli
 * spettacoli. Il motore resta puro e testabile perché questo file esiste.
 */

import prisma from '@/lib/prisma';
import { listSubEvents } from '@/services/pretix';
import { getMovieDetails } from '@/services/tmdb';
import {
  buildSchedule,
  snapShowTo,
  type BuildScheduleInput,
  type Interval,
  type ScheduledShow,
} from '@/services/scheduling/engine';
import {
  CLOSING_MINUTE,
  MINUTES_PER_DAY,
  MIN_GAP_MINUTES,
  OPENING_MINUTE,
  addDaysISO,
  formatClock,
  isWeekend,
  type Band,
} from '@/services/scheduling/times';
import {
  estimateFreeSlots,
  summarizeDay,
  type FreeGap,
} from '@/services/scheduling/occupancy';
import { msToGlobalMinute, romeClock, todayInRome } from '@/services/scheduling/rome';
import { getJob, type CommitJob } from '@/services/scheduling/commitJobs';
import { startCommit, type CommitInput } from '@/services/scheduling/commitRunner';

export interface ExistingShow {
  pretixId: number | null;
  title: string;
  /** 'HH:mm' d'inizio. */
  time: string;
  /** 'HH:mm' di fine film. */
  endTime: string;
  runtime: number;
  startMinute: number;
  endMinute: number;
}

// `FreeGap` non viene ri-esportato da qui: in un file `'use server'` ogni
// export diventa un riferimento registrato a runtime, e un tipo a runtime non
// esiste. Chi ne ha bisogno lo importa da `services/scheduling/occupancy`.

export interface DayOccupancy {
  /** Giorno di programmazione (una proiezione delle 00:30 appartiene alla sera prima). */
  date: string;
  weekday: string;
  isWeekend: boolean;
  isPast: boolean;
  shows: ExistingShow[];
  busyMinutes: number;
  /** 0 = giornata vuota, 1 = piena. */
  saturation: number;
  gaps: FreeGap[];
}

export interface PeriodOccupancy {
  startDate: string;
  days: number;
  daysDetail: DayOccupancy[];
  totalShows: number;
  /** Quanti spettacoli tipici (110′ + pausa) entrerebbero ancora nel periodo. */
  freeSlotsEstimate: number;
  /** Generi già in cartellone nel periodo: servono alla corsia "Consigliati". */
  genresInSchedule: string[];
  /** Occupazione grezza, per rialimentare il motore senza rileggere Pretix. */
  occupied: Interval[];
}

/**
 * Durata di una proiezione già esistente, dalla fonte più affidabile alla più
 * debole. Non si interroga TMDB: sarebbe una chiamata di rete per spettacolo, e
 * il wizard deve aprirsi subito. Nel peggiore dei casi si usano 120 minuti, che
 * è prudente perché più lungo del film medio.
 */
function runtimeOfSubEvent(e: Record<string, unknown>, fallbackFromDb?: number | null): number {
  const comment = e.comment;
  if (typeof comment === 'string') {
    try {
      const meta = JSON.parse(comment);
      if (Number.isFinite(meta?.runtime) && meta.runtime > 0) return meta.runtime;
    } catch {
      /* commento non JSON: si prosegue */
    }
  }
  if (fallbackFromDb && fallbackFromDb > 0) return fallbackFromDb;

  const from = e.date_from ? new Date(e.date_from as string).getTime() : null;
  const to = e.date_to ? new Date(e.date_to as string).getTime() : null;
  if (from && to && to > from) return Math.round((to - from) / 60000);

  return 120;
}

/**
 * Le proiezioni già presenti in una sala, lette da Pretix e riportate sull'asse
 * dei minuti globali del motore.
 */
async function readRoomOccupancy(
  seatingPlanId: number,
  windowStart: string,
  days: number
): Promise<{ shows: (ExistingShow & { dayIndex: number; tmdbId: string | null })[]; occupied: Interval[] }> {
  const events = await listSubEvents(true);
  const runtimeByTmdb = new Map<string, number>();
  const overrides = await prisma.movieOverride.findMany({
    where: { runtime: { not: null } },
    select: { tmdbId: true, runtime: true },
  });
  for (const o of overrides) runtimeByTmdb.set(o.tmdbId, o.runtime!);

  const windowEnd = days * MINUTES_PER_DAY + CLOSING_MINUTE;
  const shows: (ExistingShow & { dayIndex: number; tmdbId: string | null })[] = [];
  const occupied: Interval[] = [];

  for (const raw of events as Record<string, unknown>[]) {
    if (raw.active !== true) continue;
    if (Number(raw.seating_plan) !== seatingPlanId) continue;
    if (!raw.date_from) continue;

    const startMs = new Date(raw.date_from as string).getTime();
    if (!Number.isFinite(startMs)) continue;

    let tmdbId: string | null = null;
    if (typeof raw.comment === 'string') {
      try {
        tmdbId = JSON.parse(raw.comment)?.tmdbId ?? null;
      } catch { /* ignora */ }
    }

    const runtime = runtimeOfSubEvent(raw, tmdbId ? runtimeByTmdb.get(tmdbId) : null);
    const startMinute = msToGlobalMinute(startMs, windowStart);
    const endMinute = startMinute + runtime;

    // Ogni intervallo occupa [inizio, fine + pausa]: è la stessa convenzione del
    // motore, così un solo controllo di sovrapposizione garantisce la pausa in
    // entrambe le direzioni.
    if (endMinute + MIN_GAP_MINUTES > -MINUTES_PER_DAY && startMinute < windowEnd + MINUTES_PER_DAY) {
      occupied.push({ start: startMinute, end: endMinute + MIN_GAP_MINUTES });
    }

    // Il giorno di *programmazione*: una proiezione delle 00:30 appartiene alla
    // serata precedente, ed è lì che l'utente si aspetta di vederla.
    const calendarDay = Math.floor(startMinute / MINUTES_PER_DAY);
    const inDay = startMinute - calendarDay * MINUTES_PER_DAY;
    const dayIndex = inDay < OPENING_MINUTE ? calendarDay - 1 : calendarDay;

    const nameField = raw.name as { it?: string } | string | undefined;
    const title =
      (typeof nameField === 'object' && nameField?.it) ||
      (typeof nameField === 'string' ? nameField : '') ||
      'Senza titolo';

    shows.push({
      pretixId: Number.isFinite(Number(raw.id)) ? Number(raw.id) : null,
      title,
      time: formatClock(startMinute),
      endTime: formatClock(endMinute),
      runtime,
      startMinute,
      endMinute,
      dayIndex,
      tmdbId,
    });
  }

  return { shows, occupied };
}

/** Le sale disponibili, con il nome interno che usi in admin. */
export async function planningGetRooms() {
  const { adminGetSeatingPlans } = await import('@/actions/adminActions');
  const plans = await adminGetSeatingPlans();
  return (plans as Record<string, unknown>[]).map((p) => ({
    id: Number(p.id),
    name: String(p.internalName || p.name || `Sala ${p.id}`),
    isFavorite: Boolean(p.isFavorite),
  }));
}

/**
 * PASSO 1 DEL WIZARD — che aria tira in sala nei giorni che stai considerando.
 *
 * Mostrare le proiezioni già presenti *prima* di scegliere i film è ciò che
 * rende possibile la corsia "Perfetti per questo slot": senza sapere dove sono
 * i buchi, non si può sapere quali durate ci incastrano.
 */
export async function planningGetPeriodOccupancy(
  seatingPlanId: number,
  startDate: string,
  days: number
): Promise<PeriodOccupancy> {
  const dayCount = Math.min(Math.max(Math.trunc(days), 1), 30);
  const { shows, occupied } = await readRoomOccupancy(seatingPlanId, startDate, dayCount);
  const today = todayInRome();

  const daysDetail: DayOccupancy[] = [];
  const tmdbIdsInPeriod = new Set<string>();

  for (let d = 0; d < dayCount; d++) {
    const date = addDaysISO(startDate, d);

    const dayShows = shows
      .filter((s) => s.dayIndex === d)
      .sort((a, b) => a.startMinute - b.startMinute);
    dayShows.forEach((s) => { if (s.tmdbId) tmdbIdsInPeriod.add(s.tmdbId); });

    // La saturazione e i buchi li calcola il modulo puro, quello che ha i test.
    const summary = summarizeDay(
      dayShows.map((s) => ({ start: s.startMinute, end: s.endMinute + MIN_GAP_MINUTES })),
      d
    );

    daysDetail.push({
      date,
      weekday: new Date(`${date}T12:00:00Z`).toLocaleDateString('it-IT', { weekday: 'long', timeZone: 'UTC' }),
      isWeekend: isWeekend(date),
      isPast: date < today,
      shows: dayShows.map(({ dayIndex: _d, tmdbId: _t, ...rest }) => rest),
      busyMinutes: summary.busyMinutes,
      saturation: summary.saturation,
      gaps: summary.gaps,
    });
  }

  const freeSlotsEstimate = daysDetail.reduce((sum, d) => sum + estimateFreeSlots(d.gaps), 0);

  const genresInSchedule = tmdbIdsInPeriod.size
    ? [
        ...new Set(
          (
            await prisma.catalogFilm.findMany({
              where: { tmdbId: { in: [...tmdbIdsInPeriod] } },
              select: { genres: true },
            })
          ).flatMap((f) => f.genres)
        ),
      ]
    : [];

  return {
    startDate,
    days: dayCount,
    daysDetail,
    totalShows: shows.filter((s) => s.dayIndex >= 0 && s.dayIndex < dayCount).length,
    freeSlotsEstimate,
    genresInSchedule,
    occupied,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PASSO 3 — GENERAZIONE DEL CALENDARIO
// ═══════════════════════════════════════════════════════════════════════════

export interface PlanningFilmChoice {
  tmdbId: string;
  replicas?: number;
  preferredBand?: Band;
}

export interface PlanningGenerateInput {
  seatingPlanId: number;
  startDate: string;
  days: number;
  films: PlanningFilmChoice[];
  intensity?: BuildScheduleInput['intensity'];
  seed?: number;
  /** Spettacoli che l'utente ha bloccato: il ricalcolo non li tocca. */
  locked?: ScheduledShow[];
}

/**
 * Dati di un film necessari sia al piano sia alla creazione su Pretix.
 * Titolo, lingua e sottotitoli seguono le stesse regole del planner attuale,
 * così gli spettacoli creati dal wizard sono indistinguibili dagli altri.
 */
export interface PlanningFilmInfo {
  tmdbId: string;
  title: string;
  overview: string;
  posterPath: string;
  runtime: number;
  language: string;
  subtitles: string;
  versionLanguage: string;
}

async function loadFilmInfo(tmdbIds: string[]): Promise<Map<string, PlanningFilmInfo>> {
  const { getLanguageName } = await import('@/services/tmdb.utils');
  const unique = [...new Set(tmdbIds)];

  const overrides = await prisma.movieOverride.findMany({
    where: { tmdbId: { in: unique } },
  });
  const overrideById = new Map(overrides.map((o) => [o.tmdbId, o]));

  const out = new Map<string, PlanningFilmInfo>();
  const details = await Promise.all(unique.map((id) => getMovieDetails(id).catch(() => null)));

  unique.forEach((tmdbId, i) => {
    const d = details[i];
    if (!d) return;
    const ov = overrideById.get(tmdbId);
    const isItalian = d.original_language === 'it';
    out.set(tmdbId, {
      tmdbId,
      title: ov?.customTitle || d.title,
      overview: ov?.customOverview || d.overview || '',
      posterPath: ov?.customPosterPath || d.poster_path || '',
      runtime: ov?.runtime || d.runtime || 0,
      language: ov?.versionLanguage || (isItalian ? 'Italiano' : getLanguageName(d.original_language)),
      subtitles: ov?.subtitles || (isItalian ? 'Nessuno' : 'Italiano'),
      versionLanguage: ov?.customVersion || 'Versione Originale' + (isItalian ? '' : ' Sottotitolata'),
    });
  });

  return out;
}

export interface PlanningGenerateResult {
  shows: (ScheduledShow & { posterPath?: string })[];
  warnings: string[];
  stats: { shows: number; films: number; daysUsed: number; slotsOffered: number; slotsFilled: number };
  filmInfo: PlanningFilmInfo[];
  seed: number;
  /** Occupazione preesistente, per ridisegnare il calendario senza rileggere Pretix. */
  existing: DayOccupancy[];
}

/**
 * Genera il calendario. È la **stessa funzione** usata a ogni ricalcolo: quando
 * cambi le repliche o trascini uno spettacolo, la UI ricostruisce `locked` e
 * richiama questa. Non esistono percorsi alternativi, quindi ciò che vedi in
 * anteprima è per costruzione ciò che verrà creato.
 */
export async function planningGenerate(input: PlanningGenerateInput): Promise<PlanningGenerateResult> {
  const days = Math.min(Math.max(Math.trunc(input.days), 1), 30);
  const seed = input.seed ?? Math.floor(Math.random() * 1_000_000);

  const occupancy = await planningGetPeriodOccupancy(input.seatingPlanId, input.startDate, days);
  const info = await loadFilmInfo(input.films.map((f) => f.tmdbId));

  const warnings: string[] = [];
  const films = input.films
    .map((choice) => {
      const meta = info.get(choice.tmdbId);
      if (!meta) {
        warnings.push(`Film TMDB ${choice.tmdbId}: dettagli non trovati, escluso dal piano.`);
        return null;
      }
      return {
        tmdbId: choice.tmdbId,
        title: meta.title,
        runtime: meta.runtime,
        posterPath: meta.posterPath,
        replicas: choice.replicas,
        preferredBand: choice.preferredBand,
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  // Mai programmare nel passato: il margine di mezz'ora evita anche gli
  // spettacoli che inizierebbero fra cinque minuti.
  const notBefore = msToGlobalMinute(Date.now() + 30 * 60000, input.startDate);

  const result = buildSchedule({
    window: { startDate: input.startDate, days },
    films,
    occupied: occupancy.occupied,
    locked: input.locked,
    intensity: input.intensity,
    seed,
    notBefore,
  });

  return {
    shows: result.shows,
    warnings: [...warnings, ...result.warnings],
    stats: result.stats,
    filmInfo: [...info.values()],
    seed,
    existing: occupancy.daysDetail,
  };
}

/**
 * Sposta uno spettacolo dove l'hai trascinato, agganciandolo all'orario elegante
 * libero più vicino. La UI propone una posizione grezza, il motore decide
 * quella legale — così anche il trascinamento passa dalle stesse regole.
 */
export async function planningSnapShow(
  show: ScheduledShow,
  desiredStartMinute: number,
  context: { seatingPlanId: number; startDate: string; days: number; otherShows: ScheduledShow[] }
): Promise<{ show: ScheduledShow | null; reason?: string }> {
  const occupancy = await planningGetPeriodOccupancy(
    context.seatingPlanId,
    context.startDate,
    context.days
  );

  const occupied: Interval[] = [
    ...occupancy.occupied,
    ...context.otherShows
      .filter((s) => !(s.tmdbId === show.tmdbId && s.startMinute === show.startMinute))
      .map((s) => ({ start: s.startMinute, end: s.endMinute + MIN_GAP_MINUTES })),
  ];

  const moved = snapShowTo(show, desiredStartMinute, {
    occupied,
    notBefore: msToGlobalMinute(Date.now() + 30 * 60000, context.startDate),
  });

  return moved
    ? { show: moved }
    : { show: null, reason: 'Qui non c\'è spazio: la sala è occupata o si uscirebbe dagli orari di apertura.' };
}

/** I dati dei film necessari alla creazione, per chi non li ha già. */
export async function planningGetFilmInfo(tmdbIds: string[]): Promise<PlanningFilmInfo[]> {
  return [...(await loadFilmInfo(tmdbIds)).values()];
}

// ═══════════════════════════════════════════════════════════════════════════
// PASSO 4 — LA CREAZIONE
// Asincrona: creare trenta spettacoli richiede minuti, più di quanto possa
// durare una singola richiesta. Si avvia e si segue.
// ═══════════════════════════════════════════════════════════════════════════

/** Avvia la creazione degli spettacoli e restituisce l'id del lavoro. */
export async function planningCommitStart(input: CommitInput): Promise<{ jobId: string }> {
  return { jobId: startCommit(input) };
}

/** Come sta andando il lavoro. `null` se non lo conosciamo (vedi `commitJobs`). */
export async function planningCommitStatus(jobId: string): Promise<CommitJob | null> {
  return getJob(jobId);
}

/** Il primo giorno programmabile: oggi, se non è già troppo tardi. */
export async function planningDefaultStartDate(): Promise<string> {
  const now = new Date();
  const clock = romeClock(now);
  const [h] = clock.split(':').map(Number);
  // Dopo le 22:00 proporre "oggi" non ha senso: resterebbe un'ora di sala.
  return h >= 22 ? addDaysISO(todayInRome(), 1) : todayInRome();
}
