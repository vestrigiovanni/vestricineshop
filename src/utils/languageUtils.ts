import { getFullLanguageName } from '@/constants/languages';

export interface TagInfo {
  code: string;
  type: 'language' | 'subtitle' | 'format';
}

/**
 * Returns a list of tags to display for a specific showtime/movie.
 * Values should ideally be 3-letter codes (ITA, ENG, etc.)
 */
export function getMovieTags(language: string = '', subtitles: string = '', format: string = ''): TagInfo[] {
  const tags: TagInfo[] = [];

  // Normalize language
  let langCode = language.toUpperCase().trim();
  if (langCode === 'ITALIANO' || langCode === 'LINGUA ITALIANA') langCode = 'ITA';
  if (langCode === 'INGLESE' || langCode === 'ENGLISH') langCode = 'ENG';
  
  // Subtitles normalization
  let subCode = subtitles.toUpperCase().trim();
  if (subCode === 'NESSUNO' || subCode === 'NO' || subCode === '-') subCode = '';
  if (subCode === 'ITALIANO' || subCode === 'SOTTOTITOLI ITA') subCode = 'ITA';
  if (subCode.startsWith('SUB ')) subCode = subCode.replace('SUB ', '');

  const is3d = format.toUpperCase().includes('3D');

  // Audio Language Tag - FULL NAME
  if (langCode && langCode !== 'NULL') {
    tags.push({ 
      code: getFullLanguageName(langCode).toUpperCase(), 
      type: 'language' 
    });
  }

  // Subtitle Tag - ABBREVIATION
  if (subCode && subCode !== 'NULL') {
    tags.push({ 
      code: `SUB ${subCode.substring(0, 3)}`, 
      type: 'subtitle' 
    });
  }

  // Format Tag (3D)
  if (is3d) {
    tags.push({ code: '3D', type: 'format' });
  }

  return tags;
}

export function getLanguageCode(lang: string): string {
  if (!lang) return '';
  const val = lang.toUpperCase().trim();
  if (val === 'ITALIANO' || val === 'ITA') return 'ITALIANO';
  if (val === 'INGLESE' || val === 'ENGLISH' || val === 'ENG') return 'INGLESE';
  return getFullLanguageName(val).toUpperCase();
}

