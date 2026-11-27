import type { Film, Show } from './metadati';
import { formatYear } from './date';

/**
 * Dalle righe del database ai film della Home. Funzione pura (i test sono in
 * `film.test.ts`); la lettura vera sta in `carica.ts`.
 *
 * Le regole, dalla v1: i testi di Gio (MovieOverride) vincono su Pretix e TMDB;
 * l'esaurito messo a mano vale per tutti gli spettacoli; generi, voto e titolo
 * originale si prendono dal catalogo quando la scheda non li ha (il 10/11/2026
 * erano vuoti in tutte le schede); una proiezione senza scheda film non si mostra.
 */

export interface Riga {
  pretixId: number;
  name: string;
  dateFrom: Date;
  roomName: string | null;
  isSoldOut: boolean;
  tmdbId: string | null;
  metaLingua: string | null;
  metaSottotitoli: string | null;
  metaFormat: string | null;
  projectionSpecs: string[];
  projectionSpecsNote: string | null;
  availableSeats: number | null;
  totalSeats: number | null;
  movie: {
    tmdbId: string;
    customTitle: string | null;
    customOverview: string | null;
    customRating: string | null;
    customPosterPath: string | null;
    customBackdropPath: string | null;
    customLogoPath: string | null;
    customTrailerUrl: string | null;
    customTrailerKeys: string[];
    customDirector: string | null;
    customCast: string | null;
    customRoomName: string | null;
    manualSoldOut: boolean;
    releaseDate: string | null;
    runtime: number | null;
    tagline: string | null;
    genres: string[];
    voteAverage: number | null;
    awards: { type: string; year: number | null; details: string | null }[];
  } | null;
}

export interface DalCatalogo {
  tmdbId: string | null;
  genres: string[];
  voteAverage: number | null;
  originalTitle: string | null;
}

/** L'id di un video YouTube da un link qualsiasi (o dall'id stesso). */
export function idYouTube(link: string | null | undefined): string {
  const t = (link || '').trim();
  if (/^[\w-]{11}$/.test(t)) return t;
  return t.match(/(?:youtube(?:-nocookie)?\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([\w-]{11})/i)?.[1] ?? '';
}

/** L'anno da "2024-10-18" o da una data scritta in altro modo. */
function annoDi(raw: string | null): string {
  if (!raw) return '';
  if (/^\d{4}-/.test(raw)) return raw.slice(0, 4);
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? '' : formatYear(d);
}

export function filmDaRighe(righe: Riga[], catalogo: DalCatalogo[], _now: Date = new Date()): Film[] {
  const delCatalogo = new Map(catalogo.filter(c => c.tmdbId).map(c => [String(c.tmdbId), c]));
  const perFilm = new Map<string, { m: NonNullable<Riga['movie']>; shows: Show[] }>();

  for (const r of righe) {
    const m = r.movie;
    if (!r.tmdbId || !m) continue;
    const voce = perFilm.get(r.tmdbId) ?? { m, shows: [] };
    perFilm.set(r.tmdbId, voce);
    voce.shows.push({
      id: r.pretixId,
      date: r.dateFrom.toISOString(),
      isSoldOut: m.manualSoldOut || r.isSoldOut,
      roomName: m.customRoomName || r.roomName || '',
      language: r.metaLingua || '',
      subtitles: r.metaSottotitoli || '',
      format: r.metaFormat || '',
      specs: r.projectionSpecs || [],
      specsNote: r.projectionSpecsNote || '',
      availableSeats: typeof r.availableSeats === 'number' ? r.availableSeats : null,
      totalSeats: typeof r.totalSeats === 'number' ? r.totalSeats : null,
    });
  }

  return [...perFilm.entries()].map(([tmdbId, { m, shows }]) => {
    const c = delCatalogo.get(tmdbId);
    const chiavi = (m.customTrailerKeys || []).filter(Boolean);
    return {
      id: Number(tmdbId),
      title: (m.customTitle || '').trim() || 'Senza titolo',
      overview: m.customOverview || '',
      tagline: (m.tagline || '').trim(),
      poster_path: m.customPosterPath || '',
      backdrop_path: m.customBackdropPath || '',
      logo_path: m.customLogoPath === 'none' ? '' : m.customLogoPath || '',
      release_year: annoDi(m.releaseDate),
      director: m.customDirector || '',
      runtime: m.runtime,
      cast: m.customCast ? m.customCast.split(',').map(s => s.trim()).filter(Boolean) : [],
      rating: m.customRating || 'T',
      trailerKey: idYouTube(m.customTrailerUrl) || chiavi[0] || '',
      trailerKeys: chiavi,
      awards: m.awards,
      genres: m.genres?.length ? m.genres : c?.genres ?? [],
      voteAverage: typeof m.voteAverage === 'number' && m.voteAverage > 0 ? m.voteAverage : c?.voteAverage ?? null,
      originalTitle: (c?.originalTitle || '').trim(),
      isSoldOut: shows.length > 0 && shows.every(s => s.isSoldOut),
      subevents: shows,
    };
  });
}
