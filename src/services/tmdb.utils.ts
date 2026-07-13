export interface MovieItem {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  original_language?: string;
  original_title?: string;
  rating?: string;
  trailerKey?: string;
  multiLangVideos?: Record<string, any[]>;
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
  'tr': 'Turco',
  'nl': 'Olandese',
  'sv': 'Svedese',
  'no': 'Norvegese',
  'da': 'Danese',
  'fi': 'Finlandese',
  'pl': 'Polacco',
  'hu': 'Ungherese',
  'cs': 'Ceco',
  'el': 'Greco',
  'th': 'Tailandese',
  'vi': 'Vietnamita',
  'id': 'Indonesiano',
  'is': 'Islandese',
  'ro': 'Rumeno',
  'bg': 'Bulgaro',
  'sr': 'Serbo',
  'hr': 'Crostato',
  'sk': 'Slovacco',
  'sl': 'Sloveno',
  'et': 'Estone',
  'lv': 'Lettone',
  'lt': 'Lituano',
  'uk': 'Ucraino',
  'he': 'Ebraico',
  'fa': 'Persiano',
};

/**
 * Detects if a string contains non-Latin characters (Arabic, Cyrillic, CJK, etc.)
 */
export function isNonLatin(text: string): boolean {
  if (!text) return false;
  // Standard Tecnico: rileva script non autorizzati (non-latini)
  // Usiamo nomi brevi (Latn, Zyyy, P) per compatibilità estesa con parser e linter
  return /[^\p{sc=Latn}\p{sc=Zyyy}\p{P}]/u.test(text);
}

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

export interface TMDBBackdrop {
  file_path: string;
  iso_639_1: string | null;
  width?: number;
  vote_average?: number;
  vote_count?: number;
}

/**
 * Sceglie i backdrop "extra" per lo scrollytelling della home:
 * esclude quello principale già in uso nella hero, preferisce le immagini
 * senza testo (iso_639_1 nullo, più cinematografiche) e ordina per voto.
 */
export function pickExtraBackdrops(
  backdrops: TMDBBackdrop[],
  mainBackdropPath: string | null | undefined,
  max: number = 3
): string[] {
  const byScore = (a: TMDBBackdrop, b: TMDBBackdrop) =>
    (b.vote_average || 0) - (a.vote_average || 0) || (b.vote_count || 0) - (a.vote_count || 0);

  const seen = new Set<string>();
  const candidates = backdrops.filter(b => {
    if (!b.file_path || b.file_path === mainBackdropPath || seen.has(b.file_path)) return false;
    seen.add(b.file_path);
    return true;
  });

  const noLang = candidates.filter(b => !b.iso_639_1).sort(byScore);
  const withLang = candidates.filter(b => b.iso_639_1).sort(byScore);

  return [...noLang, ...withLang].slice(0, max).map(b => b.file_path);
}
