import { normalizeRating } from '@/utils/ratingUtils';

/**
 * I testi della prenotazione che dipendono dai dati: stanno qui, e non nel
 * JSX, perché le parole restino le stesse di oggi e si possano provare.
 */

/** L'avviso sotto la sala. Solo il 18+ è un divieto, e si colora di rosso. */
export function ageNotice(rating?: string | null): { alarm: boolean; text: string } | null {
  const norm = normalizeRating(rating);
  if (norm === '18+') return { alarm: true, text: "L'accesso a questa proiezione è limitato ai maggiori di 18 anni." };
  if (norm === '14+') return { alarm: false, text: "L'accesso a questa proiezione è limitato ai maggiori di 14 anni." };
  if (norm === '10+' || norm === '6+') {
    return { alarm: false, text: `La visione di questo film è consigliata dai ${norm.replace('+', '')} anni in su.` };
  }
  return null;
}

/**
 * "Fila B - Posto 5" → "B5", per la colonna. Con una fila numerica il punto
 * separa i due numeri ("12·3"), altrimenti "123" non si leggerebbe.
 */
export function shortSeat(label: string): string {
  const m = label.match(/^Fila (\S+) - Posto (\S+)$/);
  if (!m) return label;
  return /^\d+$/.test(m[1]) ? `${m[1]}·${m[2]}` : `${m[1]}${m[2]}`;
}

/** Quando la mappa scopre che un posto scelto è stato preso da qualcun altro. */
export function seatsTakenNotice(labels: string[]): string {
  return labels.length === 1
    ? `Il posto ${labels[0]} è stato appena prenotato da qualcun altro. Scegline un altro.`
    : `Questi posti sono stati appena prenotati da altri: ${labels.join(', ')}. Scegline altri.`;
}
