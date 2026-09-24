import { addDaysISO } from '@/services/scheduling/times';

/** Le ampiezze del tavolo: un giorno, una settimana, due, un mese. */
export type Span = 1 | 7 | 14 | 30;

export const SPANS: { value: Span; label: string }[] = [
  { value: 1, label: 'Giorno' },
  { value: 7, label: 'Settimana' },
  { value: 14, label: '2 settimane' },
  { value: 30, label: 'Mese' },
];

export interface TavoloQuery {
  room: number | null;
  from: string | null;
  days: Span;
  onlyEmpty: boolean;
  /** Un film da accendere sul tavolo: è la "Replica" del vecchio pannello e dei segnalibri. */
  tmdb: string | null;
}

export type SearchParams = Record<string, string | string[] | undefined>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function first(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export function parseQuery(sp: SearchParams): TavoloQuery {
  const room = Number(first(sp, 'room'));
  const from = first(sp, 'from');
  const days = Number(first(sp, 'days'));
  return {
    room: Number.isInteger(room) && room > 0 ? room : null,
    from: from && ISO_DATE.test(from) ? from : null,
    days: SPANS.some((s) => s.value === days) ? (days as Span) : 7,
    onlyEmpty: first(sp, 'vuote') === '1',
    tmdb: first(sp, 'tmdb')?.trim() || null,
  };
}

export function toSearch(q: { room: number; from: string; days: Span; onlyEmpty: boolean }): string {
  const p = new URLSearchParams({ room: String(q.room), from: q.from, days: String(q.days) });
  if (q.onlyEmpty) p.set('vuote', '1');
  return `?${p.toString()}`;
}

export function shiftFrom(from: string, days: Span, direction: 1 | -1): string {
  return addDaysISO(from, direction * days);
}
