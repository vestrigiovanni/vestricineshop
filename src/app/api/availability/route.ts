import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/availability — { spettacolo: esaurito? } dal database, come nella v1.
 * Un film segnato esaurito nel gestionale rende esauriti tutti i suoi spettacoli.
 */
export async function GET() {
  try {
    const righe = await prisma.pretixSync.findMany({
      where: { active: true },
      select: { pretixId: true, isSoldOut: true, movie: { select: { manualSoldOut: true } } },
    });
    return NextResponse.json(Object.fromEntries(righe.map(r => [r.pretixId, r.isSoldOut || !!r.movie?.manualSoldOut])));
  } catch (e) {
    console.error('[api/availability]', e);
    return NextResponse.json({});
  }
}
