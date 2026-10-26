import { toCinemaDayKey } from '@/utils/cinemaDate';
import { resolveFestival, FESTIVAL_PRESTIGE } from './festivals';

/**
 * La regia della home (26 ottobre 2026, con la skill scroll-craft): dai film in
 * sala decide che cosa va in ciascun atto della pagina. Il percorso è quello
 * di Giovanni: "i film più prossimi in sala fino a quelli più lontani", calmo
 * all'inizio e intenso alla fine, col trailer muto come momento da ricordare.
 * Funzione pura: niente fetch, niente DOM, stessa data → stessa pagina.
 * Vedi docs/scrollcraft/builds/vestri-sala/BRIEF.md.
 */

export interface HomeShow {
  id: number;
  date: string;
  isSoldOut?: boolean;
  language?: string;
  subtitles?: string;
  specs?: string[];
  roomName?: string;
}

export interface HomeAward {
  type: string;
  year?: number | null;
  details?: string | null;
}

export interface HomeMovie {
  id: number;
  title: string;
  overview?: string;
  tagline?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  logo_path?: string | null;
  extraBackdrops?: string[];
  trailerKeys?: string[];
  trailerKey?: string | null;
  awards?: HomeAward[];
  subevents: HomeShow[];
}

export interface Slot<M extends HomeMovie = HomeMovie> { movie: M; show: HomeShow }

export interface Giorno<M extends HomeMovie = HomeMovie> { dayKey: string; slots: Slot<M>[] }

export interface Programma<M extends HomeMovie = HomeMovie> {
  /** Atto 1: il primo spettacolo, a tutto schermo. */
  primo: Slot<M>;
  /** Atto 2: gli altri film dello stesso giorno, uno che sfuma nell'altro. */
  oggi: Slot<M>[];
  /** Atto 3: le locandine dei giorni dopo, che scorrono di lato. */
  prossimi: Slot<M>[];
  /** Atti 4 e 5: le luci si spengono e parte il trailer. */
  trailer: { slot: Slot<M>; key: string } | null;
  /** Atto 6: i film più lontani, a fasce sempre più strette. */
  lontani: Slot<M>[];
  /** Atto 7: tutto il programma, giorno per giorno. */
  giorni: Giorno<M>[];
  /** Tutti i film, nell'ordine in cui arrivano in sala. */
  film: Slot<M>[];
}

/** Quanti film, al massimo, sfumano uno nell'altro nell'atto "Oggi". */
export const OGGI_MAX = 3;
/** Le locandine che scorrono di lato: almeno e al massimo. */
export const PROSSIMI_MIN = 3;
export const PROSSIMI_MAX = 6;

// ─── Premi ────────────────────────────────────────────────────────────────

export interface WeighedAward {
  type: string;
  year: number | null;
  festival: string;
  prize: string;
  won: string[];
  nominated: string[];
  selection: boolean;
  weight: number;
}

/** I premi che valgono da soli una pagina intera. */
const SUPREME = /palma d'oro|palme d'or|leone d'oro|golden lion|orso d'oro|golden bear|^miglior film$|^best picture$/i;
export const SUPREME_WEIGHT = 100;
/** Da qui in su è un premio vinto, e va sulla scheda del film. */
export const WON_WEIGHT = 40;

function festivalRank(type: string): number {
  const key = resolveFestival(type).key;
  const i = FESTIVAL_PRESTIGE.indexOf(key);
  return i < 0 ? 1 : FESTIVAL_PRESTIGE.length - i;
}

const splitList = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean);

/** Legge "Vincitore: … · Candidatura: … " oppure "Selezione Ufficiale". */
export function weighAward(a: HomeAward): WeighedAward {
  const won: string[] = [], nominated: string[] = [];
  let selection = false;
  for (const part of (a.details || '').split(' · ')) {
    if (/^Vincitore:/i.test(part)) won.push(...splitList(part.replace(/^Vincitore:/i, '')));
    else if (/^Candidatura:/i.test(part)) nominated.push(...splitList(part.replace(/^Candidatura:/i, '')));
    else if (/selezione/i.test(part)) selection = true;
  }
  const rank = festivalRank(a.type);
  const base = { type: a.type, year: a.year ?? null, festival: resolveFestival(a.type).key, won, nominated, selection };
  const supreme = won.find(w => SUPREME.test(w));
  if (supreme) return { ...base, prize: supreme, weight: SUPREME_WEIGHT + rank };
  if (won.length) return { ...base, prize: won[0], weight: WON_WEIGHT + rank * 3 + won.length };
  if (nominated.length) return { ...base, prize: nominated[0], weight: 15 + rank };
  return { ...base, prize: 'Selezione ufficiale', weight: rank };
}

/** Il premio più importante vinto dal film, se ne ha vinto uno. */
export function premioDi(m: HomeMovie): WeighedAward | null {
  const best = (m.awards || []).map(weighAward).sort((x, y) => y.weight - x.weight)[0];
  return best && best.weight >= WON_WEIGHT ? best : null;
}

// ─── Seme ─────────────────────────────────────────────────────────────────

export function seedFor(dayKey: string): number {
  let h = 2166136261;
  for (const c of dayKey) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export const trailerOf = (m: HomeMovie): string =>
  m.trailerKey || (m.trailerKeys || []).find(Boolean) || '';

// ─── La pagina ────────────────────────────────────────────────────────────

/** Il primo spettacolo ancora prenotabile di un film (o il primo, se sono tutti esauriti). */
export function nextShow<M extends HomeMovie>(m: M, now: Date): HomeShow | null {
  const future = m.subevents.filter(s => new Date(s.date) >= now).sort((a, b) => a.date.localeCompare(b.date));
  return future.find(s => !s.isSoldOut) || future[0] || null;
}

export function buildProgramma<M extends HomeMovie>(movies: M[], now: Date = new Date()): Programma<M> | null {
  // Un film per riga, col suo prossimo spettacolo, in ordine di tempo.
  const film: Slot<M>[] = movies
    .map(movie => ({ movie, show: nextShow(movie, now) }))
    .filter((s): s is Slot<M> => !!s.show)
    .sort((a, b) => a.show.date.localeCompare(b.show.date));
  if (!film.length) return null;

  const [primo, ...dopo] = film;
  const giornoPrimo = toCinemaDayKey(primo.show.date);

  // Oggi: gli altri film dello stesso giorno. Se il primo è da solo, i due che vengono dopo.
  let oggi = dopo.filter(s => toCinemaDayKey(s.show.date) === giornoPrimo).slice(0, OGGI_MAX);
  if (!oggi.length) oggi = dopo.slice(0, 2);
  const resto = dopo.slice(oggi.length);

  // Le locandine prendono la prima metà di quello che resta; i lontani, il trailer e le fasce, il resto.
  let prossimi: Slot<M>[] = [];
  let dopoProssimi = resto;
  if (resto.length >= PROSSIMI_MIN + 1) {
    const n = Math.min(PROSSIMI_MAX, Math.max(PROSSIMI_MIN, Math.ceil(resto.length / 2)));
    prossimi = resto.slice(0, n);
    dopoProssimi = resto.slice(n);
  }

  // Il trailer: fra i primi due film con un trailer dopo le locandine, lo sceglie il seme del giorno.
  // Se dopo non ce n'è, si torna indietro fino al primo film: il momento da ricordare non si perde.
  const conTrailer = (xs: Slot<M>[]) => xs.filter(s => !!trailerOf(s.movie));
  const candidati = [conTrailer(dopoProssimi), conTrailer(prossimi), conTrailer(oggi), conTrailer([primo])].find(c => c.length) || [];
  const scelto = candidati.length ? candidati.slice(0, 2)[seedFor(toCinemaDayKey(now)) % Math.min(2, candidati.length)] : null;
  const trailer = scelto ? { slot: scelto, key: trailerOf(scelto.movie) } : null;
  const lontani = dopoProssimi.filter(s => s !== scelto);

  // Il programma intero: tutti gli spettacoli futuri, giorno per giorno.
  const tutti: Slot<M>[] = movies
    .flatMap(movie => movie.subevents.filter(s => new Date(s.date) >= now).map(show => ({ movie, show })))
    .sort((a, b) => a.show.date.localeCompare(b.show.date));
  const giorni: Giorno<M>[] = [];
  for (const s of tutti) {
    const dayKey = toCinemaDayKey(s.show.date);
    const g = giorni[giorni.length - 1];
    if (g && g.dayKey === dayKey) g.slots.push(s);
    else giorni.push({ dayKey, slots: [s] });
  }

  return { primo, oggi, prossimi, trailer, lontani, giorni, film };
}
