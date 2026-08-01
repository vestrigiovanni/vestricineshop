import { formatInTimeZone } from 'date-fns-tz';
import { it } from 'date-fns/locale';

/**
 * Formattazione delle date di sala.
 *
 * Tutte le date passano da qui e da un solo fuso orario: `Europe/Rome`.
 * `toLocaleTimeString` usa il fuso del runtime, e il runtime del server su
 * Vercel è UTC: la stessa proiezione veniva scritta "19:30" nell'HTML e
 * "21:30" dopo l'hydration. Con un fuso fisso server e client producono la
 * stessa stringa, quindi gli orari possono essere renderizzati lato server
 * senza attendere il mount.
 */
export const CINEMA_TIMEZONE = 'Europe/Rome';

const toDate = (value: Date | string): Date =>
  value instanceof Date ? value : new Date(value);

/** "21:30" */
export function formatShowTime(value: Date | string): string {
  return formatInTimeZone(toDate(value), CINEMA_TIMEZONE, 'HH:mm');
}

/** "gio 30 lug" */
export function formatShowDayShort(value: Date | string): string {
  return formatInTimeZone(toDate(value), CINEMA_TIMEZONE, 'eee d MMM', { locale: it });
}

/** "giovedì 30 luglio" */
export function formatShowDayLong(value: Date | string): string {
  return formatInTimeZone(toDate(value), CINEMA_TIMEZONE, 'EEEE d MMMM', { locale: it });
}

/** "30 luglio" — per gli intervalli di date, senza il giorno della settimana. */
export function formatDayAndMonth(value: Date | string): string {
  return formatInTimeZone(toDate(value), CINEMA_TIMEZONE, 'd MMMM', { locale: it });
}

/** "2026" */
export function formatYear(value: Date | string): string {
  return formatInTimeZone(toDate(value), CINEMA_TIMEZONE, 'yyyy');
}

/** "lun" — il solo giorno della settimana, per le linguette del calendario. */
export function formatWeekdayShort(value: Date | string): string {
  return formatInTimeZone(toDate(value), CINEMA_TIMEZONE, 'eee', { locale: it });
}

/** "30" — il solo numero del giorno. */
export function formatDayNumber(value: Date | string): string {
  return formatInTimeZone(toDate(value), CINEMA_TIMEZONE, 'd');
}

/** Chiave di raggruppamento per giorno di sala: "2026-07-30". */
export function toCinemaDayKey(value: Date | string): string {
  return formatInTimeZone(toDate(value), CINEMA_TIMEZONE, 'yyyy-MM-dd');
}

/** Due istanti cadono nello stesso giorno di sala? */
export function isSameCinemaDay(a: Date | string, b: Date | string): boolean {
  return toCinemaDayKey(a) === toCinemaDayKey(b);
}

/**
 * Etichetta del giorno per i bottoni orario: "Oggi" quando la proiezione è in
 * giornata, altrimenti la forma breve.
 */
export function formatShowDayLabel(value: Date | string, now: Date = new Date()): string {
  return isSameCinemaDay(value, now) ? 'Oggi' : formatShowDayShort(value);
}

/**
 * Il giorno di sala corrente, ancorato a mezzogiorno.
 *
 * Serve come base per i calcoli su settimane e giorni (`setDate`, `getDay`),
 * che leggono il fuso del runtime: partendo da mezzogiorno lo scarto di un paio
 * d'ore fra UTC e Roma non può spostare il risultato al giorno prima o dopo.
 */
export function cinemaToday(now: Date = new Date()): Date {
  return new Date(`${toCinemaDayKey(now)}T12:00:00`);
}
