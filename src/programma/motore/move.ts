/**
 * Spostare uno spettacolo che è già in sala.
 *
 * È `checkSlot` con due differenze, ed entrambe sono la ragione per cui questo
 * modulo esiste invece di due righe dentro l'azione:
 *
 * 1. **Lo spettacolo che si muove non fa conflitto con sé stesso.** Senza
 *    escluderlo, spostare un film dalle 21:00 alle 21:10 risponderebbe
 *    «occupato» — da sé.
 * 2. **L'orario è quello della colonna in cui si scrive.** Scrivere 00:30 nella
 *    colonna di sabato vuol dire la nottata di sabato — data di calendario
 *    successiva, stessa serata — e la conversione la fa `globalMinuteOf`, che
 *    di quella regola è già il padrone. Qui non si rifà: rifarla è esattamente
 *    il modo in cui le due copie prima o poi divergono.
 *
 * Come tutto ciò che sta in `services/scheduling`, è una funzione pura: non
 * conosce Pretix, il database né l'ora corrente. `notBefore` è un parametro.
 */

import type { Interval } from './engine';
import { checkSlot, type SlotCheck } from './freeSlots';
import { globalMinuteOf } from './times';

export interface PlanMoveInput<T extends Interval> {
  /** Durata dello spettacolo che si sposta, in minuti. */
  runtime: number;
  /** Giorno di *programmazione* di destinazione, come indice nella finestra. */
  dayIndex: number;
  /** Orario scelto, in minuti dalla mezzanotte. */
  clock: number;
  /** Tutto ciò che occupa la sala, incluso lo spettacolo che si sta muovendo. */
  occupied: T[];
  /** Quale degli intervalli è lo spettacolo che si sta muovendo. */
  isMoving: (interval: T) => boolean;
  /** Minuto globale prima del quale non si programma. */
  notBefore?: number;
}

/**
 * Dove finisce lo spettacolo e se ci può stare. `startMinute` è il minuto
 * globale risolto: chi chiama non deve rifare la conversione, che è
 * esattamente il punto in cui le due copie divergerebbero.
 */
export function planMove<T extends Interval>(
  input: PlanMoveInput<T>
): SlotCheck<T> & { startMinute: number } {
  const { runtime, dayIndex, clock, occupied, isMoving, notBefore } = input;

  const startMinute = globalMinuteOf(dayIndex, clock);

  const others = occupied.filter((o) => !isMoving(o));

  return { ...checkSlot({ runtime, startMinute, occupied: others, notBefore }), startMinute };
}
