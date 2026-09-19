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
import { countSoldTickets, listSubEvents } from '@/services/pretix';
import { getMovieDetails } from '@/services/tmdb';
import {
  buildSchedule,
  plannedCapacity,
  snapShowTo,
  type BuildScheduleInput,
  type Interval,
  type ScheduledShow,
} from '@/services/scheduling/engine';
import { autoPick, bandAffinity, type AutoPickFilm } from '@/services/scheduling/autoPick';
import {
  CLOSING_MINUTE,
  MINUTES_PER_DAY,
  MIN_GAP_MINUTES,
  OPENING_MINUTE,
  addDaysISO,
  daysBetweenISO,
  formatClock,
  globalMinuteOf,
  isWeekend,
  type Band,
} from '@/services/scheduling/times';
import {
  estimateFreeSlots,
  summarizeDay,
  type FreeGap,
} from '@/services/scheduling/occupancy';
import { checkSlot, findFreeSlots, SLOTS_PER_DAY } from '@/services/scheduling/freeSlots';
import { msToGlobalMinute, romeClock, todayInRome } from '@/services/scheduling/rome';
import { findOpenJob, getJob, type CommitJob } from '@/services/scheduling/commitJobs';
import { retryCommit, startCommit, tickCommit, type CommitInput } from '@/services/scheduling/commitRunner';

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
  /**
   * Che film è, quando si riesce a saperlo: sta nel `comment` del sub-evento
   * Pretix, e c'è solo per gli spettacoli nati da qui.
   *
   * Senza questo, uno spettacolo già in sala è solo un titolo: si può
   * eliminare, ma non **spostare** — spostarlo vuol dire ricrearlo altrove, e
   * per ricrearlo bisogna sapere quale film è. Indovinarlo dal titolo è
   * esattamente il modo di programmare l'omonimo sbagliato.
   *
   * `null` per ciò che è stato creato fuori dalla programmazione: l'app deve
   * trattarlo come «questo non lo posso spostare», non come un errore.
   */
  tmdbId?: string | null;
  /**
   * Poster dal catalogo, quando il film c'è.
   *
   * Non è una chiamata a TMDB per spettacolo: lo riempie chi legge già il
   * catalogo per altri motivi — `planningGetPeriodOccupancy` lo fa per i generi
   * del periodo. Dove nessuno lo riempie resta assente, ed è giusto così: una
   * lista di orari non ha bisogno delle locandine.
   */
  posterPath?: string | null;
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

  // Gli spettacoli della finestra si conoscono già tutti: raccogliere qui i
  // film permette di leggere il catalogo **una volta**, prima del giro sui
  // giorni, e di appoggiare il poster su ogni proiezione mentre la si scrive.
  const inWindow = shows.filter((s) => s.dayIndex >= 0 && s.dayIndex < dayCount);
  const tmdbIdsInPeriod = new Set(
    inWindow.map((s) => s.tmdbId).filter((v): v is string => Boolean(v))
  );

  const catalogRows = tmdbIdsInPeriod.size
    ? await prisma.catalogFilm.findMany({
        where: { tmdbId: { in: [...tmdbIdsInPeriod] } },
        select: { tmdbId: true, genres: true, posterPath: true },
      })
    : [];
  const posterByTmdb = new Map(
    catalogRows.filter((f) => f.tmdbId).map((f) => [f.tmdbId!, f.posterPath ?? null])
  );

  for (let d = 0; d < dayCount; d++) {
    const date = addDaysISO(startDate, d);

    const dayShows = shows
      .filter((s) => s.dayIndex === d)
      .sort((a, b) => a.startMinute - b.startMinute);

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
      // `tmdbId` resta: è ciò che permette a un client di spostare uno
      // spettacolo già in sala invece di poterlo solo cancellare. `dayIndex`
      // no — è l'indice interno della finestra, e fuori di qui non vuol dire
      // niente.
      shows: dayShows.map(({ dayIndex: _d, ...rest }) => ({
        ...rest,
        posterPath: rest.tmdbId ? posterByTmdb.get(rest.tmdbId) ?? null : null,
      })),
      busyMinutes: summary.busyMinutes,
      saturation: summary.saturation,
      gaps: summary.gaps,
    });
  }

  const freeSlotsEstimate = daysDetail.reduce((sum, d) => sum + estimateFreeSlots(d.gaps), 0);
  const genresInSchedule = [...new Set(catalogRows.flatMap((f) => f.genres))];

  return {
    startDate,
    days: dayCount,
    daysDetail,
    totalShows: inWindow.length,
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

// ═══════════════════════════════════════════════════════════════════════════
// AUTOPROGRAMMAZIONE — il piano che c'è già quando arrivi
//
// Il wizard chiedeva di spuntare venti titoli prima di mostrare un solo orario,
// ed era lì che se ne andavano le ore. Qui la scelta la fa il sistema: si legge
// il catalogo in libreria, si guarda quanto spazio c'è, e si arriva al
// calendario con la settimana già scritta. Da quel momento in poi il lavoro è
// solo togliere ciò che non piace — che è veloce, perché si giudica qualcosa
// invece di inventarlo.
// ═══════════════════════════════════════════════════════════════════════════

/** Un film del catalogo come lo mostra il wizard. */
export interface PlanningCatalogFilm {
  id: number;
  title: string;
  year: number | null;
  durationMin: number | null;
  runtime: number | null;
  director: string | null;
  tmdbId: string | null;
  posterPath: string | null;
  genres: string[];
  voteAverage: number | null;
  /** Quanti voti ci sono dietro la media: un 8,4 con quaranta voti non è un 8,4. */
  voteCount: number | null;
  awardLabels: string[];
  inPlex: boolean;
  plexLibraries: string[];
  verifyStatus: string;
  scheduledCount: number;
  /** Quando è entrato in libreria, in millisecondi. Le novità pesano di più. */
  addedAt: number | null;
}

export interface PlanningAutoPlanInput {
  seatingPlanId: number;
  startDate: string;
  days: number;
  intensity?: BuildScheduleInput['intensity'];
  seed?: number;
  /** Film che l'utente ha già approvato e vuole rivedere nel piano. */
  keep?: string[];
  /** Film scartati: non devono ripresentarsi a ogni rigenerazione. */
  exclude?: string[];
}

export interface PlanningAutoPlanResult extends PlanningGenerateResult {
  /** I film scelti, con la ragione per cui sono stati scelti. */
  chosen: {
    film: PlanningCatalogFilm;
    preferredBand: Band;
    replicas: number;
    reason: string;
  }[];
}

/**
 * Il catalogo utilizzabile per programmare: solo ciò che è davvero in libreria.
 *
 * `inPlex` è il filtro che conta. Proporre un film che non hai più in libreria
 * significa scoprirlo la sera della proiezione, ed è il tipo di errore che non
 * si recupera.
 */
async function usableCatalog(limit = 1200): Promise<PlanningCatalogFilm[]> {
  // Le colonne si elencano: senza `select` arriverebbero anche `overview` e
  // `backdropPath` per milleduecento righe, cioè un megabyte buttato addosso a
  // un pannello che mostra dodici locandine.
  const rows = await prisma.catalogFilm.findMany({
    where: {
      inPlex: true,
      tmdbId: { not: null },
      verifyStatus: { not: 'missing' },
      OR: [{ runtime: { gt: 0 } }, { durationMin: { gt: 0 } }],
    },
    select: {
      id: true, title: true, tmdbTitle: true, year: true, durationMin: true, runtime: true,
      director: true, tmdbId: true, posterPath: true, genres: true, voteAverage: true,
      voteCount: true, awardLabels: true, inPlex: true, plexLibraries: true,
      verifyStatus: true, addedAt: true,
    },
    orderBy: [{ voteCount: 'desc' }, { id: 'asc' }],
    take: limit,
  });

  const tmdbIds = rows.map((f) => f.tmdbId).filter((v): v is string => Boolean(v));
  const grouped = tmdbIds.length
    ? await prisma.pretixSync.groupBy({
        by: ['tmdbId'],
        where: { tmdbId: { in: tmdbIds } },
        _count: { _all: true },
      })
    : [];
  const countMap = new Map(grouped.map((g) => [g.tmdbId, g._count._all]));

  return rows.map((f) => ({
    id: f.id,
    title: f.tmdbTitle || f.title,
    year: f.year,
    durationMin: f.durationMin,
    runtime: f.runtime,
    director: f.director,
    tmdbId: f.tmdbId,
    posterPath: f.posterPath,
    genres: f.genres,
    voteAverage: f.voteAverage,
    voteCount: f.voteCount,
    awardLabels: f.awardLabels,
    inPlex: f.inPlex,
    plexLibraries: f.plexLibraries,
    verifyStatus: f.verifyStatus,
    scheduledCount: f.tmdbId ? countMap.get(f.tmdbId) ?? 0 : 0,
    addedAt: f.addedAt?.getTime() ?? null,
  }));
}

/** Da riga di catalogo a candidato per il selettore. */
function toCandidate(f: PlanningCatalogFilm): AutoPickFilm {
  return {
    tmdbId: f.tmdbId!,
    title: f.title,
    runtime: f.runtime ?? f.durationMin ?? 0,
    genres: f.genres,
    year: f.year,
    voteAverage: f.voteAverage,
    voteCount: f.voteCount,
    awardLabels: f.awardLabels,
    addedAt: f.addedAt,
    scheduledCount: f.scheduledCount,
    posterPath: f.posterPath,
    director: f.director,
  };
}

/**
 * Costruisce una programmazione completa senza chiedere niente.
 *
 * Due passaggi, entrambi puri e testati: `autoPick` decide **chi** va in sala e
 * in che fascia, `buildSchedule` decide **quando**. Sono separati apposta —
 * cambiare film non deve rimettere in discussione gli orari, e spostare un
 * orario non deve rimettere in discussione i film.
 */
export async function planningAutoPlan(
  input: PlanningAutoPlanInput
): Promise<PlanningAutoPlanResult> {
  const days = Math.min(Math.max(Math.trunc(input.days), 1), 30);
  const seed = input.seed ?? Math.floor(Math.random() * 1_000_000);
  const intensity = input.intensity ?? 'normal';

  const [occupancy, catalog] = await Promise.all([
    planningGetPeriodOccupancy(input.seatingPlanId, input.startDate, days),
    usableCatalog(),
  ]);

  // Quanto spazio c'è davvero: il ritmo scelto, meno ciò che è già in sala.
  const capacity = Math.min(
    plannedCapacity(input.startDate, days, intensity, occupancy.totalShows),
    // Non ha senso proporre più spettacoli di quanti buchi esistano: la sala
    // potrebbe essere già mezza piena, e il motore li scarterebbe uno a uno.
    Math.max(occupancy.freeSlotsEstimate, 1)
  );

  const picked = autoPick({
    pool: catalog.filter((f) => f.tmdbId).map(toCandidate),
    capacity,
    seed,
    keep: input.keep,
    exclude: input.exclude,
    genresInSchedule: occupancy.genresInSchedule,
  });

  const byId = new Map(catalog.map((f) => [f.tmdbId!, f]));

  const plan = await planningGenerate({
    seatingPlanId: input.seatingPlanId,
    startDate: input.startDate,
    days,
    intensity,
    seed,
    films: picked.films.map((f) => ({
      tmdbId: f.tmdbId,
      replicas: f.replicas,
      preferredBand: f.preferredBand,
    })),
  });

  return {
    ...plan,
    warnings: [...picked.warnings, ...plan.warnings],
    chosen: picked.films
      .map((f) => {
        const film = byId.get(f.tmdbId);
        if (!film) return null;
        return { film, preferredBand: f.preferredBand, replicas: f.replicas, reason: f.reason };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
  };
}

/**
 * I film che potrebbero prendere il posto di questo, in questo slot.
 *
 * È il cuore del cambio in due clic: si chiede cosa ci sta *qui*, non cosa c'è
 * in catalogo. Quindi la durata deve incastrarsi nello spazio disponibile — o
 * il sostituto andrebbe a sbattere contro lo spettacolo dopo — e l'affinità con
 * la fascia decide l'ordine, perché alle 22:30 e alle 10:30 non serve la stessa
 * lista.
 */
export async function planningAlternatives(input: {
  /** Fascia dello slot da riempire. */
  band: Band;
  /** Quanto dura al massimo il film che ci sta, pausa esclusa. */
  maxRuntime: number;
  /** Film già nel piano: non si ripropongono, o si finirebbe a duplicare. */
  exclude?: string[];
  /** Quanti proporne. */
  count?: number;
  /** Cambia il seed per vederne altri senza cambiare nient'altro. */
  seed?: number;
}): Promise<PlanningCatalogFilm[]> {
  const count = Math.min(Math.max(Math.trunc(input.count ?? 8), 1), 40);
  const maxRuntime = Math.max(Math.trunc(input.maxRuntime), 30);
  const excluded = new Set(input.exclude ?? []);
  const now = Date.now();

  const catalog = await usableCatalog();

  // Un pizzico di caso, fisso per film: chiedere "altri" deve dare altri, ma
  // senza stravolgere l'ordine di merito.
  const salt = (input.seed ?? 0) + 1;
  const jitter = (id: string) => {
    let h = salt >>> 0;
    for (let i = 0; i < id.length; i++) h = (Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0);
    return (h % 1000) / 1000;
  };

  return catalog
    .filter((f) => {
      if (!f.tmdbId || excluded.has(f.tmdbId)) return false;
      const runtime = f.runtime ?? f.durationMin ?? 0;
      return runtime > 0 && runtime <= maxRuntime;
    })
    .map((f) => ({
      film: f,
      score:
        bandAffinity(toCandidate(f), input.band, now) +
        jitter(f.tmdbId!) * 1.2,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((x) => x.film);
}

/**
 * Il tabellone: cento film pescati dalla libreria, da guardare e sfoltire.
 *
 * `keep` sono quelli che hai già scelto e restano in cima a ogni ricarica: è
 * ciò che permette di fare più giri — guardo cento titoli, ne tengo sei,
 * aggiorno, ne tengo altri quattro — senza ricominciare ogni volta da zero.
 */
export async function planningCatalogBoard(input: {
  count?: number;
  seed?: number;
  keep?: string[];
  exclude?: string[];
  /** Solo film mai programmati. */
  onlyNever?: boolean;
  search?: string;
} = {}): Promise<PlanningCatalogFilm[]> {
  const count = Math.min(Math.max(Math.trunc(input.count ?? 100), 1), 200);
  const keep = new Set(input.keep ?? []);
  const excluded = new Set(input.exclude ?? []);
  const search = input.search?.trim().toLowerCase();

  const catalog = await usableCatalog();

  const eligible = catalog.filter((f) => {
    if (!f.tmdbId || excluded.has(f.tmdbId)) return false;
    if (input.onlyNever && f.scheduledCount > 0) return false;
    if (search) {
      const hay = `${f.title} ${f.director ?? ''}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  const chosen = eligible.filter((f) => keep.has(f.tmdbId!));
  const rest = eligible.filter((f) => !keep.has(f.tmdbId!));

  // Mescolata riproducibile: lo stesso seed ridà lo stesso tabellone, così
  // ricaricare la pagina non fa sparire i film che stavi guardando.
  const seed = (input.seed ?? 1) >>> 0;
  let a = seed;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }

  return [...chosen, ...rest].slice(0, Math.max(count, chosen.length));
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
// PROGRAMMAZIONE AL CONTRARIO — prima il film, poi gli orari
//
// Il percorso normale parte dal periodo e chiede al motore di riempirlo. Qui si
// parte dal film e si chiede dove ci sta: si scandiscono i giorni a partire da
// oggi e si tengono solo quelli che hanno spazio davvero, il più vicino per
// primo. Le regole di orario sono le stesse del motore — stanno in
// `scheduling/freeSlots`, che le prende in prestito da `engine` — così un
// orario proposto qui è per costruzione un orario che il motore accetterà.
// ═══════════════════════════════════════════════════════════════════════════

/** Un orario libero in cui il film scelto potrebbe entrare. */
export interface SlotProposal {
  /** Giorno di programmazione: le 00:30 appartengono alla serata precedente. */
  day: string;
  /** Data di calendario da mandare a Pretix (dopo la mezzanotte è `day` + 1). */
  date: string;
  time: string;
  endTime: string;
  /** Minuto globale, riferito a `fromDate`. */
  startMinute: number;
  endMinute: number;
  band: Band;
}

export interface SlotDay {
  /** Giorno di programmazione. */
  day: string;
  weekday: string;
  isWeekend: boolean;
  /** Quanto è già piena la giornata: 0 vuota, 1 piena. */
  saturation: number;
  /** Cosa c'è già in sala quel giorno, per capire dove si incastra la proposta. */
  existing: ExistingShow[];
  slots: SlotProposal[];
}

export interface PlanningFindSlotsResult {
  /** `null` se TMDB non conosce il film o non ne conosce la durata. */
  film: PlanningFilmInfo | null;
  /** Origine della scansione, e quindi dei minuti globali qui dentro. */
  fromDate: string;
  /** Solo i giorni che hanno almeno un orario libero, dal più vicino. */
  days: SlotDay[];
  /** Quanti giorni sono stati guardati per trovarli. */
  scannedDays: number;
  /** Fin dove ci si era spinti a guardare. */
  horizonDays: number;
  /** Perché non c'è nessuna proposta, quando non ce n'è. */
  reason?: string;
}

export interface PlanningFindSlotsInput {
  seatingPlanId: number;
  tmdbId: string;
  /** Da quando cercare. Default: il primo giorno programmabile. */
  fromDate?: string;
  /** Quanti giorni *con spazio* restituire. */
  maxDays?: number;
  /** Fin dove spingersi a cercarli. */
  horizonDays?: number;
  /** Quanti orari proporre per giornata. */
  perDay?: number;
  /** Solo orari in questa fascia. */
  band?: Band;
}

const clampInt = (v: number, lo: number, hi: number) => Math.min(Math.max(Math.trunc(v), lo), hi);

/**
 * Gli orari liberi per un film, giorno per giorno, dal più vicino a oggi.
 *
 * Si ferma appena ha trovato `maxDays` giornate con spazio: cercarne trenta
 * quando ne servono sette sarebbe lavoro buttato, e la risposta deve arrivare
 * mentre l'utente guarda la schermata. I giorni pieni vengono saltati in
 * silenzio — è esattamente ciò che si vuole vedere: solo dove si può andare.
 */
export async function planningFindSlots(
  input: PlanningFindSlotsInput
): Promise<PlanningFindSlotsResult> {
  const fromDate = input.fromDate || (await planningDefaultStartDate());
  const horizonDays = clampInt(input.horizonDays ?? 21, 1, 60);
  const maxDays = clampInt(input.maxDays ?? 7, 1, 30);
  const perDay = clampInt(input.perDay ?? SLOTS_PER_DAY, 1, 12);

  const film = (await loadFilmInfo([input.tmdbId])).get(input.tmdbId) ?? null;
  const empty = (reason: string): PlanningFindSlotsResult => ({
    film,
    fromDate,
    days: [],
    scannedDays: 0,
    horizonDays,
    reason,
  });

  if (!film) return empty('Questo film non risulta su TMDB.');
  if (!film.runtime || film.runtime <= 0) {
    return empty(`Di «${film.title}» non si conosce la durata: senza, non so quanto spazio serve.`);
  }

  // Una lettura sola della sala per tutta la finestra: leggerla giorno per
  // giorno significherebbe una chiamata a Pretix per giornata scandita.
  const { shows, occupied } = await readRoomOccupancy(input.seatingPlanId, fromDate, horizonDays);
  const notBefore = msToGlobalMinute(Date.now() + 30 * 60000, fromDate);

  const days: SlotDay[] = [];
  let scannedDays = 0;

  for (let d = 0; d < horizonDays && days.length < maxDays; d++) {
    scannedDays = d + 1;

    const slots = findFreeSlots({
      runtime: film.runtime,
      dayIndex: d,
      occupied,
      notBefore,
      band: input.band,
      limit: perDay,
    });
    if (slots.length === 0) continue;

    const day = addDaysISO(fromDate, d);
    const dayShows = shows
      .filter((s) => s.dayIndex === d)
      .sort((a, b) => a.startMinute - b.startMinute);
    const summary = summarizeDay(
      dayShows.map((s) => ({ start: s.startMinute, end: s.endMinute + MIN_GAP_MINUTES })),
      d
    );

    days.push({
      day,
      weekday: new Date(`${day}T12:00:00Z`).toLocaleDateString('it-IT', { weekday: 'long', timeZone: 'UTC' }),
      isWeekend: isWeekend(day),
      saturation: summary.saturation,
      // Come in `/occupancy`: `tmdbId` resta, `dayIndex` no. Vedi `ExistingShow`.
      existing: dayShows.map(({ dayIndex: _d, ...rest }) => rest),
      slots: slots.map((s) => ({
        day,
        // Uno spettacolo che comincia dopo la mezzanotte appartiene a questa
        // serata ma alla data di calendario successiva: è quella che va a Pretix.
        date: addDaysISO(fromDate, Math.floor(s.startMinute / MINUTES_PER_DAY)),
        time: formatClock(s.startMinute),
        endTime: formatClock(s.endMinute),
        startMinute: s.startMinute,
        endMinute: s.endMinute,
        band: s.band,
      })),
    });
  }

  return {
    film,
    fromDate,
    days,
    scannedDays,
    horizonDays,
    reason: days.length === 0
      ? `In ${scannedDays} giorni non c'è un buco da ${film.runtime}′ in questa sala: prova un'altra sala o guarda più avanti.`
      : undefined,
  };
}

/** Uno spettacolo che sta occupando l'orario che hai scelto a mano. */
export interface SlotConflict extends ExistingShow {
  /** Quanti biglietti pagati ci sono sopra. Sostituirlo li lascerebbe orfani. */
  soldTickets: number;
}

export interface ManualSlotCheck {
  /** L'orario è utilizzabile così com'è, senza toccare niente. */
  free: boolean;
  /** Libero, oppure occupato ma sostituibile: in entrambi i casi si può fare. */
  usable: boolean;
  slot: SlotProposal | null;
  /** Gli spettacoli da rimuovere per fare posto, se si sceglie di sostituire. */
  conflicts: SlotConflict[];
  /** Biglietti venduti in totale su ciò che verrebbe rimosso. */
  soldTickets: number;
  /** Spiegazione leggibile: perché non si può, o cosa comporta sostituire. */
  message: string;
  /**
   * L'orario esce dalla fascia d'apertura: comincia prima delle 10:00 o il film
   * finisce dopo l'01:00.
   *
   * Non è un rifiuto. Le proposte automatiche restano dentro l'orario — è lì
   * che deve stare un palinsesto normale — ma una serata decisa a mano, un film
   * lungo, una maratona, sono scelte di chi il cinema lo apre: si avvertono, non
   * si impediscono. Chi conferma uno slot così deve mandare `allowOutsideHours`
   * al commit, altrimenti la creazione lo rifiuta.
   */
  outsideHours: boolean;
  /** Cosa comporta uscire dall'orario, in italiano. Nil se si sta dentro. */
  warning: string | null;
}

/**
 * Un orario deciso a mano: si può usare, e se no perché.
 *
 * È la valvola di sfogo delle proposte automatiche. Quelle mostrano solo il
 * libero, che è giusto quando cerchi uno spazio; ma se sai già che vuoi il
 * sabato alle 21:00 — e alle 21:00 c'è qualcos'altro — il libero non ti serve:
 * ti serve sapere *cosa* c'è e poterlo sostituire.
 *
 * Qui non si cancella niente. La rimozione avviene alla conferma, dentro il
 * lavoro di creazione, subito prima di creare il rimpiazzo: così una scelta
 * ripensata non lascia dietro di sé un buco in palinsesto.
 */
export async function planningCheckManualSlot(input: {
  seatingPlanId: number;
  tmdbId: string;
  /** Giorno di programmazione 'YYYY-MM-DD'. */
  day: string;
  /** Orario 'HH:mm'. */
  time: string;
  /** Origine dei minuti globali, per restare sull'asse delle altre proposte. */
  fromDate: string;
}): Promise<ManualSlotCheck> {
  const nothing = (message: string): ManualSlotCheck => ({
    free: false, usable: false, slot: null, conflicts: [], soldTickets: 0, message,
    outsideHours: false, warning: null,
  });

  const clock = /^(\d{1,2}):(\d{2})$/.exec(input.time.trim());
  if (!clock) return nothing('Orario non valido: scrivilo come 21:00.');
  const hh = Number(clock[1]);
  const mm = Number(clock[2]);
  if (hh > 23 || mm > 59) return nothing('Quest\'ora non esiste.');

  const film = (await loadFilmInfo([input.tmdbId])).get(input.tmdbId) ?? null;
  if (!film) return nothing('Questo film non risulta su TMDB.');
  if (!film.runtime || film.runtime <= 0) {
    return nothing(`Di «${film.title}» non si conosce la durata: senza, non so quanto spazio serve.`);
  }

  const dayIndex = daysBetweenISO(input.fromDate, input.day);
  const startMinute = globalMinuteOf(dayIndex, hh * 60 + mm);

  // La finestra deve contenere il giorno scelto: senza, la sala risulterebbe
  // vuota e ogni orario sembrerebbe libero.
  const span = Math.min(Math.max(dayIndex + 2, 1), 60);
  const { shows } = await readRoomOccupancy(input.seatingPlanId, input.fromDate, span);
  const notBefore = msToGlobalMinute(Date.now() + 30 * 60000, input.fromDate);

  // Gli intervalli si portano dietro lo spettacolo da cui vengono: quando il
  // controllo dice «occupato», ciò che dà fastidio torna indietro identificato,
  // senza doverlo ripescare confrontando dei numeri.
  const occupied = shows.map((s) => ({
    start: s.startMinute,
    end: s.endMinute + MIN_GAP_MINUTES,
    show: s,
  }));

  const check = checkSlot({ runtime: film.runtime, startMinute, occupied, notBefore });

  const slot: SlotProposal = {
    day: input.day,
    date: addDaysISO(input.fromDate, Math.floor(startMinute / MINUTES_PER_DAY)),
    time: formatClock(startMinute),
    endTime: formatClock(check.endMinute),
    startMinute,
    endMinute: check.endMinute,
    band: check.band,
  };

  if (check.problem === 'past') {
    return nothing('Quest\'orario è già passato, o sta per esserlo.');
  }

  // ── Fuori orario: si avverte, non si vieta ──────────────────────────────
  // Un orario passato è passato per tutti, e non c'è consenso che lo riporti
  // indietro. L'apertura e la chiusura invece sono una decisione di chi il
  // cinema lo gestisce, e qui sta scegliendo a mano un singolo film in un
  // singolo giorno: il sito dice cosa comporta — a che ora finirebbe, di quanto
  // si sfora — e poi si fa da parte.
  const warning =
    check.problem === 'afterClosing'
      ? `«${film.title}» dura ${film.runtime}′: partendo alle ${slot.time} finisce alle ` +
        `${slot.endTime}, oltre la chiusura dell'${formatClock(CLOSING_MINUTE)}.`
      : check.problem === 'beforeOpening'
        ? `Il cinema apre alle ${formatClock(OPENING_MINUTE)}: le ${slot.time} vengono prima ` +
          'dell\'apertura.'
        : null;
  const outsideHours = warning !== null;

  // Senza niente davanti l'orario è utilizzabile: fuori orario, ma libero. Il
  // controllo dei conflitti è già stato fatto — `checkSlot` riporta le
  // sovrapposizioni anche quando si ferma prima, sul limite d'orario — quindi
  // qui non si sta saltando nessuna verifica: si sta solo declassando il
  // divieto sull'orario ad avvertimento.
  if (check.ok || (outsideHours && check.clashes.length === 0)) {
    return {
      free: true, usable: true, slot, conflicts: [], soldTickets: 0,
      outsideHours, warning,
      message: warning
        ? `${warning} Non c'è altro in sala: se vuoi farlo lo stesso, si può.`
        : `Libero: ${slot.time}–${slot.endTime}.`,
    };
  }

  // Occupato: ogni spettacolo che dà fastidio va pesato con i biglietti che ha
  // sopra, perché è quello il numero che decide se la sostituzione è una
  // sistemazione del palinsesto o un problema per delle persone.
  let countFailed = false;
  const conflicts: SlotConflict[] = await Promise.all(
    check.clashes.map(async ({ show }) => {
      const { dayIndex: _d, tmdbId: _t, ...rest } = show;
      let soldTickets = 0;
      if (rest.pretixId) {
        try {
          soldTickets = await countSoldTickets(rest.pretixId);
        } catch {
          countFailed = true;
        }
      }
      return { ...rest, soldTickets };
    })
  );

  // Se il conteggio non è riuscito ci si ferma. Dare per scontato lo zero
  // sarebbe la bugia peggiore possibile proprio qui: annuncerebbe «nessuno
  // resta a piedi» a chi sta per cancellare uno spettacolo che potrebbe avere
  // una sala già venduta. La creazione ricontrollerebbe comunque e rifiuterebbe,
  // ma a quel punto la decisione l'utente l'avrebbe già presa su un'informazione
  // falsa.
  if (countFailed) {
    return {
      free: false, usable: false, slot, conflicts, soldTickets: 0, outsideHours, warning,
      message: 'Non sono riuscito a controllare i biglietti venduti su ciò che occupa '
        + "quest'orario. Riprova: non ti propongo una sostituzione senza sapere chi ha già pagato.",
    };
  }

  // Un conflitto senza identificativo Pretix non si può rimuovere: è un
  // impegno della sala che il sito non governa, e sostituirlo alla cieca
  // creerebbe una sovrapposizione vera.
  const unremovable = conflicts.filter((c) => c.pretixId == null);
  if (conflicts.length === 0 || unremovable.length > 0) {
    return {
      free: false, usable: false, slot, conflicts, soldTickets: 0, outsideHours, warning,
      message: 'Quest\'orario è occupato da qualcosa che non posso rimuovere da qui.',
    };
  }

  const soldTickets = conflicts.reduce((sum, c) => sum + c.soldTickets, 0);
  const titles = conflicts.map((c) => `«${c.title}» delle ${c.time}`).join(' e ');

  return {
    free: false,
    usable: true,
    slot,
    conflicts,
    soldTickets,
    outsideHours,
    warning,
    message: soldTickets > 0
      ? `Qui c'è ${titles}, con ${soldTickets} bigliett${soldTickets === 1 ? 'o venduto' : 'i venduti'}. ` +
        'Sostituirlo lascia orfani ordini di gente che ha pagato: andranno rimborsati a mano da Pretix.'
      : `Qui c'è ${titles}. Nessun biglietto venduto: sostituirlo non lascia nessuno a piedi.`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PASSO 4 — LA CREAZIONE
// Asincrona: creare trenta spettacoli richiede minuti, più di quanto possa
// durare una singola richiesta. Si avvia e si segue.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Registra la creazione degli spettacoli e restituisce l'id del lavoro.
 *
 * Non crea niente su Pretix: scrive l'elenco delle intenzioni. Il lavoro
 * comincia davvero alla prima `planningCommitTick`, e va avanti un lotto per
 * chiamata finché non è finito.
 */
export async function planningCommitStart(input: CommitInput): Promise<{ jobId: string }> {
  return { jobId: await startCommit(input) };
}

/**
 * Fa avanzare il lavoro di un lotto e dice a che punto è.
 *
 * È questa la chiamata da ripetere: `planningCommitStatus` guarda soltanto.
 * Chiamarla da due parti insieme è sicuro — le righe si prenotano, e una riga
 * già presa da qualcun altro non viene lavorata due volte.
 */
export async function planningCommitTick(jobId: string): Promise<CommitJob | null> {
  return tickCommit(jobId);
}

/** Come sta andando il lavoro, senza farlo avanzare. `null` se non esiste. */
export async function planningCommitStatus(jobId: string): Promise<CommitJob | null> {
  return getJob(jobId);
}

/**
 * Rimette in gioco gli spettacoli falliti. Quelli già creati non si toccano:
 * riprovare non può in nessun caso produrre un doppione.
 */
export async function planningCommitRetry(jobId: string): Promise<{ requeued: number }> {
  return { requeued: await retryCommit(jobId) };
}

/**
 * Il lavoro rimasto a metà su questa sala, se c'è.
 *
 * Serve alla riapertura della pagina: un wifi caduto o un portatile chiuso non
 * annullano la creazione, la mettono in pausa — e al ritorno va ripresa, non
 * rilanciata da capo.
 */
export async function planningFindOpenCommit(seatingPlanId: number): Promise<string | null> {
  return findOpenJob(seatingPlanId);
}

/**
 * Elimina uno spettacolo: da Pretix, dal database e — se era l'ultima
 * proiezione di quel film — anche i suoi metadati. `adminDeleteEvent` fa già
 * tutte e tre le cose, qui si aggiunge solo la rete di sicurezza.
 *
 * Di default si RIFIUTA se ci sono biglietti pagati: cancellare il sub-evento
 * lascerebbe orfani ordini di gente che ha pagato davvero. Chi vuole procedere
 * comunque — perché sta annullando lo spettacolo e rimborserà dal pannello
 * Pretix — passa `force`.
 */
export async function planningDeleteShow(
  pretixId: number,
  force = false
): Promise<{ deleted: boolean; soldTickets: number; error?: string }> {
  const { countSoldTickets } = await import('@/services/pretix');
  const { adminDeleteEvent } = await import('@/actions/adminActions');

  const soldTickets = await countSoldTickets(pretixId);
  if (soldTickets > 0 && !force) {
    return {
      deleted: false,
      soldTickets,
      error:
        soldTickets === 1
          ? "C'è già 1 biglietto venduto per questo spettacolo."
          : `Ci sono già ${soldTickets} biglietti venduti per questo spettacolo.`,
    };
  }

  await adminDeleteEvent(pretixId);
  return { deleted: true, soldTickets };
}

// ═══════════════════════════════════════════════════════════════════════════
// SPOSTARE CIÒ CHE È GIÀ IN CARTELLONE
// Un'altra cosa dal creare: qui il pubblico c'è già, e ogni scrittura si vede
// online nell'istante dopo. Perciò il controllo e l'azione sono separati — si
// guarda, si decide, e solo allora si scrive.
// ═══════════════════════════════════════════════════════════════════════════

export interface MoveCheck extends ManualSlotCheck {
  /**
   * Biglietti già venduti sullo spettacolo **che si sta spostando**.
   *
   * `null` quando il conteggio non è riuscito, e la differenza da zero conta:
   * chi ha pagato si presenterà all'orario vecchio, e Pretix non lo avvisa da
   * solo. Dire «nessuno» senza saperlo sarebbe la rassicurazione peggiore.
   */
  movingShowSoldTickets: number | null;
}

/**
 * Si può portare questo spettacolo a quel giorno, a quell'ora?
 *
 * Non sposta niente. Risponde con la stessa forma di `planningCheckManualSlot`
 * — che la UI sa già leggere — più i biglietti venduti su ciò che si muove.
 *
 * La durata non si chiede a TMDB: il film è già in sala, e `runtimeOfSubEvent`
 * l'ha già ricavata dal commento JSON, dagli override o dalla distanza fra
 * `date_from` e `date_to`.
 */
export async function planningCheckMove(input: {
  seatingPlanId: number;
  pretixId: number;
  /** Giorno di programmazione di destinazione, 'YYYY-MM-DD'. */
  day: string;
  /** Orario di destinazione, 'HH:mm'. */
  time: string;
  /** Origine dei minuti globali, come nel resto del wizard. */
  fromDate: string;
}): Promise<MoveCheck> {
  const { planMove } = await import('@/services/scheduling/move');

  const nothing = (message: string): MoveCheck => ({
    free: false, usable: false, slot: null, conflicts: [], soldTickets: 0, message,
    outsideHours: false, warning: null, movingShowSoldTickets: null,
  });

  const clock = /^(\d{1,2}):(\d{2})$/.exec(input.time.trim());
  if (!clock) return nothing('Orario non valido: scrivilo come 21:00.');
  const hh = Number(clock[1]);
  const mm = Number(clock[2]);
  if (hh > 23 || mm > 59) return nothing('Quest\'ora non esiste.');

  const dayIndex = daysBetweenISO(input.fromDate, input.day);
  // La finestra deve contenere il giorno scelto, e la nottata che lo segue.
  const span = Math.min(Math.max(dayIndex + 2, 1), 60);
  const { shows } = await readRoomOccupancy(input.seatingPlanId, input.fromDate, span);

  const moving = shows.find((s) => s.pretixId === input.pretixId);
  if (!moving) {
    return nothing('Questo spettacolo non è più in sala: ricarica il palinsesto.');
  }

  const occupied = shows.map((s) => ({
    start: s.startMinute,
    end: s.endMinute + MIN_GAP_MINUTES,
    show: s,
  }));
  const notBefore = msToGlobalMinute(Date.now() + 30 * 60000, input.fromDate);

  const check = planMove({
    runtime: moving.runtime,
    dayIndex,
    clock: hh * 60 + mm,
    occupied,
    isMoving: (o) => o.show.pretixId === input.pretixId,
    notBefore,
  });

  let movingShowSoldTickets: number | null = null;
  try {
    movingShowSoldTickets = await countSoldTickets(input.pretixId);
  } catch {
    movingShowSoldTickets = null;
  }

  const slot: SlotProposal = {
    day: input.day,
    date: addDaysISO(input.fromDate, Math.floor(check.startMinute / MINUTES_PER_DAY)),
    time: formatClock(check.startMinute),
    endTime: formatClock(check.endMinute),
    startMinute: check.startMinute,
    endMinute: check.endMinute,
    band: check.band,
  };

  const no = (message: string): MoveCheck => ({
    free: false, usable: false, slot, conflicts: [], soldTickets: 0, message,
    outsideHours: false, warning: null, movingShowSoldTickets,
  });

  if (check.problem === 'past') return no('Quest\'orario è già passato, o sta per esserlo.');

  // Fuori orario si avverte, non si vieta: apertura e chiusura sono una
  // decisione di chi il cinema lo gestisce. Le 21:00 di ieri no.
  const warning =
    check.problem === 'afterClosing'
      ? `«${moving.title}» dura ${moving.runtime}′: partendo alle ${slot.time} finisce alle ` +
        `${slot.endTime}, oltre la chiusura dell'${formatClock(CLOSING_MINUTE)}.`
      : check.problem === 'beforeOpening'
        ? `Il cinema apre alle ${formatClock(OPENING_MINUTE)}: le ${slot.time} vengono prima ` +
          'dell\'apertura.'
        : null;
  const outsideHours = warning !== null;

  if (check.ok || (outsideHours && check.clashes.length === 0)) {
    return {
      free: true, usable: true, slot, conflicts: [], soldTickets: 0,
      outsideHours, warning, movingShowSoldTickets,
      message: warning
        ? `${warning} Non c'è altro in sala: se vuoi farlo lo stesso, si può.`
        : `Libero: ${slot.time}–${slot.endTime}.`,
    };
  }

  let countFailed = false;
  const conflicts: SlotConflict[] = await Promise.all(
    check.clashes.map(async ({ show }) => {
      const { dayIndex: _d, ...rest } = show;
      let soldTickets = 0;
      if (rest.pretixId) {
        try {
          soldTickets = await countSoldTickets(rest.pretixId);
        } catch {
          countFailed = true;
        }
      }
      return { ...rest, soldTickets };
    })
  );

  // Senza il conteggio la sostituzione non si propone. Un «nessuno resta a
  // piedi» falso, detto a chi sta per cancellare uno spettacolo, è la bugia
  // peggiore possibile.
  if (countFailed) {
    return {
      free: false, usable: false, slot, conflicts, soldTickets: 0, outsideHours, warning,
      movingShowSoldTickets,
      message: 'Non sono riuscito a controllare i biglietti venduti su ciò che occupa '
        + "quest'orario. Riprova: non ti propongo una sostituzione senza sapere chi ha già pagato.",
    };
  }

  const unremovable = conflicts.filter((c) => c.pretixId == null);
  if (conflicts.length === 0 || unremovable.length > 0) {
    return {
      free: false, usable: false, slot, conflicts, soldTickets: 0, outsideHours, warning,
      movingShowSoldTickets,
      message: 'Quest\'orario è occupato da qualcosa che non posso rimuovere da qui.',
    };
  }

  const soldTickets = conflicts.reduce((sum, c) => sum + c.soldTickets, 0);
  const titles = conflicts.map((c) => `«${c.title}» delle ${c.time}`).join(' e ');

  return {
    free: false,
    usable: true,
    slot,
    conflicts,
    soldTickets,
    outsideHours,
    warning,
    movingShowSoldTickets,
    message: soldTickets > 0
      ? `Qui c'è ${titles}, con ${soldTickets} bigliett${soldTickets === 1 ? 'o venduto' : 'i venduti'}. ` +
        'Sostituirlo lascia orfani ordini di gente che ha pagato: andranno rimborsati a mano da Pretix.'
      : `Qui c'è ${titles}. Nessun biglietto venduto: sostituirlo non lascia nessuno a piedi.`,
  };
}

/**
 * Sposta lo spettacolo, eliminando se serve ciò che occupa la destinazione.
 *
 * **Ricontrolla prima di agire.** Fra il momento in cui l'utente ha letto il
 * pannello e quello in cui ha premuto possono essere passati minuti, e in quei
 * minuti si vendono biglietti: il pannello serve a far decidere, non è ciò su
 * cui il server si fida.
 *
 * **Prima elimina, poi sposta.** All'inverso, un errore a metà strada
 * lascerebbe due film sovrapposti entrambi in vendita sulla stessa sala. Così
 * il peggio che resta è un buco in palinsesto: un buco si riempie, un doppio
 * incasso sugli stessi posti no. È anche l'ordine che tiene `commitRunner`.
 */
export async function planningMoveShow(input: {
  seatingPlanId: number;
  pretixId: number;
  day: string;
  time: string;
  fromDate: string;
  /** Consenso a eliminare ciò che occupa la destinazione. */
  replaces?: number[];
  /** Consenso a eliminarlo anche con biglietti venduti sopra. */
  force?: boolean;
  /** Consenso a uscire dagli orari di apertura. */
  allowOutsideHours?: boolean;
}): Promise<{ moved: boolean; deleted: number[]; error?: string }> {
  const { adminUpdateEventDate } = await import('@/actions/adminActions');

  const check = await planningCheckMove(input);
  if (!check.slot) return { moved: false, deleted: [], error: check.message };

  if (check.outsideHours && !input.allowOutsideHours) {
    return { moved: false, deleted: [], error: check.warning ?? check.message };
  }

  const conflictIds = check.conflicts
    .map((c) => c.pretixId)
    .filter((v): v is number => v != null);

  // Un conflitto senza id Pretix non si può togliere: è un impegno della sala
  // che il sito non governa, e spostarci sopra creerebbe una sovrapposizione.
  if (conflictIds.length !== check.conflicts.length) {
    return { moved: false, deleted: [], error: check.message };
  }

  // Si elimina solo ciò che l'utente ha visto e accettato di eliminare. Un
  // conflitto comparso nel frattempo ferma tutto: non era nella decisione.
  const consented = new Set(input.replaces ?? []);
  const unexpected = conflictIds.filter((id) => !consented.has(id));
  if (unexpected.length > 0) {
    return {
      moved: false,
      deleted: [],
      error: 'Nel frattempo quest\'orario è cambiato. Ricontrolla il palinsesto e riprova.',
    };
  }

  if (check.soldTickets > 0 && !input.force) {
    return { moved: false, deleted: [], error: check.message };
  }

  const deleted: number[] = [];
  for (const id of conflictIds) {
    const removal = await planningDeleteShow(id, input.force ?? false);
    if (!removal.deleted) {
      return { moved: false, deleted, error: removal.error };
    }
    deleted.push(id);
  }

  await adminUpdateEventDate(input.pretixId, `${check.slot.date}T${check.slot.time}`);
  return { moved: true, deleted };
}

// ═══════════════════════════════════════════════════════════════════════════
// LA BOZZA — il piano che non si perde
//
// Il wizard teneva tutto nello stato del browser: un ricaricamento, una scheda
// chiusa o un wifi caduto e due ore di scelte sparivano. Qui c'è l'ultima
// fotografia del piano, riscritta mentre lavori e ripescata all'apertura. Una
// per sala, perché programmare due periodi diversi sulla stessa sala nello
// stesso momento non è una cosa che si fa — e tenere una cronologia di bozze
// significherebbe chiedere "quale?" a chi voleva solo riprendere.
// ═══════════════════════════════════════════════════════════════════════════

export interface PlanningDraftPayload {
  startDate: string;
  days: number;
  intensity: string;
  /** Lo stato del wizard, così com'è: film scelti, spettacoli, passo. */
  state: unknown;
  showCount: number;
}

/** Salva (o sostituisce) la bozza di questa sala. */
export async function planningSaveDraft(
  seatingPlanId: number,
  draft: PlanningDraftPayload
): Promise<void> {
  const data = {
    startDate: draft.startDate,
    days: Math.min(Math.max(Math.trunc(draft.days), 1), 30),
    intensity: draft.intensity,
    state: (draft.state ?? {}) as object,
    showCount: Math.max(Math.trunc(draft.showCount), 0),
  };
  // Se il salvataggio fallisce non succede niente di grave: è una rete di
  // sicurezza, non il piano. Farlo esplodere interromperebbe il lavoro vero.
  await prisma.planningDraft
    .upsert({ where: { roomId: seatingPlanId }, create: { roomId: seatingPlanId, ...data }, update: data })
    .catch((err) => {
      console.error('[planning] bozza non salvata', err);
      return null;
    });
}

/** La bozza di questa sala, se ce n'è una. */
export async function planningLoadDraft(
  seatingPlanId: number
): Promise<(PlanningDraftPayload & { updatedAt: string }) | null> {
  const row = await prisma.planningDraft
    .findUnique({ where: { roomId: seatingPlanId } })
    .catch(() => null);
  if (!row) return null;
  return {
    startDate: row.startDate,
    days: row.days,
    intensity: row.intensity,
    state: row.state,
    showCount: row.showCount,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Butta la bozza: si fa a piano confermato, o quando si ricomincia da capo. */
export async function planningDropDraft(seatingPlanId: number): Promise<void> {
  await prisma.planningDraft.deleteMany({ where: { roomId: seatingPlanId } }).catch(() => null);
}

/** Il primo giorno programmabile: oggi, se non è già troppo tardi. */
export async function planningDefaultStartDate(): Promise<string> {
  const now = new Date();
  const clock = romeClock(now);
  const [h] = clock.split(':').map(Number);
  // Dopo le 22:00 proporre "oggi" non ha senso: resterebbe un'ora di sala.
  return h >= 22 ? addDaysISO(todayInRome(), 1) : todayInRome();
}
