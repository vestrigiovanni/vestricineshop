import { NextResponse } from 'next/server';
import { apiError, requireApiKey } from '@/services/apiAuth';
import { planningCommitStart } from '@/actions/planningActions';
import type { CommitInput } from '@/services/scheduling/commitRunner';

export const dynamic = 'force-dynamic';

/**
 * POST /api/planning/commit
 * { seatingPlanId, shows: [{ tmdbId, date, time, replaces?, forceReplace?,
 *   allowOutsideHours?, specs?, specsNote? }] } → { jobId }
 *
 * `specs` sono le specifiche di proiezione — "4K", "DOLBY_VISION", "ATMOS",
 * "IMAX" — e diventano i bollini che il pubblico vede su quello spettacolo.
 * I codici sconosciuti vengono scartati senza far fallire la creazione.
 * `specsNote` è la riga libera, per ciò che i codici non prevedono.
 *
 * Risponde subito e **non crea niente**: registra il piano come elenco di
 * intenzioni su database. La creazione vera avviene un lotto per volta, a ogni
 * POST /api/planning/commit/{jobId}, che è la chiamata da ripetere fino alla
 * fine. Nessuno porta avanti il lavoro in sottofondo, ed è deliberato: una
 * promessa lasciata correre su un server serverless muore appena la risposta è
 * partita, e cento spettacoli non entrano nella durata di una richiesta.
 *
 * ATTENZIONE, LATO CLIENT — se la risposta si perde per strada non rilanciare
 * *questa*: creerebbe un secondo lavoro, e quindi spettacoli doppi. Chiedi
 * prima l'occupazione della sala. Ripetere invece i POST sul jobId è sicuro
 * quanto si vuole: le righe già create non vengono mai riprese in mano.
 *
 * ATTENZIONE, DI PIÙ — con `replaces` questa rotta **elimina anche**. Sono id
 * Pretix, rimossi subito prima di creare lo spettacolo che li sostituisce; se
 * la rimozione fallisce, il rimpiazzo non viene creato. Di default la
 * sostituzione si rifiuta quando ci sono biglietti venduti: `forceReplace`
 * scavalca il rifiuto e lascia orfani gli ordini di chi ha pagato, che vanno
 * poi rimborsati a mano da Pretix. Non mandarlo senza un consenso esplicito
 * dell'utente, raccolto mostrando quanti biglietti sono in gioco.
 *
 * `allowOutsideHours` è un'altra cosa: permette a *quel* singolo spettacolo di
 * cominciare prima dell'apertura o di finire dopo la chiusura. Non tocca i
 * conflitti di sala, che restano rifiutati. Mandalo quando
 * GET /api/planning/slots/check ha risposto `outsideHours: true` e l'utente ha
 * visto l'avvertimento e ha voluto procedere lo stesso.
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
