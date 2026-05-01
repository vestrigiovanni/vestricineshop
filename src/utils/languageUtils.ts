/**
 * Utility for mapping language codes and generating display tags.
 * Now optimized for the ISO 639-2/3 (3-letter) codified system.
 */

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

  // Normalize language: if it's "Italiano" -> ITA, if it's "Inglese" -> ENG, etc.
  // But ideally they are already ITA, ENG, etc. from the new sync logic.
  let langCode = language.toUpperCase().trim();
  if (langCode === 'ITALIANO' || langCode === 'LINGUA ITALIANA') langCode = 'ITA';
  if (langCode === 'INGLESE' || langCode === 'ENGLISH' || langCode === 'ORIGINALE') langCode = 'ENG';
  
  // Subtitles normalization
  let subCode = subtitles.toUpperCase().trim();
  if (subCode === 'NESSUNO' || subCode === 'NO' || subCode === '-') subCode = '';
  if (subCode === 'ITALIANO' || subCode === 'SOTTOTITOLI ITA') subCode = 'SUB ITA';
  if (subCode.length === 3 && subCode !== 'SUB') subCode = `SUB ${subCode}`;

  const is3d = format.toUpperCase().includes('3D');

  // Audio Language Tag
  if (langCode && langCode !== 'NULL') {
    tags.push({ 
      code: langCode.substring(0, 3), 
      type: 'language' 
    });
  }

  // Subtitle Tag
  if (subCode && subCode !== 'NULL') {
    tags.push({ 
      code: subCode.startsWith('SUB') ? subCode : `SUB ${subCode.substring(0, 3)}`, 
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
  if (val === 'ITALIANO') return 'ITA';
  if (val === 'INGLESE' || val === 'ENGLISH') return 'ENG';
  return val.substring(0, 3);
}
