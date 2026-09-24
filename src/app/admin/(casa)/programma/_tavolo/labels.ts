import { addDaysISO } from '@/services/scheduling/times';

/** A mezzogiorno UTC la data è la stessa a Roma: l'etichetta non scivola. */
function at(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

function fmt(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return at(iso).toLocaleDateString('it-IT', { ...opts, timeZone: 'UTC' }).replace('.', '');
}

/** "Mar 29" */
export function dayShort(iso: string): string {
  const s = `${fmt(iso, { weekday: 'short' })} ${Number(iso.slice(8))}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "martedì 29 settembre" */
export function dayLong(iso: string): string {
  return fmt(iso, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** "28 set – 4 ott", "5 – 11 ott"; un giorno solo si scrive per intero. */
export function periodLabel(from: string, days: number): string {
  if (days === 1) return dayLong(from);
  const to = addDaysISO(from, days - 1);
  const month = (iso: string) => fmt(iso, { month: 'short' });
  const day = (iso: string) => Number(iso.slice(8));
  return month(from) === month(to)
    ? `${day(from)} – ${day(to)} ${month(to)}`
    : `${day(from)} ${month(from)} – ${day(to)} ${month(to)}`;
}
