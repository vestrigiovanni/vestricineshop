import { formatInTimeZone } from 'date-fns-tz';
import { it as itLocale } from 'date-fns/locale';
import { TIMEZONE, romeClock, romeDate } from '@/services/scheduling/rome';
import { addDaysISO } from '@/services/scheduling/times';

/** Uno spettacolo come arriva dal database, già tradotto in istanti. */
export interface OggiRow {
  id: number;
  title: string;
  /** Istanti in millisecondi. */
  start: number;
  end: number;
  roomName: string | null;
  available: number | null;
  total: number | null;
  soldOut: boolean;
  lingua: string | null;
  sottotitoli: string | null;
  director: string | null;
  hasTrailer: boolean;
}

export type ShowState = 'finito' | 'in-sala' | 'dopo';

export interface OggiShow {
  id: number;
  title: string;
  start: string;
  end: string;
  /** 'oggi', 'domani' o 'martedì 29'. */
  when: string;
  state: ShowState;
  /** Da 0 a 1, solo per lo spettacolo in sala. */
  progress: number;
  room: string | null;
  lingua: string | null;
  sottotitoli: string | null;
  director: string | null;
  sold: number | null;
  total: number | null;
  soldOut: boolean;
}

export interface OggiAlert {
  id: 'conferma' | 'posti' | 'vuoti' | 'lingua' | 'trailer' | 'giorni';
  tone: 'alarm' | 'info';
  text: string;
  action?: { label: string; href?: string; kind?: 'sync-posti' };
}

export interface OggiData {
  dateLabel: string;
  rooms: string[];
  current: OggiShow | null;
  next: OggiShow | null;
  day: OggiShow[];
  stats: { showsToday: number; soldToday: number | null; showsWeek: number };
  alerts: OggiAlert[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function relativeDay(ms: number, today: string): string {
  const date = romeDate(ms);
  if (date === today) return 'oggi';
  if (date === addDaysISO(today, 1)) return 'domani';
  return formatInTimeZone(ms, TIMEZONE, 'EEEE d', { locale: itLocale });
}

function soldOf(r: OggiRow): number | null {
  return r.total !== null && r.available !== null ? Math.max(0, r.total - r.available) : null;
}

function spettacoli(n: number): string {
  return n === 1 ? '1 spettacolo' : `${n} spettacoli`;
}

/** "A", "A e B", "A, B e C". */
function listIt(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

/** Fra caporali: molti titoli hanno virgole dentro, e senza non si capisce dove finiscono. */
function quote(title: string): string {
  return `«${title}»`;
}

function filmList(titles: string[]): string {
  const shown = titles.slice(0, 3).map(quote).join(', ');
  return titles.length > 3 ? `${shown} e altri ${titles.length - 3}` : shown;
}

function toShow(r: OggiRow, nowMs: number, today: string): OggiShow {
  const state: ShowState = r.end <= nowMs ? 'finito' : r.start <= nowMs ? 'in-sala' : 'dopo';
  return {
    id: r.id,
    title: r.title,
    start: romeClock(r.start),
    end: romeClock(r.end),
    when: relativeDay(r.start, today),
    state,
    progress: state === 'in-sala' ? (nowMs - r.start) / (r.end - r.start) : state === 'finito' ? 1 : 0,
    room: r.roomName,
    lingua: r.lingua,
    sottotitoli: r.sottotitoli,
    director: r.director,
    sold: soldOf(r),
    total: r.total,
    soldOut: r.soldOut,
  };
}

function buildAlerts(rows: OggiRow[], nowMs: number, today: string, openCommit: boolean): OggiAlert[] {
  const alerts: OggiAlert[] = [];
  const future = rows.filter((r) => r.start > nowMs);
  const when = (r: OggiRow) => `${relativeDay(r.start, today)} alle ${romeClock(r.start)}`;

  if (openCommit) {
    alerts.push({
      id: 'conferma',
      tone: 'alarm',
      text: 'Una conferma della programmazione è rimasta a metà.',
      action: { label: 'Riprendi', href: '/admin/programma' },
    });
  }

  const unread = future.filter((r) => r.available === null || r.total === null);
  if (unread.length > 0) {
    alerts.push({
      id: 'posti',
      tone: 'alarm',
      text: `${spettacoli(unread.length)} senza posti letti da Pretix, il primo ${when(unread[0])}.`,
      action: { label: 'Rileggi da Pretix', kind: 'sync-posti' },
    });
  }

  const empty = future.filter((r) => r.start <= nowMs + DAY_MS && soldOf(r) === 0);
  if (empty.length > 0) {
    alerts.push({
      id: 'vuoti',
      tone: 'info',
      text: `${spettacoli(empty.length)} nelle prossime 24 ore senza biglietti venduti, il primo è ${quote(empty[0].title)} ${when(empty[0])}.`,
      action: { label: 'Vedi', href: '/admin/programma?vuote=1' },
    });
  }

  const uniqueTitles = (list: OggiRow[]) => [...new Set(list.map((r) => r.title))];
  const noLanguage = uniqueTitles(future.filter((r) => !r.lingua));
  if (noLanguage.length > 0) {
    alerts.push({
      id: 'lingua',
      tone: 'info',
      text: `${noLanguage.length === 1 ? 'Un film' : `${noLanguage.length} film`} senza lingua: ${filmList(noLanguage)}.`,
      action: { label: 'Sistema', href: '/admin/film' },
    });
  }

  const noTrailer = uniqueTitles(future.filter((r) => !r.hasTrailer));
  if (noTrailer.length > 0) {
    alerts.push({
      id: 'trailer',
      tone: 'info',
      text: `${noTrailer.length === 1 ? 'Un film' : `${noTrailer.length} film`} senza trailer salvato: ${filmList(noTrailer)}.`,
      action: { label: 'Sistema', href: '/admin/film' },
    });
  }

  const busyDays = new Set(rows.map((r) => romeDate(r.start)));
  const emptyDays = [1, 2, 3, 4, 5, 6].map((i) => addDaysISO(today, i)).filter((d) => !busyDays.has(d));
  if (emptyDays.length > 0) {
    // Mezzogiorno UTC è sempre lo stesso giorno anche a Roma: l'etichetta non scivola.
    const labels = emptyDays.map((d) => relativeDay(new Date(`${d}T12:00:00Z`).getTime(), today));
    alerts.push({
      id: 'giorni',
      tone: 'info',
      text: `Nessuno spettacolo ${listIt(labels)}.`,
      action: { label: 'Programma', href: '/admin/programma' },
    });
  }

  return alerts;
}

export function buildOggi(rows: OggiRow[], nowMs: number, openCommit: boolean): OggiData {
  const today = romeDate(nowMs);
  const sorted = [...rows].sort((a, b) => a.start - b.start);
  const todayRows = sorted.filter((r) => romeDate(r.start) === today);
  const weekEnd = addDaysISO(today, 6);

  const currentRow = sorted.find((r) => r.start <= nowMs && nowMs < r.end) ?? null;
  const nextRow = sorted.find((r) => r.start > nowMs) ?? null;

  const knownSold = todayRows.map(soldOf).filter((n): n is number => n !== null);

  return {
    dateLabel: capitalize(formatInTimeZone(nowMs, TIMEZONE, 'EEEE d MMMM', { locale: itLocale })),
    rooms: [...new Set(todayRows.map((r) => r.roomName).filter((n): n is string => Boolean(n)))],
    current: currentRow ? toShow(currentRow, nowMs, today) : null,
    next: nextRow ? toShow(nextRow, nowMs, today) : null,
    day: todayRows.map((r) => toShow(r, nowMs, today)),
    stats: {
      showsToday: todayRows.length,
      soldToday: knownSold.length > 0 ? knownSold.reduce((a, b) => a + b, 0) : null,
      showsWeek: sorted.filter((r) => {
        const d = romeDate(r.start);
        return d >= today && d <= weekEnd;
      }).length,
    },
    alerts: buildAlerts(sorted, nowMs, today, openCommit),
  };
}
