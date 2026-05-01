/**
 * Mapping of ISO 639-1 (2 letters) to ISO 639-2/3 (3 letters)
 * Used for movie language version and subtitles logic.
 */
export const LANGUAGE_MAP: Record<string, string> = {
  en: 'ENG',
  it: 'ITA',
  fr: 'FRA',
  es: 'SPA',
  de: 'GER',
  ja: 'JPN',
  ko: 'KOR',
  zh: 'CHI',
  pt: 'POR',
  ru: 'RUS',
  hi: 'HIN',
  ar: 'ARA',
  tr: 'TUR',
  nl: 'NLD',
  sv: 'SWE',
  no: 'NOR',
  da: 'DAN',
  fi: 'FIN',
  pl: 'POL',
  hu: 'HUN',
  cs: 'CZE',
  el: 'ELL',
  th: 'THA',
  vi: 'VIE',
  id: 'IND',
};

/**
 * Mapping of 3-letter codes to full Italian names for tooltips.
 */
export const FULL_LANGUAGE_NAMES: Record<string, string> = {
  ENG: 'Inglese',
  ITA: 'Italiano',
  FRA: 'Francese',
  SPA: 'Spagnolo',
  GER: 'Tedesco',
  JPN: 'Giapponese',
  KOR: 'Coreano',
  CHI: 'Cinese',
  POR: 'Portoghese',
  RUS: 'Russo',
  HIN: 'Indi',
  ARA: 'Arabo',
  TUR: 'Turco',
  NLD: 'Olandese',
  SWE: 'Svedese',
  NOR: 'Norvegese',
  DAN: 'Danese',
  FIN: 'Finlandese',
  POL: 'Polacco',
  HUN: 'Ungherese',
  CZE: 'Ceco',
  ELL: 'Greco',
  THA: 'Tailandese',
  VIE: 'Vietnamita',
  IND: 'Indonesiano',
  ISL: 'Islandese',
};

export function getFullLanguageName(code: string): string {
  if (!code) return '';
  const upper = code.toUpperCase();
  return FULL_LANGUAGE_NAMES[upper] || upper;
}


/**
 * Normalizes a 2-letter language code to a 3-letter code.
 * If the code is not in the map, it returns the uppercase of the original code
 * (or handles it gracefully if it's already 3 letters).
 */
export function normalizeLanguageCode(code: string): string {
  if (!code) return 'UNK';
  const lowerCode = code.toLowerCase();
  if (LANGUAGE_MAP[lowerCode]) {
    return LANGUAGE_MAP[lowerCode];
  }
  // If it's already 3 letters, just uppercase it
  if (code.length === 3) {
    return code.toUpperCase();
  }
  // Fallback: Uppercase of TMDB 2-letter code
  return code.toUpperCase();
}

export const SUBTITLE_OPTIONS = [
  'NESSUNO',
  'ITA',
  'ENG',
  'FRA',
  'SPA',
  'GER',
];
