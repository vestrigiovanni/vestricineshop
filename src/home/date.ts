/**
 * Le date di sala, tutte sul fuso di Roma. Il server su Vercel è in UTC: con
 * un fuso fisso server e browser scrivono la stessa ora (nella v1 una stessa
 * proiezione usciva "19:30" nell'HTML e "21:30" dopo l'idratazione).
 * Solo `Intl`, senza librerie: nella v1 c'era date-fns-tz.
 */
const FUSO = 'Europe/Rome';

const fmt = (o: Intl.DateTimeFormatOptions, lingua = 'it-IT') => new Intl.DateTimeFormat(lingua, { timeZone: FUSO, ...o });
const chiave = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }, 'en-CA');
const oraMinuti = fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const lungo = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const breve = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
const anno = fmt({ year: 'numeric' });

const data = (v: Date | string) => (v instanceof Date ? v : new Date(v));
/** Intl mette a volte una virgola dopo il giorno della settimana ("ven, 27 nov"). */
const senzaVirgola = (t: string) => t.replace(',', '').replace(/\.(?=\s|$)/g, '');

/** "21:30" */
export const formatShowTime = (v: Date | string) => oraMinuti.format(data(v));
/** "venerdì 27 novembre" */
export const formatShowDayLong = (v: Date | string) => senzaVirgola(lungo.format(data(v)));
/** "ven 27 nov" */
export const formatShowDayShort = (v: Date | string) => senzaVirgola(breve.format(data(v)));
/** "2026" */
export const formatYear = (v: Date | string) => anno.format(data(v));
/** Il giorno di sala: "2026-11-27". */
export const toCinemaDayKey = (v: Date | string) => chiave.format(data(v));
/** Il giorno di sala corrente, a mezzogiorno: un'ora di fuso non lo sposta di giorno. */
export const cinemaToday = (now: Date = new Date()) => new Date(`${toCinemaDayKey(now)}T12:00:00`);
