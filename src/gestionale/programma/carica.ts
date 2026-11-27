import prisma from '@/lib/prisma';
import { planningDefaultStartDate, planningGetPeriodOccupancy, planningGetRooms } from '@/programma/planning';
import { spettacoliFuturi } from '@/programma/sala';
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
  /** La sala era nell'indirizzo: se no, il browser prova quella che ricorda. */
  roomFromParam: boolean;
  from: string;
  days: Span;
  onlyEmpty: boolean;
  tmdb: string | null;
  week: TavoloWeek | null;
}

/** Senza una sala scelta si parte da quella con più spettacoli in arrivo, non dalla prima in ordine alfabetico. */
async function salaPiuPiena(rooms: TavoloRoom[]): Promise<number | null> {
  const conti = new Map<number, number>();
  for (const se of await spettacoliFuturi().catch(() => [])) {
    if (se.active && se.seating_plan) conti.set(se.seating_plan, (conti.get(se.seating_plan) ?? 0) + 1);
  }
  let migliore: number | null = null;
  for (const r of rooms) if ((conti.get(r.id) ?? 0) > (migliore === null ? 0 : conti.get(migliore) ?? 0)) migliore = r.id;
  return migliore;
}

/**
 * Il tavolo, dal server: l'occupazione della sala con la stessa funzione
 * dell'app (`planningGetPeriodOccupancy`), i posti venduti dal database in
 * una query sola. Dalla v1 (`_tavolo/load.ts`).
 */
export async function caricaTavolo(q: TavoloQuery): Promise<TavoloData> {
  const [rooms, from] = await Promise.all([planningGetRooms(), q.from ? Promise.resolve(q.from) : planningDefaultStartDate()]);

  const chosen = q.room !== null && rooms.some((r) => r.id === q.room) ? q.room : null;
  const roomId = chosen ?? (await salaPiuPiena(rooms)) ?? rooms[0]?.id ?? null;
  const base = { rooms, roomId, roomFromParam: chosen !== null, from, days: q.days, onlyEmpty: q.onlyEmpty, tmdb: q.tmdb };
  if (roomId === null) return { ...base, week: null };

  const occupancy = await planningGetPeriodOccupancy(roomId, from, q.days);
  const ids = occupancy.daysDetail.flatMap((d) => d.shows.map((s) => s.pretixId)).filter((id): id is number => id !== null);
  const rows = ids.length
    ? await prisma.pretixSync.findMany({
        where: { pretixId: { in: ids } },
        select: { pretixId: true, availableSeats: true, totalSeats: true, isSoldOut: true },
      })
    : [];
  const seats: Record<number, Seats> = Object.fromEntries(
    rows.map((r) => [r.pretixId, { available: r.availableSeats, total: r.totalSeats, soldOut: r.isSoldOut }]),
  );
  return { ...base, week: buildWeek(occupancy, seats) };
}
