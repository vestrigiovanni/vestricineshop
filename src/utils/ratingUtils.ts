/**
 * Utility functions for movie rating classification.
 */

/**
 * Checks if a rating string corresponds to an 18+ classification.
 * Handles variants like "18", "18+", "VM18", "VM 18".
 */
export function isVM18(rating?: string): boolean {
  if (!rating) return false;
  const r = rating.toString().toUpperCase().replace(/\s+/g, '');
  return r === '18' || r === '18+' || r === 'VM18' || r === 'VM' || r === 'VM-18';
}

/**
 * Checks if a rating string corresponds to a 14+ classification.
 * Handles variants like "14", "14+", "VM14", "VM 14".
 */
export function isVM14(rating?: string): boolean {
  if (!rating) return false;
  const r = rating.toString().toUpperCase().replace(/\s+/g, '');
  return r === '14' || r === '14+' || r === 'VM14' || r === 'VM-14';
}

/**
 * Normalizes a rating string for display purposes.
 */
export function normalizeRating(rating?: string): string {
  if (!rating) return 'T';
  if (isVM18(rating)) return '18+';
  if (isVM14(rating)) return '14+';
  const r = rating.toString().toUpperCase().replace(/\s+/g, '');
  if (r === '6' || r === '6+') return '6+';
  if (r === 'T' || r === 'PT') return 'T';
  return rating; // Keep original if unknown but not empty
}
