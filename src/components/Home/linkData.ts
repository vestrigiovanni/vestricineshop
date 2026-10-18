/**
 * Due servizi della home che vivono anche fuori di lei: la lingua scritta
 * come nella riga dei dati (la usa anche la prenotazione) e i vecchi link
 * `?film=` / `?subevent=`, che aprono la home su un film o su uno spettacolo.
 */
import { getFullLanguageName } from '@/constants/languages';

const norm = (value?: string | null) => (value || '').trim().toLowerCase();

function hasSubtitles(subtitles?: string | null): boolean {
  const s = norm(subtitles);
  return s !== '' && s !== 'nessuno';
}

/** Le stesse sigle di LanguageBadge: ITA, ENG, V.O. */
function shortLanguage(lang: string): string {
  const l = norm(lang);
  if (l === 'italiano' || l === 'ita') return 'ITA';
  if (l === 'francese' || l === 'fra') return 'FRA';
  if (l === 'inglese' || l === 'eng' || l === 'english') return 'ENG';
  if (l === 'giapponese' || l === 'jpn' || l === 'gia') return 'GIA';
  if (l === 'lingua originale' || l === 'originale') return 'V.O.';
  return lang.trim().toUpperCase().substring(0, 3);
}

function displayLanguage(lang: string): string {
  const l = norm(lang);
  if (l === 'ita' || l === 'italiano') return 'ITALIANO';
  if (l === 'fra' || l === 'francese') return 'FRANCESE';
  if (l === 'eng' || l === 'inglese' || l === 'english') return 'INGLESE';
  if (l === 'gia' || l === 'jpn' || l === 'giapponese') return 'GIAPPONESE';
  if (l === 'lingua originale' || l === 'originale') return 'V.O.';
  return getFullLanguageName(lang.trim()).toUpperCase();
}

/** "V.O. · SOTT. ITA · 3D": la lingua come si scrive nella riga dei dati. */
export function languageLabel(language?: string, subtitles?: string, version?: string): string {
  const parts: string[] = [];
  if (language && language.trim()) parts.push(displayLanguage(language));
  if (subtitles && hasSubtitles(subtitles)) parts.push(`SOTT. ${shortLanguage(subtitles)}`);
  if (version && version.trim() && version !== 'Versione Originale') parts.push(version.trim().toUpperCase());
  return parts.join(' · ');
}

/**
 * `?film=<tmdbId>`: il film da cui parte l'hero. Serve ai vecchi link della
 * pagina film, che ora portano alla home. Un film che non è in programmazione
 * si ignora.
 */
export function pickInitialMovieId(
  movies: { id: number }[],
  film?: string | string[] | null
): number | null {
  const raw = Array.isArray(film) ? film[0] : film;
  if (!raw || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return movies.some(m => m.id === id) ? id : null;
}

/**
 * `?subevent=`: i vecchi link della pagina film potevano portare dritti a uno
 * spettacolo. Si apre la prenotazione solo se lo spettacolo è del film scelto
 * e si può ancora prenotare; altrimenti basta la home su quel film.
 */
export function pickInitialSubeventId(
  movies: { id: number; subevents: { id: number; isSoldOut?: boolean }[] }[],
  movieId: number | null,
  subevent?: string | string[] | null
): number | null {
  const raw = Array.isArray(subevent) ? subevent[0] : subevent;
  if (movieId == null || !raw || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  const movie = movies.find(m => m.id === movieId);
  const show = movie?.subevents.find(s => s.id === id);
  return show && !show.isSoldOut ? id : null;
}
