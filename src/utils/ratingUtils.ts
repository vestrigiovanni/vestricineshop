/**
 * Utility functions for movie rating classification.
 */

/**
 * Normalizes a rating string to the official Italian cinema standards: T, 6+, 14+, 18+.
 * Cleans the string and maps variations to the standard labels.
 * 
 * Rules:
 * - VM14, 14+, 14 -> 14+
 * - VM18, 18+, 18 -> 18+
 * - 6, 6+ -> 6+
 * - T, PT, '' -> T
 */
export function normalizeRating(val: string | undefined | null): string {
  if (!val) return 'T';
  
  // Clean string: remove spaces, dots, and common prefixes like "VM"
  const clean = val.toString().toUpperCase().replace(/[\s\.]/g, '').replace(/^VM/, '');
  
  // Direct matches or common variations
  if (['T', 'PT', 'G', 'U', '0', 'APPROVED', 'PASSED'].includes(clean)) return 'T';
  if (['6', '6+', 'PG', 'TV-PG'].includes(clean)) return '6+';
  if (['10', '10+', '12', '12A'].includes(clean)) return '10+';
  if (['14', '14+', 'PG13', 'PG-13', 'TV-14', '15', 'R'].includes(clean)) return '14+';
  if (['18', '18+', 'NC17', 'NC-17', 'TV-MA', '16', 'X'].includes(clean)) return '18+';

  // Fallback for numeric strings
  const num = parseInt(clean.replace(/\D/g, ''));
  if (!isNaN(num)) {
    if (num >= 18) return '18+';
    if (num >= 14) return '14+';
    if (num >= 10) return '10+';
    if (num >= 6) return '6+';
    return 'T';
  }

  return 'T';
}

/**
 * Checks if a rating string corresponds to an 18+ classification.
 */
export function isVM18(rating?: string): boolean {
  return normalizeRating(rating) === '18+';
}

/**
 * Checks if a rating string corresponds to a 14+ classification.
 */
export function isVM14(rating?: string): boolean {
  return normalizeRating(rating) === '14+';
}
