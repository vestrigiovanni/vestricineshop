/**
 * Gli orari in cui un film preciso potrebbe entrare in una giornata.
 *
 * È la programmazione al contrario: invece di partire dal periodo e chiedere al
 * motore di riempirlo, si parte da un film e si guarda dove ci sta. Il calcolo
 * però deve restare **lo stesso**: le regole di apertura, chiusura e pausa qui
 * sono quelle di `engine.ts`, altrimenti il wizard proporrebbe orari che poi il
 * motore rifiuta di confermare.
 *
 * Come il motore, è una funzione pura: non conosce Pretix, il database né l'ora
 * corrente. `notBefore` è un parametro, non `Date.now()`.
 */

import type { Interval } from './engine';
import {
  BAND_WINDOWS,
  CLOSING_MINUTE,
  MINUTES_PER_DAY,
  MIN_GAP_MINUTES,
  NIGHT_TAIL_MINUTE,
  OPENING_MINUTE,
  type Band,
  bandOf,
  elegantMinutesBetween,
  elegantRank,
} from './times';

export interface FreeSlot {
  /** Minuto globale d'inizio, sullo stesso asse degli intervalli occupati. */
  startMinute: number;
  /** Minuto globale di fine film (la pausa non è compresa). */
  endMinute: number;
  band: Band;
  /** Eleganza dell'orario: 0 sono le :00 e le :30, 3 è il ripiego. */
  rank: number;
}

/**
 * Due orari più vicini di così sono la stessa occasione, non due scelte: fra le
 * 15:00 e le 15:15 non si sceglie, si sceglie fra il pomeriggio e la sera.
 */
export const SLOT_SPACING = 75;

/** Quanti orari proporre per giornata, se non si dice altro. */
export const SLOTS_PER_DAY = 5;

export interface FindFreeSlotsInput {
  /** Durata del film in minuti. */
  runtime: number;
  /** Indice del giorno di programmazione nella finestra. */
  dayIndex: number;
  /** Ciò che è già occupato, pausa inclusa nella fine (come nel motore). */
  occupied: Interval[];
  /** Minuto globale prima del quale non si programma. */
  notBefore?: number;
  /** Solo orari dentro questa fascia. */
  band?: Band;
  spacing?: number;
  limit?: number;
}

/** Perché un orario scelto a mano non va bene. */
export type SlotProblem = 'past' | 'beforeOpening' | 'afterClosing' | 'occupied';

/**
 * L'esito è generico sull'intervallo per un motivo pratico: chi chiama passa i
 * propri blocchi — di solito con lo spettacolo attaccato — e si ritrova indietro
 * *quegli stessi oggetti*. Senza, per sapere quale spettacolo dà fastidio
 * bisognerebbe riscrivere fuori di qui la regola di sovrapposizione, che è
 * esattamente il genere di duplicato che prima o poi diverge.
 */
export interface SlotCheck<T extends Interval = Interval> {
  ok: boolean;
  problem?: SlotProblem;
  /** Gli intervalli già occupati che si accavallano con questo spettacolo. */
  clashes: T[];
  endMinute: number;
  band: Band;
  /** Indice del giorno di *programmazione*: dopo la mezzanotte è la sera prima. */
  dayIndex: number;
}

/**
 * Un orario deciso a mano si può usare?
 *
 * Le condizioni sono le stesse che `findFreeSlots` applica quando li propone
 * lui, e per la stessa ragione: se scegliendo a mano valessero regole più
 * larghe, l'utente potrebbe piazzare uno spettacolo che poi la creazione
 * rifiuta. Qui però non ci si ferma al primo no — si dice *quale* no, e quando
 * è «occupato» si restituisce da cosa, perché è ciò che permette di proporre la
 * sovrascrittura invece di un vicolo cieco.
 *
 * L'orario non deve essere elegante: sceglierlo a mano è già una decisione, e
 * rifiutare le 14:07 sarebbe una pedanteria.
 */
export function checkSlot<T extends Interval = Interval>(input: {
  runtime: number;
  /** Minuto globale d'inizio, sullo stesso asse degli intervalli occupati. */
  startMinute: number;
  occupied: T[];
  notBefore?: number;
}): SlotCheck<T> {
  const { runtime, startMinute, occupied } = input;
  const notBefore = input.notBefore ?? Number.NEGATIVE_INFINITY;

  const endMinute = startMinute + runtime;
  const inDay = ((startMinute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  // Solo la coda vera della nottata — prima dell'01:00 — appartiene alla serata
  // precedente. Vedi `NIGHT_TAIL_MINUTE`: usare l'apertura come soglia, come fa
  // il motore altrove, farebbe finire le 09:00 nella serata prima, e a chi le
  // ha scritte risponderemmo «finisce dopo la chiusura» invece di «apriamo
  // alle 10:00».
  const dayIndex = Math.floor(startMinute / MINUTES_PER_DAY) - (inDay < NIGHT_TAIL_MINUTE ? 1 : 0);
  const dayStart = dayIndex * MINUTES_PER_DAY;

  const base = { endMinute, band: bandOf(startMinute), dayIndex };

  const clashes = occupied.filter(
    (o) => startMinute < o.end && o.start < endMinute + MIN_GAP_MINUTES
  );

  if (startMinute < notBefore) return { ok: false, problem: 'past', clashes, ...base };
  if (startMinute < dayStart + OPENING_MINUTE) return { ok: false, problem: 'beforeOpening', clashes, ...base };
  if (endMinute > dayStart + CLOSING_MINUTE) return { ok: false, problem: 'afterClosing', clashes, ...base };
  if (clashes.length > 0) return { ok: false, problem: 'occupied', clashes, ...base };

  return { ok: true, clashes: [], ...base };
}

/**
 * Sceglie `count` elementi distribuiti su tutta la lista, estremi compresi.
 *
 * Prendere i primi `count` riempirebbe la proposta di sole matinée: se la
 * giornata è libera, gli orari possibili sono decine e i primi cinque stanno
 * tutti prima di mezzogiorno. Distribuendoli si offre davvero una scelta fra
 * mattina, pomeriggio e sera.
 */
function spread<T>(list: T[], count: number): T[] {
  if (count <= 0) return [];
  if (list.length <= count) return list;
  if (count === 1) return [list[0]];
  const out: T[] = [];
  for (let k = 0; k < count; k++) {
    out.push(list[Math.round((k * (list.length - 1)) / (count - 1))]);
  }
  return [...new Set(out)];
}

/**
 * Gli orari liberi di una giornata per un film di durata nota, dal più presto
 * al più tardi.
 *
 * Un orario è valido se rispetta le stesse tre condizioni del motore: non prima
 * dell'apertura, film finito entro la chiusura, e nessuna sovrapposizione con
 * ciò che è già in sala — dove ogni blocco occupa `[inizio, fine + pausa]`, così
 * i dieci minuti fra due spettacoli sono garantiti da entrambe le parti.
 */
export function findFreeSlots(input: FindFreeSlotsInput): FreeSlot[] {
  const { runtime, dayIndex, occupied } = input;
  if (!Number.isFinite(runtime) || runtime <= 0) return [];

  const notBefore = input.notBefore ?? Number.NEGATIVE_INFINITY;
  const spacing = Math.max(input.spacing ?? SLOT_SPACING, 5);
  const limit = input.limit ?? SLOTS_PER_DAY;

  const dayStart = dayIndex * MINUTES_PER_DAY;
  const dayOpen = dayStart + OPENING_MINUTE;
  const dayClose = dayStart + CLOSING_MINUTE;

  const from = Math.max(
    dayOpen,
    notBefore,
    input.band ? dayStart + BAND_WINDOWS[input.band].from : Number.NEGATIVE_INFINITY
  );
  const to = Math.min(
    dayClose - runtime,
    input.band ? dayStart + BAND_WINDOWS[input.band].to - 1 : Number.POSITIVE_INFINITY
  );
  if (from > to) return [];

  const fits = (start: number): boolean => {
    const end = start + runtime + MIN_GAP_MINUTES;
    return !occupied.some((o) => start < o.end && o.start < end);
  };

  const feasible = elegantMinutesBetween(from, to).filter(fits);
  if (feasible.length === 0) return [];

  // Gli orari validi arrivano a grappoli di cinque minuti: si tiene il più
  // elegante di ogni grappolo, così la proposta è fatta di ore vere e non di
  // una colonna di 14:35, 14:40, 14:45.
  const clustered: number[] = [];
  for (let i = 0; i < feasible.length; ) {
    const windowEnd = feasible[i] + spacing;
    let best = feasible[i];
    for (let j = i; j < feasible.length && feasible[j] < windowEnd; j++) {
      if (elegantRank(feasible[j]) < elegantRank(best)) best = feasible[j];
    }
    clustered.push(best);
    // Si riparte da dopo l'orario *scelto*, non da dopo il grappolo. Saltando
    // al grappolo successivo, un orario preso in fondo al primo e uno preso in
    // testa al secondo si ritroverebbero a mezz'ora di distanza — cioè proprio
    // le due proposte gemelle che il raggruppamento doveva evitare.
    while (i < feasible.length && feasible[i] < best + spacing) i++;
  }

  return spread(clustered, limit).map((startMinute) => ({
    startMinute,
    endMinute: startMinute + runtime,
    band: bandOf(startMinute),
    rank: elegantRank(startMinute),
  }));
}
