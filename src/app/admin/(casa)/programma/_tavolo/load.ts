import prisma from '@/lib/prisma';
import {
  planningDefaultStartDate,
  planningGetPeriodOccupancy,
  planningGetRooms,
} from '@/actions/planningActions';
import type { Span, TavoloQuery } from './query';
import { buildWeek, type Seats, type TavoloWeek } from './week';

export interface TavoloRoom {
  id: number;
  name: string;
  isFavorite: boolean;
}

export interface TavoloData {
  rooms: TavoloRoom[];
  roomId: number | null;
  /** La sala era nell'indirizzo: se no, il client prova quella salvata sul computer. */
  roomFromParam: boolean;
  from: string;
  days: Span;
  onlyEmpty: boolean;
  tmdb: string | null;
  week: TavoloWeek | null;
}

/**
 * Occupazione dalla stessa funzione del wizard, posti dal database come in
 * Oggi: una query sola per tutti gli spettacoli del periodo.
 */
export async function loadTavolo(q: TavoloQuery): Promise<TavoloData> {
  const [rooms, from] = await Promise.all([
    planningGetRooms(),
    q.from ? Promise.resolve(q.from) : planningDefaultStartDate(),
  ]);

  const chosen = q.room !== null && rooms.some((r) => r.id === q.room) ? q.room : null;
  const roomId = chosen ?? (rooms.find((r) => r.isFavorite) ?? rooms[0])?.id ?? null;
  const base = { rooms, roomId, roomFromParam: chosen !== null, from, days: q.days, onlyEmpty: q.onlyEmpty, tmdb: q.tmdb };
  if (roomId === null) return { ...base, week: null };

  const occupancy = await planningGetPeriodOccupancy(roomId, from, q.days);
  const ids = occupancy.daysDetail
    .flatMap((d) => d.shows.map((s) => s.pretixId))
    .filter((id): id is number => id !== null);

  const rows = ids.length
    ? await prisma.pretixSync.findMany({
        where: { pretixId: { in: ids } },
        select: { pretixId: true, availableSeats: true, totalSeats: true, isSoldOut: true },
      })
    : [];
  const seats: Record<number, Seats> = Object.fromEntries(
    rows.map((r) => [r.pretixId, { available: r.availableSeats, total: r.totalSeats, soldOut: r.isSoldOut }])
  );

  return { ...base, week: buildWeek(occupancy, seats) };
}
