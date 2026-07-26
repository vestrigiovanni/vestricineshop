import { NextResponse } from 'next/server';
import { apiError, requireApiKey } from '@/services/apiAuth';
import { planningCommitStatus } from '@/actions/planningActions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/planning/commit/{jobId} → avanzamento della creazione.
 *
 * Un 404 significa "non lo so", non "è fallito": il registro dei lavori vive
 * in memoria e l'istanza che ha avviato il commit può non essere quella che
 * risponde adesso. In quel caso rileggi l'occupazione della sala per vedere
 * cosa è stato creato — non rilanciare il commit.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  try {
    const { jobId } = await params;
    const job = await planningCommitStatus(jobId);
    if (!job) {
      return NextResponse.json(
        { error: 'Lavoro sconosciuto: potrebbe essere scaduto o essere stato avviato da un\'altra istanza.' },
        { status: 404 }
      );
    }
    return NextResponse.json(job);
  } catch (err) {
    return apiError(err);
  }
}
