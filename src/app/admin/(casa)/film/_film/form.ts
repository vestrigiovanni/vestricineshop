import { normalizeLanguageCode } from '@/constants/languages';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import { extractYouTubeId } from '@/utils/youtubeUtils';

/** La scheda di un film come la scrive chi programma: vince sempre su TMDB. */
export interface FilmForm {
  customTitle: string;
  customOverview: string;
  versionLanguage: string;
  subtitles: string;
  customPosterPath: string;
  customBackdropPath: string;
  customLogoPath: string;
  customDirector: string;
  customCast: string;
  customRoomName: string;
  customRating: string;
  manualSoldOut: boolean;
  customTrailerUrl: string;
  customTrailerTitle: string;
  mubiId: string;
}

export const EMPTY_FORM: FilmForm = {
  customTitle: '',
  customOverview: '',
  versionLanguage: 'ITA',
  subtitles: 'NESSUNO',
  customPosterPath: '',
  customBackdropPath: '',
  customLogoPath: '',
  customDirector: '',
  customCast: '',
  customRoomName: 'SALA CA GRANDA',
  customRating: '',
  manualSoldOut: false,
  customTrailerUrl: '',
  customTrailerTitle: '',
  mubiId: '',
};

export interface Award {
  type?: string;
  label?: string;
  year?: number | string | null;
  details?: string | null;
}

/** Quel che serve di un film letto da TMDB (con la cache locale davanti). */
export interface MovieLike {
  id?: number | string;
  tmdbId?: string;
  title?: string;
  overview?: string;
  original_language?: string;
  release_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  logo_path?: string | null;
  director?: string | string[] | null;
  cast?: string | string[] | null;
  rating?: string | null;
  trailerKey?: string | null;
  mubiId?: string | null;
  awards?: Award[];
}

/** Una personalizzazione salvata: ogni campo può mancare. */
export type OverrideLike = Partial<Record<keyof FilmForm, string | boolean | null>> & {
  isManualOverride?: boolean;
  isDraft?: boolean;
  awards?: Award[];
};

export function movieIdOf(movie: Pick<MovieLike, 'id' | 'tmdbId'>): string {
  return movie.id != null ? String(movie.id) : movie.tmdbId ?? '';
}

function joined(v: string | string[] | null | undefined): string {
  return Array.isArray(v) ? v.join(', ') : v ?? '';
}

function text(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/**
 * La scheda da mostrare: la personalizzazione se c'è, altrimenti TMDB. Un campo
 * personalizzato vuoto resta vuoto, perché svuotarlo è una scelta; un campo mai
 * toccato (`null`) lascia passare TMDB.
 */
export function formFrom(movie: MovieLike, override: OverrideLike = {}, roomName?: string | null): FilmForm {
  const italian = movie.original_language === 'it';
  return {
    customTitle: text(override.customTitle) ?? movie.title ?? '',
    customOverview: text(override.customOverview) ?? movie.overview ?? '',
    versionLanguage: text(override.versionLanguage) || normalizeLanguageCode(movie.original_language ?? ''),
    subtitles: text(override.subtitles) || (italian ? 'NESSUNO' : 'ITA'),
    customPosterPath: text(override.customPosterPath) ?? movie.poster_path ?? '',
    customBackdropPath: text(override.customBackdropPath) ?? movie.backdrop_path ?? '',
    customLogoPath: text(override.customLogoPath) ?? movie.logo_path ?? '',
    customDirector: text(override.customDirector) ?? joined(movie.director),
    customCast: text(override.customCast) ?? joined(movie.cast),
    customRoomName: text(override.customRoomName) || roomName || 'SALA CA GRANDA',
    customRating: text(override.customRating) ?? movie.rating ?? '',
    manualSoldOut: override.manualSoldOut === true,
    customTrailerUrl:
      text(override.customTrailerUrl) ?? (movie.trailerKey ? `https://www.youtube.com/watch?v=${movie.trailerKey}` : ''),
    customTrailerTitle: text(override.customTrailerTitle) ?? '',
    mubiId: text(override.mubiId) ?? movie.mubiId ?? '',
  };
}

function list(v: string): string[] | undefined {
  const items = v.split(',').map((s) => s.trim()).filter(Boolean);
  return items.length ? items : undefined;
}

/** Quello che parte verso `upsertMovieOverride`: regia e cast tornano elenchi. */
export function toPayload(form: FilmForm): Omit<FilmForm, 'customDirector' | 'customCast'> & {
  customDirector?: string[];
  customCast?: string[];
} {
  return { ...form, customDirector: list(form.customDirector), customCast: list(form.customCast) };
}

export function isDirty(saved: FilmForm, current: FilmForm): boolean {
  return (Object.keys(saved) as (keyof FilmForm)[]).some((k) => saved[k] !== current[k]);
}

/** Percorso TMDB, indirizzo completo, oppure niente ("none" = logo nascosto di proposito). */
export function tmdbImage(path: string | null | undefined, size: string): string | null {
  if (!path || path === 'none') return null;
  return getTMDBImageUrl(path, size) ?? null;
}

export function youtubeThumb(url: string | null | undefined): string | null {
  const id = url ? extractYouTubeId(url) : null;
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
}
