import { unstable_cache } from 'next/cache';
import { pickExtraBackdrops, pickTagline, TMDBBackdrop } from './tmdb.utils';
import { TMDB_API_KEY, TMDB_BASE_URL } from './tmdb';

// I fondali extra dei film in sala, letti da TMDB al momento e tenuti in cache
// per un giorno. Non si scrive niente nel database: il catalogo resta com'è.

export const MAX_EXTRA_BACKDROPS = 6;
const ONE_DAY = 60 * 60 * 24;

/**
 * Solo fondali senza scritte (`include_image_language=null`): sono materia
 * grafica, il titolo lo porta già il logo del film. Se TMDB non risponde
 * lancia un errore, così la cache non si tiene una lista vuota per un giorno.
 */
export async function fetchBackdrops(tmdbId: string): Promise<TMDBBackdrop[]> {
  const url = `${TMDB_BASE_URL}/movie/${tmdbId}/images?include_image_language=null&api_key=${TMDB_API_KEY}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`TMDB images ${tmdbId}: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.backdrops) ? data.backdrops : [];
}

const cachedExtraBackdrops = unstable_cache(
  async (tmdbId: string, mainBackdropPath: string) =>
    pickExtraBackdrops(await fetchBackdrops(tmdbId), mainBackdropPath, MAX_EXTRA_BACKDROPS),
  ['film-extra-backdrops-v1'],
  { revalidate: ONE_DAY }
);

/**
 * Completa i film che nel catalogo non hanno fondali extra. Chi li ha già
 * (scelti a mano) li tiene; se TMDB non risponde il film resta col suo fondale.
 */
export async function withExtraBackdrops<
  T extends { id: number; backdrop_path: string | null; extraBackdrops?: string[] }
>(movies: T[]): Promise<T[]> {
  return Promise.all(
    movies.map(async movie => {
      if (movie.extraBackdrops?.length) return movie;
      try {
        const extra = await cachedExtraBackdrops(String(movie.id), movie.backdrop_path ?? '');
        return { ...movie, extraBackdrops: extra };
      } catch (err) {
        console.warn('[fondali] TMDB non risponde per', movie.id, (err as Error).message);
        return movie;
      }
    })
  );
}

// ─── Il motto ─────────────────────────────────────────────────────────────

/**
 * Il motto di un film, letto da TMDB al momento e tenuto in cache per un giorno,
 * come i fondali: nel catalogo il campo `tagline` c'è, ma il 10 novembre 2026
 * era vuoto per tutti i 43 film in sala, e l'atto "le luci si spengono" restava
 * senza la sua riga. Qui non si scrive nel database. Se TMDB non risponde lancia
 * un errore, così la cache non si tiene un motto vuoto per un giorno.
 */
export async function fetchTagline(tmdbId: string): Promise<string> {
  const url = `${TMDB_BASE_URL}/movie/${tmdbId}?language=it-IT&append_to_response=translations&api_key=${TMDB_API_KEY}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`TMDB movie ${tmdbId}: ${res.status}`);
  return pickTagline(await res.json());
}

const cachedTagline = unstable_cache(
  async (tmdbId: string) => fetchTagline(tmdbId),
  ['film-tagline-v1'],
  { revalidate: ONE_DAY }
);

/**
 * Completa i film che nel catalogo non hanno il motto. Chi ce l'ha (scritto a
 * mano o arrivato dalla sincronizzazione) lo tiene; se TMDB non risponde il
 * film resta senza.
 */
export async function withTaglines<T extends { id: number; tagline?: string }>(movies: T[]): Promise<T[]> {
  return Promise.all(
    movies.map(async movie => {
      if (movie.tagline?.trim()) return movie;
      try {
        const tagline = await cachedTagline(String(movie.id));
        return tagline ? { ...movie, tagline } : movie;
      } catch (err) {
        console.warn('[motto] TMDB non risponde per', movie.id, (err as Error).message);
        return movie;
      }
    })
  );
}
