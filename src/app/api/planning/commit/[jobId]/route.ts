import { NextResponse } from 'next/server';
import { apiError, requireApiKey } from '@/services/apiAuth';
import {
  planningCommitRetry,
  planningCommitStatus,
  planningCommitTick,
} from '@/actions/planningActions';

export const dynamic = 'force-dynamic';
/**
 * Un tick crea fino a dieci spettacoli: va lasciato finire, non interrotto a
 * metà lotto. Il runner ha comunque un suo tetto di tempo più stretto di
 * questo, così la risposta arriva prima che la piattaforma tagli la richiesta.
 */
export const maxDuration = 60;

/**
 * POST /api/planning/commit/{jobId} → **fa avanzare** la creazione di un lotto
 * e restituisce l'avanzamento aggiornato.
 *
 * È questa la chiamata da ripetere in polling: il lavoro non va avanti da solo.
 * Nessuno lo porta avanti in sottofondo, e non è una mancanza — una promessa
 * lasciata correre su un server serverless muore appena la risposta è partita,
 * ed è esattamente il motivo per cui la creazione si fermava a metà.
 *
 * Ripeterla è **sicuro**: ogni spettacolo è una riga con chiave unica dentro
 * il lavoro e, appena creato, si porta dietro il suo id Pretix. Una riga già
 * creata non viene mai ripresa in mano, quindi un tick di troppo non produce
 * doppioni. Due client che ticchettano insieme nemmeno: le righe si prenotano.
 *
 * `{ "retry": true }` nel corpo rimette prima in gioco gli spettacoli falliti.
 *
 * Si continua finché `state` non diventa `done` o `error`. Un 404 significa
 * "questo lavoro non esiste", e a quel punto rileggere l'occupazione della
 * sala è l'unico modo di sapere cosa c'è davvero.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  try {
    const { jobId } = await params;

    let retry = false;
    try {
      const body = await request.json();
      retry = body?.retry === true;
    } catch {
      // Corpo assente: è il caso normale del polling.
    }

    if (retry) await planningCommitRetry(jobId);

    const job = await planningCommitTick(jobId);
    if (!job) return unknownJob();
    return NextResponse.json(job);
  } catch (err) {
    return apiError(err);
  }
}

/**
 * GET /api/planning/commit/{jobId} → avanzamento, **senza** far avanzare niente.
 *
 * Serve a guardare com'è andata a cose fatte. Per portare avanti il lavoro
 * serve il POST: un GET ripetuto lascerebbe il lavoro fermo dov'è.
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
    if (!job) return unknownJob();
    return NextResponse.json(job);
  } catch (err) {
    return apiError(err);
  }
}

function unknownJob() {
  return NextResponse.json(
    { error: 'Lavoro sconosciuto: l\'id non esiste, oppure il lavoro è stato dimenticato dopo una settimana.' },
    { status: 404 }
  );
}
