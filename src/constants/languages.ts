/**
 * Mapping of ISO 639-1 (2 letters) to ISO 639-2/3 (3 letters)
 * Used for movie language version and subtitles logic.
 */
export const LANGUAGE_MAP: Record<string, string> = {
  en: 'INGLESE',
  it: 'ITALIANO',
  fr: 'FRANCESE',
  es: 'SPAGNOLO',
  de: 'TEDESCO',
  ja: 'GIAPPONESE',
  ko: 'COREANO',
  zh: 'CINESE',
  pt: 'PORTOGHESE',
  ru: 'RUSSO',
  hi: 'INDIANO',
  ar: 'ARABO',
  tr: 'TURCO',
  nl: 'OLANDESE',
  sv: 'SVEDESE',
  no: 'NORVEGESE',
  da: 'DANESE',
  fi: 'FINLANDESE',
  pl: 'POLACCO',
  hu: 'UNGHERESE',
  cs: 'CECO',
  el: 'GRECO',
  th: 'TAILANDESE',
  vi: 'VIETNAMITA',
  id: 'INDONESIANO',
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
  GIA: 'Giapponese',
  KOR: 'Coreano',
  CHI: 'Cinese',
  POR: 'Portoghese',
  RUS: 'Russo',
  HIN: 'Indiano',
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
  ITALIANO: 'Italiano',
  INGLESE: 'Inglese',
  FRANCESE: 'Francese',
  GIAPPONESE: 'Giapponese',
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
