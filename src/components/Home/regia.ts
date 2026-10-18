import { toCinemaDayKey } from '@/utils/cinemaDate';
import { resolveFestival, FESTIVAL_PRESTIGE } from './festivals';

/**
 * La regia della home: dai film in sala e dalla data decide che cosa va in
 * ciascun pezzo della pagina. L'ordine dei pezzi è quello scelto da Giovanni
 * il 18 ottobre 2026 (specifica `2026-10-18-home-rivoluzione-design.md`);
 * cambiano ogni giorno i film dentro i pezzi, scelti col seme della data.
 * Funzione pura: niente fetch, niente DOM, stessa data → stessa pagina.
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
  poster_path?: string | null;
  backdrop_path?: string | null;
  logo_path?: string | null;
  extraBackdrops?: string[];
  trailerKeys?: string[];
  trailerKey?: string | null;
  awards?: HomeAward[];
  subevents: HomeShow[];
}

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

export interface Slot<M extends HomeMovie = HomeMovie> { movie: M; show: HomeShow }

export type HomePiece<M extends HomeMovie = HomeMovie> =
  | { kind: 'apertura'; movie: M; show: HomeShow; giro: Slot<M>[] }
  | { kind: 'nastro'; movies: M[] }
  | { kind: 'oggi'; dayKey: string; slots: Slot<M>[] }
  | { kind: 'cartellone'; movies: M[] }
  | { kind: 'conto'; movie: M; show: HomeShow }
  | { kind: 'onore'; movie: M; award: WeighedAward }
  | { kind: 'parete'; items: { movie: M; award: WeighedAward }[] }
  | { kind: 'pellicola'; movies: M[] }
  | { kind: 'giornata'; dayKey: string; slots: Slot<M>[] }
  | { kind: 'locandina'; movie: M }
  | { kind: 'barre'; movie: M }
  | { kind: 'iride'; movie: M }
  | { kind: 'trailer'; movie: M; trailerKey: string }
  | { kind: 'doppio'; dayKey: string; a: Slot<M>; b: Slot<M> }
  | { kind: 'ventaglio'; movies: M[] }
  | { kind: 'sottotitoli'; movie: M; show: HomeShow }
  | { kind: 'settimana'; days: { dayKey: string; slots: Slot<M>[] }[] };

export type PieceKind = HomePiece['kind'];

/**
 * L'ordine dei pezzi, come l'ha consegnato Giovanni con la prova `ordine.html`.
 * Il 19 ottobre 2026 si sono aggiunti il nastro dei titoli e il cartellone:
 * subito dopo l'apertura la pagina deve far vedere quanti film ci sono, e
 * quanto diversi.
 */
export const PIECE_ORDER: PieceKind[] = [
  'apertura', 'nastro', 'oggi', 'cartellone', 'conto', 'onore', 'parete', 'pellicola', 'giornata',
  'locandina', 'barre', 'iride', 'trailer', 'doppio', 'ventaglio', 'sottotitoli', 'settimana',
];

/** Quanti film gira l'apertura, uno dopo l'altro. */
export const GIRO_MAX = 6;

// ─── Premi ────────────────────────────────────────────────────────────────

/** I premi che valgono da soli una pagina intera. */
const SUPREME = /palma d'oro|palme d'or|leone d'oro|golden lion|orso d'oro|golden bear|^miglior film$|^best picture$/i;
export const SUPREME_WEIGHT = 100;

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
  if (won.length) return { ...base, prize: won[0], weight: 40 + rank * 3 + won.length };
  if (nominated.length) return { ...base, prize: nominated[0], weight: 15 + rank };
  return { ...base, prize: 'Selezione ufficiale', weight: rank };
}

export function weighedAwards(m: HomeMovie): WeighedAward[] {
  return (m.awards || []).map(weighAward).sort((x, y) => y.weight - x.weight);
}

// ─── Seme ─────────────────────────────────────────────────────────────────

export function seedFor(dayKey: string): number {
  let h = 2166136261;
  for (const c of dayKey) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function makeRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Aiuti ────────────────────────────────────────────────────────────────

export const backdropsOf = (m: HomeMovie): string[] =>
  [m.backdrop_path, ...(m.extraBackdrops || [])].filter((p): p is string => !!p);

export const trailerOf = (m: HomeMovie): string =>
  m.trailerKey || (m.trailerKeys || []).find(Boolean) || '';

const ITALIAN = /^(italiano|it|ita)$/i;

/** Quanti film provare, in ordine di data, prima di lasciar decidere il seme. */
const WINDOW = 3;

// ─── La pagina ────────────────────────────────────────────────────────────

/**
 * Il giro dell'apertura: il primo spettacolo, poi i prossimi film diversi
 * ancora prenotabili, in ordine di tempo. Chi apre il sito vede subito che in
 * sala c'è più di un film.
 */
export function giroFrom<M extends HomeMovie>(slots: Slot<M>[], first: Slot<M>, max = GIRO_MAX): Slot<M>[] {
  const out: Slot<M>[] = [first];
  for (const s of slots) {
    if (out.length >= max) break;
    if (s.show.isSoldOut || out.some(o => o.movie.id === s.movie.id)) continue;
    out.push(s);
  }
  return out;
}

export function buildHomePlan<M extends HomeMovie>(movies: M[], now: Date = new Date()): HomePiece<M>[] {
  const todayKey = toCinemaDayKey(now);
  const rand = makeRandom(seedFor(todayKey));

  // Gli spettacoli ancora da iniziare, in ordine di tempo.
  const slots: Slot<M>[] = movies
    .flatMap(movie => movie.subevents.filter(s => new Date(s.date) >= now).map(show => ({ movie, show })))
    .sort((a, b) => a.show.date.localeCompare(b.show.date));
  if (!slots.length) return [];

  const dayKeys = [...new Set(slots.map(s => toCinemaDayKey(s.show.date)))];
  const slotsOn = (day: string) => slots.filter(s => toCinemaDayKey(s.show.date) === day);
  const firstShow = new Map<number, Slot<M>>();
  for (const s of slots) if (!firstShow.has(s.movie.id)) firstShow.set(s.movie.id, s);
  const byDate = [...firstShow.values()].map(s => s.movie);

  const pieces: Partial<Record<PieceKind, HomePiece<M>>> = {};
  const opening = slots[0];
  pieces.apertura = { kind: 'apertura', movie: opening.movie, show: opening.show, giro: giroFrom(slots, opening) };
  // Tutti i film, nell'ordine in cui arrivano in sala.
  pieces.nastro = { kind: 'nastro', movies: byDate };

  const firstDay = dayKeys[0];
  pieces.oggi = { kind: 'oggi', dayKey: firstDay, slots: slotsOn(firstDay) };
  pieces.conto = { kind: 'conto', movie: opening.movie, show: opening.show };
  pieces.cartellone = { kind: 'cartellone', movies: byDate };

  // Premi
  const laureate = byDate
    .map(movie => ({ movie, award: weighedAwards(movie)[0] }))
    .filter(x => x.award && x.award.weight >= SUPREME_WEIGHT)
    .sort((a, b) => b.award.weight - a.award.weight)[0];
  if (laureate) pieces.onore = { kind: 'onore', movie: laureate.movie, award: laureate.award };
  const wall = byDate
    .flatMap(movie => weighedAwards(movie).filter(a => a.won.length).map(award => ({ movie, award })))
    .filter(x => !(laureate && x.movie === laureate.movie && x.award.type === laureate.award.type && x.award.year === laureate.award.year))
    .sort((a, b) => b.award.weight - a.award.weight)
    .slice(0, 10);
  if (wall.length) pieces.parete = { kind: 'parete', items: wall };

  // I film dei pezzi "prossimi": prima quelli che oggi non si proiettano.
  const todayIds = new Set(slotsOn(firstDay).map(s => s.movie.id));
  const pool = [...byDate.filter(m => !todayIds.has(m.id)), ...byDate.filter(m => todayIds.has(m.id))];
  const used = new Set<number>();
  const take = (ok: (m: M) => boolean): M | null => {
    let candidates = pool.filter(m => !used.has(m.id) && ok(m));
    if (!candidates.length) candidates = pool.filter(ok);
    if (!candidates.length) return null;
    const window = candidates.slice(0, WINDOW);
    const chosen = window[Math.floor(rand() * window.length)];
    used.add(chosen.id);
    return chosen;
  };

  // Prima i pezzi con richieste strette (pochi film adatti), poi gli altri:
  // così un film raro non finisce in un pezzo qualsiasi.
  const longOverview = (m: M) => (m.overview || '').length >= 250;
  const foreign = (m: M) => { const s = firstShow.get(m.id)?.show; return !!s?.language && !ITALIAN.test(s.language); };
  const subs = take(m => longOverview(m) && foreign(m)) || take(longOverview);
  if (subs) pieces.sottotitoli = { kind: 'sottotitoli', movie: subs, show: firstShow.get(subs.id)!.show };

  const trailer = take(m => !!trailerOf(m));
  if (trailer) pieces.trailer = { kind: 'trailer', movie: trailer, trailerKey: trailerOf(trailer) };

  // Il doppio programma guarda prima ai giorni dopo il primo: quelli di oggi sono già in "Oggi".
  for (const day of [...dayKeys.slice(1), dayKeys[0]]) {
    const distinct = [...new Map(slotsOn(day).map(s => [s.movie.id, s])).values()];
    const fresh = distinct.filter(s => !used.has(s.movie.id));
    const pair = fresh.length >= 2 ? fresh : null;
    if (pair) {
      pieces.doppio = { kind: 'doppio', dayKey: day, a: pair[0], b: pair[1] };
      used.add(pair[0].movie.id); used.add(pair[1].movie.id);
      break;
    }
  }

  const strip: M[] = [];
  for (let i = 0; i < 3; i++) {
    const m = take(x => backdropsOf(x).length >= 4 && !strip.includes(x));
    if (m) strip.push(m);
  }
  if (strip.length) pieces.pellicola = { kind: 'pellicola', movies: strip };

  const bars = take(m => backdropsOf(m).length >= 4);
  if (bars) pieces.barre = { kind: 'barre', movie: bars };
  const poster = take(m => !!m.poster_path && !!m.backdrop_path);
  if (poster) pieces.locandina = { kind: 'locandina', movie: poster };
  const iris = take(m => !!m.backdrop_path);
  if (iris) pieces.iride = { kind: 'iride', movie: iris };

  const fullDays = dayKeys.filter(d => slotsOn(d).length >= 3).slice(0, 3);
  if (fullDays.length) {
    const day = fullDays[Math.floor(rand() * fullDays.length)];
    pieces.giornata = { kind: 'giornata', dayKey: day, slots: slotsOn(day) };
  }

  // Il ventaglio raccoglie i film più lontani: prima quelli rimasti fuori.
  const farthest = [...byDate].reverse().filter(m => !!m.poster_path);
  const fan = [...farthest.filter(m => !used.has(m.id)), ...farthest.filter(m => used.has(m.id))].slice(0, 7);
  if (fan.length >= 4) pieces.ventaglio = { kind: 'ventaglio', movies: fan.reverse() };

  pieces.settimana = { kind: 'settimana', days: dayKeys.map(dayKey => ({ dayKey, slots: slotsOn(dayKey) })) };

  return PIECE_ORDER.map(k => pieces[k]).filter((p): p is HomePiece<M> => !!p);
}
