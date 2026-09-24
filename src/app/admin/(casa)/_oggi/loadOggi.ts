import prisma from '@/lib/prisma';
import { findOpenJob } from '@/services/scheduling/commitJobs';
import { romeDate, romeToMs } from '@/services/scheduling/rome';
import { addDaysISO } from '@/services/scheduling/times';
import { buildOggi, type OggiData, type OggiRow } from './buildOggi';

/** Quanto indietro guardare per trovare la coda notturna di ieri ancora in sala. */
const NIGHT_TAIL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_RUNTIME_MIN = 120;

/**
 * Oggi legge dal database, non da Pretix: una query sola invece di una
 * chiamata per spettacolo. I posti sono quelli che il sync ha scritto; quando
 * mancano, "Da guardare" lo dice e offre di rileggerli.
 */
export async function loadOggi(nowMs: number = Date.now()): Promise<OggiData> {
  const today = romeDate(nowMs);
  const from = new Date(romeToMs(today, 0) - NIGHT_TAIL_MS);
  const to = new Date(romeToMs(addDaysISO(today, 7), 0));

  const rows = await prisma.pretixSync.findMany({
    where: { active: true, isHidden: false, dateFrom: { gte: from, lt: to } },
    orderBy: { dateFrom: 'asc' },
    include: {
      movie: {
        select: {
          customTitle: true,
          customDirector: true,
          runtime: true,
          versionLanguage: true,
          subtitles: true,
          customTrailerUrl: true,
          customTrailerKeys: true,
        },
      },
    },
  });

  const plans = [...new Set(rows.map((r) => r.seatingPlanId).filter((id): id is number => id !== null))];
  const openCommit = (await Promise.all(plans.map(findOpenJob))).some(Boolean);

  const mapped: OggiRow[] = rows.map((r) => {
    const start = r.dateFrom.getTime();
    const runtime = r.movie?.runtime ?? DEFAULT_RUNTIME_MIN;
    return {
      id: r.pretixId,
      title: r.movie?.customTitle || r.name,
      start,
      end: r.dateTo ? r.dateTo.getTime() : start + runtime * 60_000,
      roomName: r.roomName,
      available: r.availableSeats,
      total: r.totalSeats,
      soldOut: r.isSoldOut,
      lingua: r.metaLingua ?? r.movie?.versionLanguage ?? null,
      sottotitoli: r.metaSottotitoli ?? r.movie?.subtitles ?? null,
      director: r.movie?.customDirector ?? null,
      hasTrailer: Boolean(r.movie?.customTrailerUrl) || (r.movie?.customTrailerKeys.length ?? 0) > 0,
    };
  });

  return buildOggi(mapped, nowMs, openCommit);
}
