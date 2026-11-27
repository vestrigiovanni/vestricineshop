/**
 * Che aria tira in una giornata di sala: quanto è piena, e dove sono i buchi.
 *
 * Funzione pura, come il motore: prende gli intervalli occupati e restituisce
 * saturazione e spazi liberi. Sta qui e non dentro la server action perché è
 * l'informazione su cui si appoggia tutto il passo 1 del wizard — e perché la
 * corsia "Perfetti per questo slot" propone film in base a queste durate. Un
 * errore qui si propaga a tutto il resto senza farsi notare.
 */

import { CLOSING_MINUTE, MINUTES_PER_DAY, OPENING_MINUTE, formatClock } from './times';
import type { Interval } from './engine';

/** Le ore in cui si può programmare: dalle 10:00 all'01:00, quindi 900 minuti. */
export const USABLE_MINUTES = CLOSING_MINUTE - OPENING_MINUTE;

/**
 * Sotto questa durata un buco non serve a niente: nessun film ci sta, nemmeno
 * un corto con la sua pausa.
 */
export const MIN_USEFUL_GAP = 70;

export interface FreeGap {
  from: string;
  to: string;
  minutes: number;
  /** Minuto globale d'inizio del buco. */
  startMinute: number;
}

export interface DaySummary {
  busyMinutes: number;
  /** 0 = giornata vuota, 1 = piena. */
  saturation: number;
  gaps: FreeGap[];
}

/** Unisce gli intervalli che si toccano, in ordine di inizio. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals]
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start);

  const merged: Interval[] = [];
  for (const cur of sorted) {
    const last = merged[merged.length - 1];
    if (last && cur.start <= last.end) last.end = Math.max(last.end, cur.end);
    else merged.push({ ...cur });
  }
  return merged;
}

/**
 * Riassunto di una giornata di programmazione.
 *
 * `dayIndex` è l'indice del giorno nella finestra; gli intervalli sono in
 * minuti globali e possono sconfinare oltre la mezzanotte — una proiezione che
 * finisce all'01:20 appartiene ancora a questa serata, e il ritaglio alle ore
 * utili la tiene dentro.
 */
export function summarizeDay(occupied: Interval[], dayIndex: number): DaySummary {
  const dayOpen = dayIndex * MINUTES_PER_DAY + OPENING_MINUTE;
  const dayClose = dayIndex * MINUTES_PER_DAY + CLOSING_MINUTE;

  const clipped = occupied
    .map((i) => ({ start: Math.max(i.start, dayOpen), end: Math.min(i.end, dayClose) }))
    .filter((i) => i.end > i.start);

  const merged = mergeIntervals(clipped);

  const gaps: FreeGap[] = [];
  let cursor = dayOpen;
  for (const block of merged) {
    if (block.start - cursor >= MIN_USEFUL_GAP) {
      gaps.push({
        from: formatClock(cursor),
        to: formatClock(block.start),
        minutes: block.start - cursor,
        startMinute: cursor,
      });
    }
    cursor = Math.max(cursor, block.end);
  }
  if (dayClose - cursor >= MIN_USEFUL_GAP) {
    gaps.push({
      from: formatClock(cursor),
      to: formatClock(dayClose),
      minutes: dayClose - cursor,
      startMinute: cursor,
    });
  }

  const busyMinutes = merged.reduce((sum, b) => sum + (b.end - b.start), 0);

  return {
    busyMinutes,
    saturation: Math.min(busyMinutes / USABLE_MINUTES, 1),
    gaps,
  };
}

/**
 * Quanti spettacoli entrerebbero ancora nei buchi liberi.
 *
 * È una stima, non una promessa: usa un film di durata tipica più la pausa.
 * Serve a rispondere alla domanda "in questi giorni c'è spazio?" con un numero
 * invece che con una sensazione.
 */
export function estimateFreeSlots(gaps: FreeGap[], typicalSlot = 120): number {
  return gaps.reduce((sum, g) => sum + Math.floor(g.minutes / typicalSlot), 0);
}
