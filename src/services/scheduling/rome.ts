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

import { formatInTimeZone, toDate } from 'date-fns-tz';
import { MINUTES_PER_DAY, addDaysISO, daysBetweenISO } from './times';

export const TIMEZONE = 'Europe/Rome';

/** Data e minuto del giorno, in ora di Roma, di un istante. */
export function romeParts(ms: number | Date): { date: string; minute: number } {
  const d = typeof ms === 'number' ? new Date(ms) : ms;
  const date = formatInTimeZone(d, TIMEZONE, 'yyyy-MM-dd');
  const hh = Number(formatInTimeZone(d, TIMEZONE, 'HH'));
  const mm = Number(formatInTimeZone(d, TIMEZONE, 'mm'));
  return { date, minute: hh * 60 + mm };
}

/** 'HH:mm' in ora di Roma di un istante. */
export function romeClock(ms: number | Date): string {
  return formatInTimeZone(typeof ms === 'number' ? new Date(ms) : ms, TIMEZONE, 'HH:mm');
}

/** 'YYYY-MM-DD' in ora di Roma di un istante. */
export function romeDate(ms: number | Date): string {
  return formatInTimeZone(typeof ms === 'number' ? new Date(ms) : ms, TIMEZONE, 'yyyy-MM-dd');
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
  return toDate(`${iso}T${clockOf(minuteOfDay)}:00`, { timeZone: TIMEZONE }).getTime();
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
