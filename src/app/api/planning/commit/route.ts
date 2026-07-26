import { NextResponse } from 'next/server';
import { apiError, requireApiKey } from '@/services/apiAuth';
import { planningCommitStart } from '@/actions/planningActions';
import type { CommitInput } from '@/services/scheduling/commitRunner';

export const dynamic = 'force-dynamic';

/**
 * POST /api/planning/commit
 * { seatingPlanId, shows: [{ tmdbId, date, time }] } → { jobId }
 *
 * Risponde subito: la creazione prosegue in sottofondo e si segue con
 * GET /api/planning/commit/{jobId}.
 *
 * ATTENZIONE, LATO CLIENT — questa chiamata **crea spettacoli veri**. Se la
 * risposta si perde per strada, non rilanciarla: chiedi prima l'occupazione
 * della sala e guarda se ci sono già. Un commit ripetuto crea doppioni, e
 * niente qui può accorgersene al posto tuo.
 */
export async function POST(request: Request) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  let body: CommitInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corpo della richiesta non valido.' }, { status: 400 });
  }

  if (!body?.seatingPlanId || !Array.isArray(body?.shows) || body.shows.length === 0) {
    return NextResponse.json(
      { error: 'Servono `seatingPlanId` e almeno uno spettacolo in `shows`.' },
      { status: 400 }
    );
  }

  const malformed = body.shows.find(
    (s) => !s?.tmdbId || !/^\d{4}-\d{2}-\d{2}$/.test(s?.date ?? '') || !/^\d{2}:\d{2}$/.test(s?.time ?? '')
  );
  if (malformed) {
    return NextResponse.json(
      { error: 'Ogni spettacolo vuole `tmdbId`, `date` (YYYY-MM-DD) e `time` (HH:mm, ora di Roma).' },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(await planningCommitStart(body), { status: 202 });
  } catch (err) {
    return apiError(err);
  }
}
