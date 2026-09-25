import { formatShowDayLabel, formatShowTime } from '@/utils/cinemaDate';

/** Uno spettacolo fra cui scegliere in "cambia orario". */
export interface ShowChoice {
  id: number;
  day: string;
  time: string;
  isSoldOut: boolean;
}

/** Dall'hero: gli spettacoli del film attivo, con le etichette del server. */
export function choicesFromShowcase(
  subevents: { id: number; date: string; dayLabel?: string; timeLabel?: string; isSoldOut?: boolean }[]
): ShowChoice[] {
  return subevents.map(s => ({
    id: s.id,
    day: s.dayLabel || formatShowDayLabel(s.date),
    time: s.timeLabel || formatShowTime(s.date),
    isSoldOut: !!s.isSoldOut,
  }));
}

/**
 * Dal calendario: gli spettacoli dello stesso film (stesso tmdbId) di quello
 * aperto, in ordine di data. Il calendario ha tutta la settimana in memoria,
 * quindi non serve chiedere niente al server.
 */
export function choicesFromCalendar(
  subEvents: { id: number; date_from: string; isSoldOut?: boolean; tmdbId?: string | number | null }[],
  subeventId: number,
  now: Date = new Date()
): ShowChoice[] {
  const current = subEvents.find(s => s.id === subeventId);
  if (!current || current.tmdbId == null) return [];
  return subEvents
    .filter(s => s.tmdbId != null && String(s.tmdbId) === String(current.tmdbId))
    .sort((a, b) => new Date(a.date_from).getTime() - new Date(b.date_from).getTime())
    .map(s => ({
      id: s.id,
      day: formatShowDayLabel(s.date_from, now),
      time: formatShowTime(s.date_from),
      isSoldOut: !!s.isSoldOut,
    }));
}
