/**
 * Motore di programmazione del cinema.
 *
 * Funzione pura: stessi ingressi → stesso piano. Non conosce Pretix, TMDB, il
 * database né l'ora corrente; tutto ciò che le serve arriva come parametro.
 * È l'unico posto dove vive la matematica degli orari, così l'anteprima che
 * vedi nel wizard è per costruzione identica a ciò che verrà creato.
 *
 * IL MODELLO — la giornata è una catena, non una griglia di ancore fisse.
 * Nella programmazione reale del Vestri i film si susseguono da 10:00 a
 * mezzanotte passata, 5-8 al giorno, con pause dai 10 ai 40 minuti. Il motore
 * fa lo stesso: parte dall'apertura, piazza uno spettacolo, avanza, e sceglie
 * ogni volta l'orario d'inizio più elegante fra quelli liberi.
 *
 * INVARIANTE — per i controlli di sovrapposizione ogni spettacolo occupa
 * `[inizio, fine + MIN_GAP_MINUTES]`. Se due blocchi non si accavallano, fra la
 * fine di un film e l'inizio del successivo ci sono automaticamente almeno 10
 * minuti in entrambe le direzioni: un controllo solo copre tutte le pause.
 * La chiusura invece guarda la sola fine del film, perché dopo l'ultimo
 * spettacolo il cinema chiude e le pulizie non servono più.
 */

import {
  type Band,
  BAND_WINDOWS,
  CLOSING_MINUTE,
  MINUTES_PER_DAY,
  MIN_GAP_MINUTES,
  OPENING_MINUTE,
  addDaysISO,
  bandOf,
  daysBetweenISO,
  elegantMinutesBetween,
  elegantMinutesByPreference,
  elegantRank,
  formatClock,
  isWeekend,
  minuteOfDay,
  toGlobal,
} from './times';

export type Intensity = 'soft' | 'normal' | 'festival';

/** Intervallo occupato, in minuti globali. `end` include già la pausa. */
export interface Interval {
  start: number;
  end: number;
}

export interface SchedulingFilm {
  tmdbId: string;
  title: string;
  /** Durata in minuti. Un film senza durata nota viene escluso con un avviso. */
  runtime: number;
  /** Repliche richieste. `undefined` = decide il motore. */
  replicas?: number;
  /** Fascia preferita, se ne hai una. */
  preferredBand?: Band;
  posterPath?: string;
}

export interface ScheduledShow {
  tmdbId: string;
  title: string;
  runtime: number;
  posterPath?: string;
  /** Giorno di programmazione: uno spettacolo delle 00:30 appartiene alla sera prima. */
  day: string;
  /** Data di calendario reale (dopo la mezzanotte è `day` + 1). */
  date: string;
  /** 'HH:mm' di inizio. */
  time: string;
  /** 'HH:mm' di fine film. */
  endTime: string;
  /** Minuto globale di inizio, relativo alla mezzanotte del primo giorno della finestra. */
  startMinute: number;
  /** Minuto globale di fine film. */
  endMinute: number;
  band: Band;
  /** Bloccato dall'utente: i ricalcoli non lo spostano. */
  locked: boolean;
}

export interface BuildScheduleInput {
  window: { startDate: string; days: number };
  films: SchedulingFilm[];
  /** Proiezioni già esistenti in sala, pausa inclusa nella fine. */
  occupied?: Interval[];
  /** Spettacoli che l'utente ha bloccato: restano dove sono. */
  locked?: ScheduledShow[];
  intensity?: Intensity;
  /** Cambia il seed per ottenere un piano diverso ma riproducibile. */
  seed?: number;
  /** Minuto globale prima del quale non si programma (di solito "adesso + 30′"). */
  notBefore?: number;
  /** Tetto alle repliche automatiche. Default: giorni della finestra, fra 2 e 7. */
  maxReplicas?: number;
  /** Spettacoli al giorno, se vuoi scavalcare il ritmo scelto. */
  showsPerDay?: number;
}

export interface BuildScheduleResult {
  shows: ScheduledShow[];
  warnings: string[];
  stats: {
    shows: number;
    films: number;
    daysUsed: number;
    slotsOffered: number;
    slotsFilled: number;
  };
}

/**
 * Spettacoli al giorno, tarati sulla programmazione reale: le settimane
 * osservate stanno fra 5 e 8 al giorno, con il venerdì-domenica più pieni.
 */
const SHOWS_PER_DAY: Record<Intensity, { weekday: number; weekend: number }> = {
  soft: { weekday: 4, weekend: 5 },
  normal: { weekday: 6, weekend: 7 },
  festival: { weekday: 7, weekend: 8 },
};

/** Quanto lontano dal punto d'arrivo della catena si cerca un orario elegante. */
const CHAIN_LOOKAHEAD = 75;

/** Durata di riferimento quando non si sa ancora quale film verrà scelto. */
const TYPICAL_RUNTIME = 110;

const MAX_DAYS = 30;
const MAX_FILMS = 40;
const MAX_EXPLICIT_REPLICAS = 30;

/** PRNG deterministico (mulberry32): serve la varietà, non la crittografia. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseClock(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/**
 * Costruisce uno spettacolo a partire dal minuto globale di inizio.
 * `day` è il giorno di programmazione (quello della serata), che dopo la
 * mezzanotte è diverso dalla data di calendario da mandare a Pretix.
 */
function makeShow(
  film: SchedulingFilm,
  startMinute: number,
  dayIndex: number,
  windowStart: string,
  locked: boolean
): ScheduledShow {
  const endMinute = startMinute + film.runtime;
  const calendarDayIndex = Math.floor(startMinute / MINUTES_PER_DAY);
  return {
    tmdbId: film.tmdbId,
    title: film.title,
    runtime: film.runtime,
    posterPath: film.posterPath,
    day: addDaysISO(windowStart, dayIndex),
    date: addDaysISO(windowStart, calendarDayIndex),
    time: formatClock(startMinute),
    endTime: formatClock(endMinute),
    startMinute,
    endMinute,
    band: bandOf(startMinute),
    locked,
  };
}

/**
 * Riporta uno spettacolo bloccato sull'asse dei minuti globali della finestra
 * corrente. Necessario perché l'utente può cambiare il periodo dopo aver
 * bloccato qualcosa: `startMinute` sarebbe riferito alla finestra precedente,
 * mentre `day` + `time` sono assoluti e quindi affidabili.
 */
function rebaseLocked(show: ScheduledShow, windowStart: string): ScheduledShow {
  const dayIndex = daysBetweenISO(windowStart, show.day);
  const clock = parseClock(show.time);
  // Un orario precedente all'apertura è una coda di nottata: appartiene al
  // giorno di programmazione `day`, ma alla data di calendario successiva.
  const start = toGlobal(dayIndex, clock) + (clock < OPENING_MINUTE ? MINUTES_PER_DAY : 0);
  return makeShow(show, start, dayIndex, windowStart, true);
}

/** Indice del giorno di *programmazione* di uno spettacolo già collocato. */
function programmingDayIndexOf(show: ScheduledShow): number {
  const calendarDay = Math.floor(show.startMinute / MINUTES_PER_DAY);
  return minuteOfDay(show.startMinute) < OPENING_MINUTE ? calendarDay - 1 : calendarDay;
}

export function buildSchedule(input: BuildScheduleInput): BuildScheduleResult {
  const warnings: string[] = [];
  const windowStart = input.window.startDate;
  const days = Math.min(Math.max(Math.trunc(input.window.days), 1), MAX_DAYS);
  const intensity: Intensity = input.intensity ?? 'normal';
  const rng = makeRng(input.seed ?? 1);
  const notBefore = input.notBefore ?? Number.NEGATIVE_INFINITY;

  // ── 1. Film utilizzabili ───────────────────────────────────────────────────
  type PlanFilm = SchedulingFilm & {
    target: number;
    placed: number;
    lastDay: number;
    bandsUsed: Set<Band>;
    hasEvening: boolean;
  };

  const seen = new Set<string>();
  const films: PlanFilm[] = [];

  for (const f of input.films.slice(0, MAX_FILMS)) {
    if (seen.has(f.tmdbId)) continue;
    seen.add(f.tmdbId);
    if (!Number.isFinite(f.runtime) || f.runtime <= 0) {
      warnings.push(`«${f.title}»: durata sconosciuta, escluso dal piano.`);
      continue;
    }
    films.push({
      ...f,
      target: 0,
      placed: 0,
      lastDay: Number.NEGATIVE_INFINITY,
      bandsUsed: new Set(),
      hasEvening: false,
    });
  }

  const byId = new Map(films.map((f) => [f.tmdbId, f]));

  // ── 2. Occupazione di partenza ─────────────────────────────────────────────
  const occupied: Interval[] = (input.occupied ?? []).map((i) => ({ ...i }));
  const lockedShows: ScheduledShow[] = [];
  /** Spettacoli già presenti per giorno di programmazione, per non ripeterli di fila. */
  const dayHistory = new Map<number, string[]>();

  const remember = (dayIndex: number, tmdbId: string) => {
    const list = dayHistory.get(dayIndex) ?? [];
    list.push(tmdbId);
    dayHistory.set(dayIndex, list);
  };

  for (const raw of input.locked ?? []) {
    const show = rebaseLocked(raw, windowStart);
    const dayIndex = programmingDayIndexOf(show);
    if (dayIndex < 0 || dayIndex >= days) {
      // Fuori dalla finestra scelta: non lo tocchiamo, ma continua a occupare la
      // sala, quindi resta come vincolo senza comparire nel piano.
      occupied.push({ start: show.startMinute, end: show.endMinute + MIN_GAP_MINUTES });
      warnings.push(`«${show.title}» del ${show.day} è bloccato ma fuori dal periodo scelto: resta com'è.`);
      continue;
    }
    lockedShows.push(show);
    occupied.push({ start: show.startMinute, end: show.endMinute + MIN_GAP_MINUTES });
    remember(dayIndex, show.tmdbId);
    const film = byId.get(show.tmdbId);
    if (film) {
      film.placed++;
      film.lastDay = Math.max(film.lastDay, dayIndex);
      film.bandsUsed.add(show.band);
      if (show.band === 'evening') film.hasEvening = true;
    }
  }

  const emptyResult = (reason: string): BuildScheduleResult => ({
    shows: [...lockedShows].sort((a, b) => a.startMinute - b.startMinute),
    warnings: [...warnings, reason],
    stats: {
      shows: lockedShows.length,
      films: films.length,
      daysUsed: new Set(lockedShows.map((s) => s.day)).size,
      slotsOffered: 0,
      slotsFilled: 0,
    },
  });

  if (films.length === 0) return emptyResult('Nessun film valido da programmare.');

  // ── 3. Obiettivo di repliche ───────────────────────────────────────────────
  // Chi ha chiesto un numero preciso lo ottiene; gli altri si dividono
  // equamente gli spettacoli che restano.
  const perDay = (dayIndex: number): number => {
    if (input.showsPerDay != null) return Math.max(0, Math.trunc(input.showsPerDay));
    const iso = addDaysISO(windowStart, dayIndex);
    return isWeekend(iso) ? SHOWS_PER_DAY[intensity].weekend : SHOWS_PER_DAY[intensity].weekday;
  };

  let capacity = 0;
  for (let d = 0; d < days; d++) capacity += perDay(d);
  capacity = Math.max(capacity - lockedShows.length, 0);

  const explicit = films.filter((f) => f.replicas != null);
  const auto = films.filter((f) => f.replicas == null);

  for (const f of explicit) {
    f.target = clamp(Math.trunc(f.replicas!), 0, MAX_EXPLICIT_REPLICAS);
  }

  const claimed = explicit.reduce((sum, f) => sum + f.target, 0);
  const free = Math.max(capacity - claimed, 0);

  if (auto.length > 0) {
    // Un tetto rigido alle repliche lascerebbe al buio gli ultimi giorni del
    // periodo: meglio riempire la sala e dirti che i titoli sono pochi.
    const comfortable = clamp(days, 2, 7);
    const needed = Math.ceil(free / auto.length);
    const maxReplicas = input.maxReplicas ?? Math.max(comfortable, needed);

    if (input.maxReplicas == null && needed > comfortable) {
      warnings.push(
        `Solo ${auto.length} film per ${free} spettacoli: ognuno andrebbe in onda circa ${needed} volte. Aggiungi titoli per una programmazione più varia.`
      );
    }

    const shuffled = [...auto];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const base = Math.floor(free / shuffled.length);
    const rest = free % shuffled.length;
    shuffled.forEach((f, i) => {
      f.target = clamp(base + (i < rest ? 1 : 0), 1, maxReplicas);
    });
  }

  // ── 4. Riempimento della giornata ──────────────────────────────────────────
  const placed: ScheduledShow[] = [];
  let slotsOffered = 0;

  const fits = (start: number, runtime: number, dayOpen: number, dayClose: number): boolean => {
    if (start < notBefore) return false;
    if (start < dayOpen) return false;
    // La chiusura guarda la fine del film: dopo l'ultimo spettacolo si chiude.
    if (start + runtime > dayClose) return false;
    const block: Interval = { start, end: start + runtime + MIN_GAP_MINUTES };
    return !occupied.some((o) => overlaps(block, o));
  };

  /**
   * Miglior orario d'inizio a partire dal punto in cui è arrivata la catena.
   *
   * Prima si guarda vicino, privilegiando l'eleganza: è così che nascono le
   * 15:30 e le 21:00. Se lì non c'è spazio — di solito per una proiezione già
   * esistente — si allarga a tutta la giornata e vince il primo posto libero.
   */
  const bestStart = (
    from: number,
    runtime: number,
    dayOpen: number,
    dayClose: number,
    band?: Band
  ): number | null => {
    const dayStart = dayOpen - OPENING_MINUTE;
    // Chi ha chiesto una fascia deve iniziare dentro quella fascia: senza questo
    // vincolo la ricerca in avanti potrebbe atterrare oltre il confine (le
    // 22:00 sono seconda serata, non prima).
    const bandFloor = band ? dayStart + BAND_WINDOWS[band].from : Number.NEGATIVE_INFINITY;
    const bandCeil = band ? dayStart + BAND_WINDOWS[band].to - 1 : Number.POSITIVE_INFINITY;

    const lower = Math.max(from, dayOpen, bandFloor, notBefore === Number.NEGATIVE_INFINITY ? from : notBefore);
    const latest = Math.min(dayClose - runtime, bandCeil);
    if (lower > latest) return null;

    const near = elegantMinutesByPreference(lower, Math.min(lower + CHAIN_LOOKAHEAD, latest));
    for (const m of near) {
      if (fits(m, runtime, dayOpen, dayClose)) return m;
    }

    const far = elegantMinutesByPreference(lower, latest, 10);
    for (const m of far) {
      if (fits(m, runtime, dayOpen, dayClose)) return m;
    }
    return null;
  };

  for (let d = 0; d < days; d++) {
    const dayOpen = d * MINUTES_PER_DAY + OPENING_MINUTE;
    const dayClose = d * MINUTES_PER_DAY + CLOSING_MINUTE;
    const target = perDay(d);
    slotsOffered += target;

    const alreadyToday = (dayHistory.get(d) ?? []).length;
    const remaining = target - alreadyToday;
    if (remaining <= 0) continue;

    // Un po' del tempo che avanza va speso in pause, per non ammassare tutto al
    // mattino e chiudere alle 20:00. Solo un po': nella programmazione reale le
    // pause stanno sui 20-30 minuti, non sull'ora, e la giornata resta una
    // catena fitta. Il resto del tempo avanzato diventa coda libera a fine
    // serata, dove serve per gli spettacoli lunghi.
    const pool = films.filter((f) => f.placed < f.target);
    const avgRuntime = pool.length
      ? pool.reduce((s, f) => s + f.runtime, 0) / pool.length
      : TYPICAL_RUNTIME;
    const spare = (dayClose - dayOpen) - remaining * avgRuntime - (remaining - 1) * MIN_GAP_MINUTES;
    const slack = clamp((spare / Math.max(remaining, 1)) * 0.35, 0, 25);

    let cursor = dayOpen;
    let lastPlacedId: string | null = null;

    for (let n = 0; n < remaining; n++) {
      const projectedBand = bandOf(cursor);
      const history = dayHistory.get(d) ?? [];

      const candidates = films
        .filter((f) => f.placed < f.target)
        .map((f) => ({
          f,
          // L'urgenza è la *quota di repliche ancora da piazzare*, non il loro
          // numero assoluto: un conteggio grezzo cresce con le repliche e
          // finirebbe per schiacciare fasce preferite e rotazione.
          score:
            ((f.target - f.placed) / Math.max(f.target, 1)) * 30 +
            Math.min(d - f.lastDay, 6) * 3 +
            (!f.bandsUsed.has(projectedBand) ? 6 : 0) +
            (projectedBand === 'evening' && !f.hasEvening ? 12 : 0) +
            (f.preferredBand === projectedBand ? 10 : 0) +
            history.filter((id) => id === f.tmdbId).length * -12 +
            rng() * 5,
        }))
        .sort((a, b) => b.score - a.score);

      // Le preferenze sono precedenze, non bonus: un punteggio si può sempre
      // perdere contro qualcos'altro, e un film "solo di sera" finirebbe
      // comunque in matinée. Si allenta un vincolo per volta, dal meno grave.
      //
      // L'ordine conta. Una replica ravvicinata è un difetto estetico; mandare
      // un film fuori dalla fascia che hai chiesto tradisce una tua richiesta
      // esplicita. Quindi si accetta prima la replica.
      const fresh = ({ f }: { f: PlanFilm }) => f.tmdbId !== lastPlacedId;
      const inBand = ({ f }: { f: PlanFilm }) => !f.preferredBand || f.preferredBand === projectedBand;

      const rounds: { list: typeof candidates; enforceBand: boolean }[] = [
        { list: candidates.filter((c) => fresh(c) && inBand(c)), enforceBand: true },
        { list: candidates.filter((c) => !fresh(c) && inBand(c)), enforceBand: true },
        { list: candidates.filter((c) => fresh(c) && !inBand(c)), enforceBand: false },
        { list: candidates.filter((c) => !fresh(c) && !inBand(c)), enforceBand: false },
      ];

      let show: ScheduledShow | null = null;
      for (const round of rounds) {
        for (const { f } of round.list) {
          // Quando la fascia viene concessa, lo spettacolo va cercato dove è
          // arrivata la catena: vincolarlo alla sua fascia lo farebbe saltare
          // avanti di ore, lasciando la giornata bucata alle spalle.
          const start = bestStart(
            cursor,
            f.runtime,
            dayOpen,
            dayClose,
            round.enforceBand ? f.preferredBand : undefined
          );
          if (start == null) continue;
          show = makeShow(f, start, d, windowStart, false);
          placed.push(show);
          occupied.push({ start, end: show.endMinute + MIN_GAP_MINUTES });
          f.placed++;
          f.lastDay = d;
          f.bandsUsed.add(show.band);
          if (show.band === 'evening') f.hasEvening = true;
          remember(d, f.tmdbId);
          break;
        }
        if (show) break;
      }

      if (!show) break; // giornata esaurita: né spazio né film disponibili
      cursor = show.endMinute + MIN_GAP_MINUTES + Math.round(slack * (0.6 + rng() * 0.8));
      lastPlacedId = show.tmdbId;
    }
  }

  // ── 5. Avvisi ──────────────────────────────────────────────────────────────
  for (const f of films) {
    if (f.placed === 0) {
      warnings.push(`«${f.title}» non è entrato nel piano: allarga il periodo o alza il ritmo.`);
    } else if (f.replicas != null && f.placed < f.target) {
      warnings.push(`«${f.title}»: ${f.placed} repliche su ${f.target} richieste, non c'era altro spazio.`);
    } else if (!f.hasEvening) {
      warnings.push(`«${f.title}» non ha nessuna prima serata.`);
    }
    if (f.preferredBand && f.placed > 0 && !f.bandsUsed.has(f.preferredBand)) {
      warnings.push(`«${f.title}»: la fascia preferita non era libera, l'ho messo altrove.`);
    }
  }

  const shows = [...lockedShows, ...placed].sort((a, b) => a.startMinute - b.startMinute);

  return {
    shows,
    warnings,
    stats: {
      shows: shows.length,
      films: films.filter((f) => f.placed > 0).length,
      daysUsed: new Set(shows.map((s) => s.day)).size,
      slotsOffered,
      slotsFilled: placed.length,
    },
  };
}

/**
 * Sposta uno spettacolo su un nuovo orario, agganciandolo all'orario elegante
 * libero più vicino. Serve al trascinamento nel calendario: la UI propone una
 * posizione grezza, il motore decide quella legale.
 *
 * `context.occupied` deve contenere tutto **tranne** lo spettacolo che si sta
 * spostando, altrimenti collide con sé stesso.
 *
 * Restituisce `null` se in quella zona non c'è nessuno spazio valido.
 */
export function snapShowTo(
  show: ScheduledShow,
  desiredStart: number,
  context: { occupied: Interval[]; notBefore?: number; searchRadius?: number }
): ScheduledShow | null {
  const radius = context.searchRadius ?? 120;
  const notBefore = context.notBefore ?? Number.NEGATIVE_INFINITY;
  const windowStart = addDaysISO(show.day, -programmingDayIndexOf(show));

  // Trascinando conta la vicinanza al punto di rilascio, ma un orario tondo a
  // portata di mano vince lo stesso: rilasciare alle 16:37 e trovarsi alle
  // 16:30 è ciò che si vuole davvero.
  const candidates = elegantMinutesBetween(desiredStart - radius, desiredStart + radius)
    .map((m) => ({ m, cost: Math.abs(m - desiredStart) + elegantRank(m) * 6 }))
    .sort((a, b) => a.cost - b.cost || Math.abs(a.m - desiredStart) - Math.abs(b.m - desiredStart))
    .map((c) => c.m);

  for (const start of candidates) {
    // Uno spettacolo dopo la mezzanotte appartiene alla serata precedente:
    // apertura e chiusura vanno misurate su quel giorno di programmazione.
    const dayIndex = Math.floor(start / MINUTES_PER_DAY) -
      (minuteOfDay(start) < OPENING_MINUTE ? 1 : 0);
    const dayStart = dayIndex * MINUTES_PER_DAY;

    if (start < notBefore) continue;
    if (start < dayStart + OPENING_MINUTE) continue;
    if (start + show.runtime > dayStart + CLOSING_MINUTE) continue;
    const block = { start, end: start + show.runtime + MIN_GAP_MINUTES };
    if (context.occupied.some((o) => overlaps(block, o))) continue;

    return makeShow(show, start, dayIndex, windowStart, show.locked);
  }

  return null;
}
