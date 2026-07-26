import { NextResponse } from 'next/server';
import { apiError, requireApiKey } from '@/services/apiAuth';
import { planningGenerate, type PlanningGenerateInput } from '@/actions/planningActions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/planning/generate
 * { roomId, startDate, days, films:[{tmdbId, replicas?, preferredBand?}],
 *   intensity?, seed?, locked? }
 *
 * Non crea niente: propone. Lo stesso `seed` con gli stessi ingressi produce
 * lo stesso identico calendario, quindi l'app può rigenerare senza sorprese e
 * mostrare l'anteprima esatta di ciò che verrà creato.
 */
export async function POST(request: Request) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  let body: PlanningGenerateInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corpo della richiesta non valido.' }, { status: 400 });
  }

  if (!body?.seatingPlanId || !body?.startDate || !Array.isArray(body?.films) || body.films.length === 0) {
    return NextResponse.json(
      { error: 'Servono `seatingPlanId`, `startDate` e almeno un film in `films`.' },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(await planningGenerate(body));
  } catch (err) {
    return apiError(err);
  }
}
