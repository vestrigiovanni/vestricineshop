/**
 * Il confine fra i minuti d'orologio del motore e gli istanti reali del mondo.
 *
 * Il motore (`engine.ts`) ragiona in minuti di orologio a muro: il cinema apre
 * alle 10:00 sia a luglio sia a dicembre, e per lui l'ora legale non esiste.
 * Pretix e il database invece parlano di istanti. La conversione fra i due
 * mondi avviene **solo qui**, e solo ai bordi: quando si leggono le proiezioni
 * esistenti e quando si creano quelle nuove.
 *
 * Tenerla in un posto solo è la ragione per cui il resto del codice non ha
 * bisogno di sapere che il 25 ottobre 2026 dura 25 ore.
 */

import { MINUTES_PER_DAY, addDaysISO, daysBetweenISO } from './times';

export const TIMEZONE = 'Europe/Rome';

// Nella v1 qui c'era date-fns-tz; nella v2 basta Intl, che conosce già i fusi.
const OROLOGIO = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function muro(ms: number): { date: string; hh: number; mm: number; ss: number } {
  const p: Record<string, string> = {};
  for (const x of OROLOGIO.formatToParts(new Date(ms))) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, hh: Number(p.hour) % 24, mm: Number(p.minute), ss: Number(p.second) };
}

const msDi = (ms: number | Date) => (typeof ms === 'number' ? ms : ms.getTime());

/** Data e minuto del giorno, in ora di Roma, di un istante. */
export function romeParts(ms: number | Date): { date: string; minute: number } {
  const m = muro(msDi(ms));
  return { date: m.date, minute: m.hh * 60 + m.mm };
}

/** 'HH:mm' in ora di Roma di un istante. */
export function romeClock(ms: number | Date): string {
  const m = muro(msDi(ms));
  return `${String(m.hh).padStart(2, '0')}:${String(m.mm).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' in ora di Roma di un istante. */
export function romeDate(ms: number | Date): string {
  return muro(msDi(ms)).date;
}

/** Di quanto Roma è avanti su UTC in quell'istante, in millisecondi. */
function scarto(ms: number): number {
  const m = muro(ms);
  const [y, mo, d] = m.date.split('-').map(Number);
  return Date.UTC(y, mo - 1, d, m.hh, m.mm, m.ss) - (ms - (ms % 1000 + 1000) % 1000);
}

/** L'istante di un orologio a muro di Roma ('YYYY-MM-DD', 'HH:mm'). */
export function romeWallToMs(date: string, clock: string): number {
  const [y, mo, d] = date.split('-').map(Number);
  const [hh, mm] = clock.split(':').map(Number);
  const comeUtc = Date.UTC(y, mo - 1, d, hh, mm);
  const primo = comeUtc - scarto(comeUtc);
  const secondo = comeUtc - scarto(primo);
  return primo === secondo ? primo : Math.max(primo, secondo);
}

function clockOf(minuteOfDay: number): string {
  const m = ((minuteOfDay % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Istante corrispondente a una data e un'ora di Roma.
 *
 * `minuteOfDay` può superare le 24 ore: le 25:10 del 3 marzo sono le 01:10 del
 * 4, che è esattamente come il motore rappresenta la coda di una nottata.
 */
export function romeToMs(date: string, minuteOfDay: number): number {
  const dayShift = Math.floor(minuteOfDay / MINUTES_PER_DAY);
  const iso = dayShift ? addDaysISO(date, dayShift) : date;
  return romeWallToMs(iso, clockOf(minuteOfDay));
}

/**
 * Istante → minuto globale del motore, contato dalla mezzanotte di
 * `windowStart` in ora di Roma.
 *
 * Attenzione: nei giorni di cambio ora un minuto globale non è mai
 * `(ms - origine) / 60000`. Bisogna passare per data e orologio, altrimenti
 * l'ultima domenica di ottobre sposta tutti gli spettacoli di un'ora.
 */
export function msToGlobalMinute(ms: number | Date, windowStart: string): number {
  const { date, minute } = romeParts(ms);
  return daysBetweenISO(windowStart, date) * MINUTES_PER_DAY + minute;
}

/** Minuto globale del motore → istante reale. */
export function globalMinuteToMs(minute: number, windowStart: string): number {
  const dayIndex = Math.floor(minute / MINUTES_PER_DAY);
  const inDay = minute - dayIndex * MINUTES_PER_DAY;
  return romeToMs(addDaysISO(windowStart, dayIndex), inDay);
}

/** La data di oggi in ora di Roma, non del server. */
export function todayInRome(): string {
  return romeDate(Date.now());
}

/**
 * Minuto globale corrispondente a "adesso": serve a impedire che il piano
 * programmi spettacoli nel passato.
 */
export function nowAsGlobalMinute(windowStart: string): number {
  return msToGlobalMinute(Date.now(), windowStart);
}
