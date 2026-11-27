import prisma from '@/lib/prisma';
import { perGiorno, type Proiezione } from './programma';

export interface ProiezioneSala extends Proiezione {
  sala: string | null;
  posti: number | null;
}

/** Legge dal database unico le proiezioni future visibili (solo lettura). */
export async function programmaDalDatabase(ora = new Date()) {
  const righe = await prisma.pretixSync.findMany({
    where: { active: true, isHidden: false, dateFrom: { gt: ora } },
    orderBy: { dateFrom: 'asc' },
    include: { movie: { select: { customTitle: true } } },
  });
  const proiezioni: ProiezioneSala[] = righe.map((r) => ({
    id: r.pretixId,
    inizio: r.dateFrom,
    // I testi di Gio vincono su quelli che arrivano da Pretix/TMDB.
    titolo: r.movie?.customTitle || r.name,
    sala: r.roomName,
    posti: r.availableSeats,
  }));
  return perGiorno(proiezioni, ora);
}
