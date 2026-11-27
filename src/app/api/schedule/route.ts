import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/schedule — gli spettacoli non ancora finiti, con i dati del film,
 * nella forma della v1 (`{ success, schedule: [...] }`): lo legge
 * `video/strumenti/prendi-dati.mjs`. La v1 chiedeva tutto a Pretix e a TMDB a
 * ogni chiamata; qui viene dal database, dove la sync tiene le stesse cose.
 */
export async function GET() {
  try {
    const ora = new Date();
    const righe = await prisma.pretixSync.findMany({
      where: { active: true, OR: [{ dateTo: { gte: ora } }, { dateTo: null, dateFrom: { gte: new Date(ora.getTime() - 3 * 3600_000) } }] },
      orderBy: { dateFrom: 'asc' },
      include: { movie: true },
    });
    const schedule = righe.map(r => {
      const m = r.movie;
      return {
        id: r.pretixId,
        title: m?.customTitle && m.customTitle !== 'Caricamento...' ? m.customTitle : r.name,
        date_from: r.dateFrom.toISOString(),
        date_to: (r.dateTo ?? r.dateFrom).toISOString(),
        posterPath: m?.customPosterPath || '',
        backdropPath: m?.customBackdropPath || '',
        logoPath: m?.customLogoPath && m.customLogoPath !== 'none' ? m.customLogoPath : '',
        director: m?.customDirector || 'N/D',
        cast: m?.customCast || '',
        overview: m?.customOverview || '',
        runtime: m?.runtime || 120,
        language: r.metaLingua || m?.versionLanguage || 'Italiano',
        subtitles: r.metaSottotitoli || m?.subtitles || 'Italiano',
        isSoldOut: r.isSoldOut || !!m?.manualSoldOut,
        roomName: m?.customRoomName || r.roomName || 'Sala',
        rating: m?.customRating || 'T',
      };
    });
    return NextResponse.json({ success: true, schedule });
  } catch (e) {
    console.error('[api/schedule]', e);
    return NextResponse.json({ success: false, error: 'Programma non disponibile.' }, { status: 500 });
  }
}
