import type { DayOccupancy, PeriodOccupancy } from '@/actions/planningActions';
import { MINUTES_PER_DAY } from '@/services/scheduling/times';
import { axisFor, type Axis } from './geometry';

/** Un buco più corto di così non ospita un film con la sua pausa: non si disegna. */
export const MIN_FILM_GAP = 90;

export interface Seats {
  available: number | null;
  total: number | null;
  soldOut: boolean;
}

/** Quel che serve del risultato di `planningGetPeriodOccupancy`. */
export type OccupancyLike = Pick<PeriodOccupancy, 'totalShows'> & {
  daysDetail: (Pick<DayOccupancy, 'date' | 'isPast' | 'isWeekend' | 'gaps'> & {
    shows: Pick<DayOccupancy['shows'][number], 'pretixId' | 'title' | 'time' | 'endTime' | 'runtime' | 'startMinute' | 'endMinute' | 'tmdbId' | 'posterPath'>[];
  })[];
};

export interface TavoloBlock {
  key: string;
  pretixId: number | null;
  tmdbId: string | null;
  title: string;
  time: string;
  endTime: string;
  runtime: number;
  /** Minuti del giorno di programmazione (oltre 1440 = dopo mezzanotte). */
  start: number;
  end: number;
  /** Si sposta e si elimina solo ciò che è futuro ed è nato da Pretix. */
  touchable: boolean;
  sold: number | null;
  total: number | null;
  soldOut: boolean;
  posterPath: string | null;
}

export interface TavoloGap {
  start: number;
  end: number;
  from: string;
  to: string;
  minutes: number;
}

export interface TavoloDay {
  date: string;
  isPast: boolean;
  isWeekend: boolean;
  blocks: TavoloBlock[];
  gaps: TavoloGap[];
}

export interface TavoloWeek {
  days: TavoloDay[];
  axis: Axis;
  totalShows: number;
  /** Buchi futuri dove ci sta un film. */
  filmGaps: number;
}

export function buildWeek(occupancy: OccupancyLike, seats: Record<number, Seats>): TavoloWeek {
  const days: TavoloDay[] = occupancy.daysDetail.map((d, i) => {
    const base = i * MINUTES_PER_DAY;
    const blocks = d.shows.map((s, j): TavoloBlock => {
      const seat = s.pretixId != null ? seats[s.pretixId] : undefined;
      const sold =
        seat && seat.total !== null && seat.available !== null ? Math.max(0, seat.total - seat.available) : null;
      return {
        key: s.pretixId != null ? String(s.pretixId) : `${d.date}-${j}`,
        pretixId: s.pretixId,
        tmdbId: s.tmdbId ?? null,
        title: s.title,
        time: s.time,
        endTime: s.endTime,
        runtime: s.runtime,
        start: s.startMinute - base,
        end: s.endMinute - base,
        touchable: s.pretixId != null && !d.isPast,
        sold,
        total: seat?.total ?? null,
        soldOut: seat?.soldOut ?? false,
        posterPath: s.posterPath ?? null,
      };
    });
    const gaps = d.gaps
      .filter((g) => g.minutes >= MIN_FILM_GAP)
      .map((g) => ({
        start: g.startMinute - base,
        end: g.startMinute - base + g.minutes,
        from: g.from,
        to: g.to,
        minutes: g.minutes,
      }));
    return { date: d.date, isPast: d.isPast, isWeekend: d.isWeekend, blocks, gaps };
  });

  return {
    days,
    axis: axisFor(days.flatMap((d) => d.blocks.map((b) => ({ start: b.start, end: b.end })))),
    totalShows: occupancy.totalShows,
    filmGaps: days.reduce((n, d) => n + (d.isPast ? 0 : d.gaps.length), 0),
  };
}

export function findBlock(week: TavoloWeek, key: string): { day: TavoloDay; block: TavoloBlock } | null {
  for (const day of week.days) {
    const block = day.blocks.find((b) => b.key === key);
    if (block) return { day, block };
  }
  return null;
}
