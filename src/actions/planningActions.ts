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
      existing: dayShows.map(({ dayIndex: _d, tmdbId: _t, ...rest }) => rest),
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
  if (check.problem === 'beforeOpening') {
    return nothing(`Il cinema apre alle ${formatClock(OPENING_MINUTE)}.`);
  }
  if (check.problem === 'afterClosing') {
    return nothing(
      `«${film.title}» dura ${film.runtime}′: partendo alle ${slot.time} finirebbe alle ` +
      `${slot.endTime}, oltre la chiusura dell'${formatClock(CLOSING_MINUTE)}.`
    );
  }

  if (check.ok) {
    return {
      free: true, usable: true, slot, conflicts: [], soldTickets: 0,
      message: `Libero: ${slot.time}–${slot.endTime}.`,
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
      free: false, usable: false, slot, conflicts, soldTickets: 0,
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
      free: false, usable: false, slot, conflicts, soldTickets: 0,
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

/** Avvia la creazione degli spettacoli e restituisce l'id del lavoro. */
export async function planningCommitStart(input: CommitInput): Promise<{ jobId: string }> {
  return { jobId: startCommit(input) };
}

/** Come sta andando il lavoro. `null` se non lo conosciamo (vedi `commitJobs`). */
export async function planningCommitStatus(jobId: string): Promise<CommitJob | null> {
  return getJob(jobId);
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

/** Il primo giorno programmabile: oggi, se non è già troppo tardi. */
export async function planningDefaultStartDate(): Promise<string> {
  const now = new Date();
  const clock = romeClock(now);
  const [h] = clock.split(':').map(Number);
  // Dopo le 22:00 proporre "oggi" non ha senso: resterebbe un'ora di sala.
  return h >= 22 ? addDaysISO(todayInRome(), 1) : todayInRome();
}
