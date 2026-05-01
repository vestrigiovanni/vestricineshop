export interface MovieItem {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  original_language?: string;
  rating?: string;
  trailerKey?: string;
  multiLangVideos?: { it: any[]; en: any[]; original: any[] };
  director?: string | string[];
  cast?: string[];
}

const LANGUAGE_MAP: Record<string, string> = {
  'en': 'Inglese',
  'it': 'Italiano',
  'fr': 'Francese',
  'de': 'Tedesco',
  'es': 'Spagnolo',
  'ja': 'Giapponese',
  'ko': 'Coreano',
  'zh': 'Cinese',
  'ru': 'Russo',
  'pt': 'Portoghese',
  'hi': 'Indiano',
  'ar': 'Arabo',
};

/**
 * Converts a TMDB language code to a human-readable Italian name.
 */
export function getLanguageName(code?: string): string {
  if (!code) return 'N/D';
  const name = LANGUAGE_MAP[code.toLowerCase()];
  if (name) return name;
  return 'Originale';
}

/**
 * Helper to construct the full image URL from TMDB path.
 * Size can be 'w500', 'original', etc.
 */
export function getTMDBImageUrl(path: string | null | undefined, size: string = 'w500'): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http')) return path;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}
