/**
 * Utility for mapping full language names to short descriptive codes.
 */

const LANGUAGE_MAP: Record<string, string> = {
  'italiano': 'ITA',
  'inglese': 'ENG',
  'english': 'ENG',
  'francese': 'FRA',
  'french': 'FRA',
  'spagnolo': 'SPA',
  'spanish': 'SPA',
  'tedesco': 'GER',
  'german': 'GER',
  'giapponese': 'JPN',
  'japanese': 'JPN',
  'coreano': 'KOR',
  'korean': 'KOR',
  'cinese': 'CHN',
  'chinese': 'CHN',
  'originale': 'OR'
};

const LANGUAGE_DETAILS: Record<string, { name: string; flag: string }> = {
  'ITA': { name: 'Italiano', flag: '🇮🇹' },
  'ENG': { name: 'Inglese', flag: '🇺🇸' },
  'FRA': { name: 'Francese', flag: '🇫🇷' },
  'SPA': { name: 'Spagnolo', flag: '🇪🇸' },
  'GER': { name: 'Tedesco', flag: '🇩🇪' },
  'JPN': { name: 'Giapponese', flag: '🇯🇵' },
  'KOR': { name: 'Coreano', flag: '🇰🇷' },
  'CHN': { name: 'Cinese', flag: '🇨🇳' },
  'OR': { name: 'Lingua Originale', flag: '🌐' }
};

const SUBTITLE_MAP: Record<string, string> = {
  'italiano': 'SUB ITA',
  'inglese': 'SUB ENG',
  'english': 'SUB ENG',
  'nessuno': '',
  'no': '',
  '-': ''
};

export function getLanguageCode(lang: string): string {
  const normalized = lang.toLowerCase().trim();
  return LANGUAGE_MAP[normalized] || normalized.substring(0, 3).toUpperCase();
}

export function getLanguageFull(input: string): { name: string; flag: string } {
  const code = getLanguageCode(input);
  return LANGUAGE_DETAILS[code] || { name: code, flag: '🌐' };
}

export function getSubtitleFull(input: string): string {
  if (!input || input.toLowerCase() === 'no' || input.toLowerCase() === 'nessuno' || input === '-') return '';
  const clean = input.toLowerCase().replace(/^sub\s+/i, '');
  const code = getLanguageCode(clean);
  return LANGUAGE_DETAILS[code]?.name || code;
}

export function getSubtitleLabel(sub: string): string {
  const normalized = sub.toLowerCase().trim();
  if (SUBTITLE_MAP[normalized] !== undefined) {
    return SUBTITLE_MAP[normalized];
  }
  if (!normalized || normalized === 'no' || normalized === 'nessuno') return '';
  return `SUB ${normalized.substring(0, 3).toUpperCase()}`;
}

export interface TagInfo {
  code: string;
  type: 'language' | 'subtitle' | 'format';
}

export function getMovieTags(language: string, subtitles: string, format: string = ''): TagInfo[] {
  const tags: TagInfo[] = [];

  const langCode = getLanguageCode(language);
  const subLabel = getSubtitleLabel(subtitles);
  const is3d = format.toUpperCase().includes('3D');

  // Always show audio language
  if (langCode) {
    tags.push({ code: langCode, type: 'language' });
  }

  // Show subtitles if present
  if (subLabel) {
    tags.push({ code: subLabel, type: 'subtitle' });
  }

  // Show 3D format
  if (is3d) {
    tags.push({ code: '3D', type: 'format' });
  }

  return tags;
}
