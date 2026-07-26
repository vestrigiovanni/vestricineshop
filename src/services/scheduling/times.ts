/**
 * Aritmetica oraria del cinema.
 *
 * Qui dentro il tempo è misurato in **minuti di orologio a muro**, non in
 * millisecondi epoch: il "minuto globale" 0 è la mezzanotte del primo giorno
 * della finestra di programmazione, e ogni giorno vale sempre 1440 minuti.
 *
 * È una scelta deliberata. Il resto del codice lavora in epoch-ms e deve
 * continuamente ricostruire l'ora di Roma (`getRomeDayStartMs` arriva perfino a
 * concatenare a mano il suffisso `+02:00`, che d'inverno è sbagliato). Il
 * cinema però ragiona in orologio a muro: apre alle 10:00 e chiude all'01:00
 * sia a luglio sia a dicembre. Modellando i giorni invece degli istanti,
 * l'ora legale semplicemente non esiste per il motore, e la conversione a
 * istanti reali avviene una volta sola ai bordi.
 */

/**
 * Minuti d'inizio in ordine di eleganza, ricavati dalla programmazione reale
 * del Vestri (settimane 2026-W18 e 2026-W24).
 *
 * Non è un insieme di orari ammessi ma una classifica: `:00` e `:30` sono la
 * stragrande maggioranza degli inizi reali, `:15` e `:45` li seguono, e gli
 * altri compaiono solo quando la catena della giornata non lascia scelta —
 * esattamente come capita a mano. `:05` nei dati non appare mai, ma resta in
 * ultima fascia come valvola di sfogo.
 */
export const ELEGANT_TIERS: readonly (readonly number[])[] = [
  [0, 30],
  [15, 45],
  [10, 20, 40, 50],
  [25, 35, 55, 5],
];

/** Tutti i minuti d'inizio ammessi (di fatto: i multipli di 5). */
export const ELEGANT_MINUTES: readonly number[] = ELEGANT_TIERS.flat();

/**
 * Pausa minima fra la fine di un film e l'inizio del successivo.
 *
 * Dieci minuti è il minimo osservato nella programmazione reale, e ricorre
 * spesso. Non è la pausa *tipica*: la catena della giornata ne produce
 * naturalmente di più larghe (la mediana reale sta fra i 20 e i 30 minuti).
 */
export const MIN_GAP_MINUTES = 10;

/** Primo spettacolo non prima delle 10:00. */
export const OPENING_MINUTE = 10 * 60;

/**
 * L'ultimo film deve *finire* entro l'01:00. Le pulizie non contano: dopo
 * l'ultimo spettacolo il cinema chiude. Nei dati reali si arriva alle 00:58.
 */
export const CLOSING_MINUTE = 25 * 60;

export const MINUTES_PER_DAY = 1440;

export type Band = 'matinee' | 'afternoon' | 'evening' | 'night';

export const BAND_LABELS: Record<Band, string> = {
  matinee: 'Matinée',
  afternoon: 'Pomeriggio',
  evening: 'Prima serata',
  night: 'Seconda serata',
};

/**
 * Estremi di ogni fascia, in minuti dalla mezzanotte del giorno di
 * programmazione. `to` è escluso.
 */
export const BAND_WINDOWS: Record<Band, { from: number; to: number }> = {
  matinee: { from: 0, to: 13 * 60 },
  afternoon: { from: 13 * 60, to: 18 * 60 + 30 },
  evening: { from: 18 * 60 + 30, to: 21 * 60 + 50 },
  night: { from: 21 * 60 + 50, to: CLOSING_MINUTE },
};

/**
 * Fascia di appartenenza di un orario. Le soglie sono quelle già in uso nel
 * planner attuale, così i piani vecchi e nuovi si leggono allo stesso modo.
 */
export function bandOf(minute: number): Band {
  const m = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  if (m < 13 * 60) return 'matinee';
  if (m < 18 * 60 + 30) return 'afternoon';
  if (m < 21 * 60 + 50) return 'evening';
  return 'night';
}

const RANK_BY_MINUTE = new Map<number, number>(
  ELEGANT_TIERS.flatMap((tier, rank) => tier.map((m) => [m, rank] as [number, number]))
);

/** L'orario cade su un minuto d'inizio ammesso? */
export function isElegant(minute: number): boolean {
  return RANK_BY_MINUTE.has(((minute % 60) + 60) % 60);
}

/** Fascia di eleganza: 0 è la migliore (`:00`, `:30`), 3 la peggiore. */
export function elegantRank(minute: number): number {
  return RANK_BY_MINUTE.get(((minute % 60) + 60) % 60) ?? Number.POSITIVE_INFINITY;
}

/** Primo minuto elegante ≥ `minute`. */
export function ceilToElegant(minute: number): number {
  let m = Math.ceil(minute / 5) * 5;
  while (!isElegant(m)) m += 5;
  return m;
}

/** Ultimo minuto elegante ≤ `minute`. */
export function floorToElegant(minute: number): number {
  let m = Math.floor(minute / 5) * 5;
  while (!isElegant(m)) m -= 5;
  return m;
}

/** Minuto elegante più vicino; a parità di distanza vince quello successivo. */
export function nearestElegant(minute: number): number {
  const up = ceilToElegant(minute);
  const down = floorToElegant(minute);
  return up - minute <= minute - down ? up : down;
}

/** Tutti i minuti eleganti nell'intervallo [from, to], in ordine crescente. */
export function elegantMinutesBetween(from: number, to: number): number[] {
  const out: number[] = [];
  let m = ceilToElegant(from);
  while (m <= to) {
    out.push(m);
    m = ceilToElegant(m + 1);
  }
  return out;
}

/**
 * Gli orari di [from, to] ordinati come li sceglierebbe una persona: prima i
 * più eleganti, e a parità di eleganza i più vicini a `from`.
 *
 * `tolerance` decide quanto conta la vicinanza rispetto all'eleganza: con 30
 * minuti, un `:30` a mezz'ora di distanza batte un `:35` immediato.
 */
export function elegantMinutesByPreference(from: number, to: number, tolerance = 30): number[] {
  return elegantMinutesBetween(from, to)
    .map((m) => ({ m, cost: elegantRank(m) * tolerance + (m - from) }))
    .sort((a, b) => a.cost - b.cost || a.m - b.m)
    .map((c) => c.m);
}

/** 'HH:mm' di un minuto globale (gestisce gli orari dopo la mezzanotte). */
export function formatClock(minute: number): string {
  const m = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Minuto globale a partire da indice di giorno e minuto del giorno. */
export function toGlobal(dayIndex: number, minuteOfDay: number): number {
  return dayIndex * MINUTES_PER_DAY + minuteOfDay;
}

/** Indice del giorno di calendario che contiene il minuto globale. */
export function dayIndexOf(minute: number): number {
  return Math.floor(minute / MINUTES_PER_DAY);
}

/** Minuto all'interno del proprio giorno di calendario, sempre in [0, 1440). */
export function minuteOfDay(minute: number): number {
  return ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

// ── Date di calendario ────────────────────────────────────────────────────────
// Aritmetica in UTC: le date qui sono etichette (YYYY-MM-DD), non istanti, e
// passare dal fuso locale le farebbe scivolare di un giorno.

function toUTCms(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTCms(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Somma giorni a una data ISO. */
export function addDaysISO(iso: string, days: number): string {
  return fromUTCms(toUTCms(iso) + days * 86400000);
}

/** Giorni di distanza fra due date ISO (`to` - `from`). */
export function daysBetweenISO(from: string, to: string): number {
  return Math.round((toUTCms(to) - toUTCms(from)) / 86400000);
}

/** Giorno della settimana ISO: 1 = lunedì … 7 = domenica. */
export function isoWeekday(iso: string): number {
  const day = new Date(toUTCms(iso)).getUTCDay(); // 0 = domenica
  return day === 0 ? 7 : day;
}

/** Venerdì, sabato e domenica sono i giorni "pieni" del cinema. */
export function isWeekend(iso: string): boolean {
  return isoWeekday(iso) >= 5;
}
