import { NextResponse } from 'next/server';
import { apiError, requireApiKey } from '@/services/apiAuth';
import { planningGetPeriodOccupancy } from '@/actions/planningActions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/planning/occupancy?room=4&start=2026-08-01&days=7
 *
 * Che aria tira in sala: proiezioni già presenti, saturazione, buchi liberi.
 * È il passo 1 del wizard, servito all'app.
 */
export async function GET(request: Request) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const room = Number(url.searchParams.get('room'));
  const start = url.searchParams.get('start') ?? '';
  const days = Number(url.searchParams.get('days') ?? 7);

  if (!Number.isFinite(room) || room <= 0) {
    return NextResponse.json({ error: 'Parametro `room` mancante o non valido.' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    return NextResponse.json({ error: 'Parametro `start` atteso nel formato YYYY-MM-DD.' }, { status: 400 });
  }

  try {
    return NextResponse.json(await planningGetPeriodOccupancy(room, start, days));
  } catch (err) {
    return apiError(err);
  }
}
