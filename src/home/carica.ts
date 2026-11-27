import prisma from '@/lib/prisma';
import { filmDaRighe } from './film';

/**
 * Legge dal database unico i film in sala, in sola lettura (lo stesso Neon lo
 * leggono app iOS, Social, Gioco, Preroll e Sala 1). Si prendono anche gli
 * spettacoli cominciati da dieci minuti, come nella v1: la regia degli atti
 * poi tiene solo quelli futuri.
 */
export async function filmInSala(now = new Date()) {
  const righe = await prisma.pretixSync.findMany({
    where: { active: true, isHidden: false, dateFrom: { gte: new Date(now.getTime() - 10 * 60 * 1000) } },
    orderBy: { dateFrom: 'asc' },
    include: { movie: { include: { awards: { select: { type: true, year: true, details: true } } } } },
  });
  const ids = [...new Set(righe.map(r => r.tmdbId).filter((x): x is string => !!x))];
  const catalogo = ids.length
    ? await prisma.catalogFilm.findMany({ where: { tmdbId: { in: ids } }, select: { tmdbId: true, genres: true, voteAverage: true, originalTitle: true } })
    : [];
  return filmDaRighe(righe, catalogo, now);
}
