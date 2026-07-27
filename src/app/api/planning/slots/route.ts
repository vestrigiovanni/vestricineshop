import { NextResponse } from 'next/server';
import { apiError, requireApiKey } from '@/services/apiAuth';
import { planningFindSlots } from '@/actions/planningActions';
import { BAND_LABELS, type Band } from '@/services/scheduling/times';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/planning/slots?room=4&tmdb=27205
 *   &from=2026-08-01 &maxDays=7 &horizonDays=21 &perDay=3 &band=evening
 *
 * La programmazione al contrario: si parte dal film e si chiede dove ci sta.
 * Risponde con le sole giornate che hanno spazio davvero, dalla più vicina, e
 * con `reason` quando non ce n'è nessuna.
 *
 * Non crea niente: propone orari che il motore, per costruzione, accetterà.
 */
export async function GET(request: Request) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const room = Number(url.searchParams.get('room'));
  const tmdb = (url.searchParams.get('tmdb') ?? '').trim();
  const from = url.searchParams.get('from');
  const band = url.searchParams.get('band');
  const num = (k: string) => (url.searchParams.get(k) ? Number(url.searchParams.get(k)) : undefined);

  if (!Number.isFinite(room) || room <= 0) {
    return NextResponse.json({ error: 'Parametro `room` mancante o non valido.' }, { status: 400 });
  }
  if (!/^\d+$/.test(tmdb)) {
    return NextResponse.json({ error: 'Parametro `tmdb` mancante o non valido: serve un id TMDB numerico.' }, { status: 400 });
  }
  if (from !== null && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return NextResponse.json({ error: 'Parametro `from` atteso nel formato YYYY-MM-DD.' }, { status: 400 });
  }
  if (band !== null && !(band in BAND_LABELS)) {
    return NextResponse.json(
      { error: `Parametro \`band\` non valido: attesi ${Object.keys(BAND_LABELS).join(', ')}.` },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(
      await planningFindSlots({
        seatingPlanId: room,
        tmdbId: tmdb,
        fromDate: from ?? undefined,
        maxDays: num('maxDays'),
        horizonDays: num('horizonDays'),
        perDay: num('perDay'),
        band: (band as Band | null) ?? undefined,
      })
    );
  } catch (err) {
    return apiError(err);
  }
}
