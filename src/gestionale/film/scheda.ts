import { linguaVersione, type FilmTmdb } from '../tmdb/scelte';

/**
 * La scheda di un film (una riga di `MovieOverride`) e la regola che la tiene
 * in piedi: **i testi di Gio vincono su TMDB**.
 *
 * - Una scheda nuova, o ancora «Caricamento...», prende tutto da TMDB.
 * - Una scheda salvata da Gio (`isManualOverride`) tiene ogni campo che Gio ha
 *   scritto, anche vuoto: svuotarlo è stata una scelta. TMDB riempie solo i
 *   campi mai toccati (`null`).
 * - Una scheda mai toccata da Gio si completa da TMDB nei campi vuoti; con
 *   «Rileggi da TMDB» (`forza`) si riscrive.
 *
 * Funzioni pure, testate in `scheda.test.ts`.
 */
export const STUB = 'Caricamento...';

export interface Scheda {
  tmdbId: string;
  customTitle: string | null;
  customOverview: string | null;
  customRating: string | null;
  customPosterPath: string | null;
  customBackdropPath: string | null;
  customLogoPath: string | null;
  customTrailerUrl: string | null;
  customTrailerTitle: string | null;
  customTrailerKeys: string[];
  customDirector: string | null;
  customCast: string | null;
  customRoomName: string | null;
  versionLanguage: string | null;
  subtitles: string | null;
  manualSoldOut: boolean;
  isManualOverride: boolean;
  tagline: string | null;
  extraBackdrops: string[];
  genres: string[];
  voteAverage: number | null;
  releaseDate: string | null;
  runtime: number | null;
  mubiId: string | null;
}

type Campi = Omit<Scheda, 'tmdbId' | 'manualSoldOut' | 'isManualOverride' | 'customRoomName' | 'customTrailerTitle' | 'mubiId'>;

/** Quello che TMDB direbbe per ogni campo della scheda. */
export function daTmdb(t: FilmTmdb): Campi {
  const primo = t.trailer[0];
  return {
    customTitle: t.titolo || null,
    customOverview: t.trama || null,
    customRating: t.divieto || 'T',
    customPosterPath: t.locandina || null,
    customBackdropPath: t.fondale || null,
    customLogoPath: t.logo || null,
    customTrailerUrl: primo ? `https://www.youtube.com/watch?v=${primo}` : null,
    customTrailerKeys: t.trailer,
    customDirector: t.regia.join(', ') || null,
    customCast: t.cast.join(', ') || null,
    versionLanguage: linguaVersione(t.linguaOriginale),
    subtitles: t.linguaOriginale === 'it' ? 'NESSUNO' : 'ITA',
    tagline: t.motto || null,
    extraBackdrops: t.fondaliExtra,
    genres: t.generi,
    voteAverage: t.voto,
    releaseDate: t.uscita || null,
    runtime: t.durata,
  };
}

const CAMPI = [
  'customTitle', 'customOverview', 'customRating', 'customPosterPath', 'customBackdropPath', 'customLogoPath',
  'customTrailerUrl', 'customTrailerKeys', 'customDirector', 'customCast', 'versionLanguage', 'subtitles',
  'tagline', 'extraBackdrops', 'genres', 'voteAverage',
] as const satisfies readonly (keyof Campi)[];

/** Questi sono fatti, non testi: se TMDB li sa, valgono sempre. */
const FATTI = ['releaseDate', 'runtime'] as const;

function vuoto(v: unknown, diGio: boolean): boolean {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  // Per Gio un campo svuotato è una scelta; per la sync una stringa vuota è un buco.
  return !diGio && v === '';
}

/**
 * Cosa scrivere nella scheda dopo aver letto TMDB. Restituisce solo i campi
 * che cambiano; `{}` se non c'è niente da fare.
 */
export function riempi(esistente: Partial<Scheda> | null, t: FilmTmdb, forza = false): Partial<Scheda> {
  const nuovo = daTmdb(t);
  const stub = !esistente || esistente.customTitle === STUB;
  const diGio = !stub && esistente?.isManualOverride === true;
  const out: Partial<Scheda> = {};
  const metti = <K extends keyof Campi>(k: K, v: Campi[K]) => {
    if (JSON.stringify(esistente?.[k] ?? null) !== JSON.stringify(v ?? null)) (out as Record<string, unknown>)[k] = v;
  };

  for (const k of CAMPI) {
    const tmdb = nuovo[k];
    if (vuoto(tmdb, false)) continue; // TMDB non lo sa: si tiene quel che c'è
    if (stub || vuoto(esistente?.[k], diGio) || (forza && !diGio)) metti(k, tmdb);
  }
  for (const k of FATTI) if (nuovo[k] != null) metti(k, nuovo[k]);
  return out;
}

/**
 * «Torna come su TMDB»: i testi, le immagini e i trailer tornano quelli di
 * TMDB e la scheda non è più di Gio. Lingua, sottotitoli, sala ed esaurito
 * restano: dicono com'è la copia in sala, non com'è il film.
 */
export function tornaATmdb(t: FilmTmdb): Partial<Scheda> {
  const { versionLanguage: _l, subtitles: _s, ...resto } = daTmdb(t);
  return { ...resto, isManualOverride: false };
}

// ─── Il modulo della stanza Film ──────────────────────────────────────────

/** Quello che Gio può scrivere a mano. */
export interface Modulo {
  customTitle: string;
  customOverview: string;
  tagline: string;
  customDirector: string;
  customCast: string;
  versionLanguage: string;
  subtitles: string;
  customRating: string;
  customRoomName: string;
  customPosterPath: string;
  customBackdropPath: string;
  customLogoPath: string;
  customTrailerUrl: string;
  customTrailerTitle: string;
  manualSoldOut: boolean;
}

export const CAMPI_MODULO = [
  'customTitle', 'customOverview', 'tagline', 'customDirector', 'customCast', 'versionLanguage', 'subtitles',
  'customRating', 'customRoomName', 'customPosterPath', 'customBackdropPath', 'customLogoPath',
  'customTrailerUrl', 'customTrailerTitle', 'manualSoldOut',
] as const satisfies readonly (keyof Modulo)[];

export function moduloDa(s: Partial<Scheda>): Modulo {
  const t = (v: string | null | undefined) => (v === STUB ? '' : v ?? '');
  return {
    customTitle: t(s.customTitle),
    customOverview: t(s.customOverview),
    tagline: t(s.tagline),
    customDirector: t(s.customDirector),
    customCast: t(s.customCast),
    versionLanguage: t(s.versionLanguage) || 'ITALIANO',
    subtitles: t(s.subtitles) || 'NESSUNO',
    customRating: t(s.customRating) || 'T',
    customRoomName: t(s.customRoomName),
    customPosterPath: t(s.customPosterPath),
    customBackdropPath: t(s.customBackdropPath),
    customLogoPath: t(s.customLogoPath),
    customTrailerUrl: t(s.customTrailerUrl),
    customTrailerTitle: t(s.customTrailerTitle),
    manualSoldOut: s.manualSoldOut === true,
  };
}

/**
 * Dal modulo alla scheda da salvare. Gli spazi in più si tolgono, regia e cast
 * diventano «A, B, C», e la scheda diventa di Gio: la sync non la riscrive più.
 */
export function daModulo(m: Modulo): Partial<Scheda> {
  const elenco = (v: string) => v.split(',').map(x => x.trim()).filter(Boolean).join(', ');
  const out: Partial<Scheda> = { isManualOverride: true, manualSoldOut: m.manualSoldOut === true };
  for (const k of CAMPI_MODULO) {
    if (k === 'manualSoldOut') continue;
    const v = String(m[k] ?? '').trim();
    (out as Record<string, unknown>)[k] = k === 'customDirector' || k === 'customCast' ? elenco(v) : v;
  }
  if (!out.customTitle) out.customTitle = null;
  return out;
}

export function cambiato(a: Modulo, b: Modulo): boolean {
  return CAMPI_MODULO.some(k => a[k] !== b[k]);
}

/** La prossima proiezione e quante ne restano: il database tiene anche quelle passate. */
export function prossima<T extends { dateFrom: string | Date }>(spettacoli: T[], oraMs: number): { prossima: string | null; quante: number } {
  const future = spettacoli
    .map(p => (typeof p.dateFrom === 'string' ? p.dateFrom : p.dateFrom.toISOString()))
    .filter(d => Date.parse(d) >= oraMs)
    .sort();
  return { prossima: future[0] ?? null, quante: future.length };
}
