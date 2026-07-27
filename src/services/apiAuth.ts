import { NextResponse } from 'next/server';

/**
 * Autenticazione delle API pubbliche per l'app VestriCinema.
 *
 * Una chiave sola, in `VESTRI_API_KEY`, passata come bearer token. Se la
 * variabile non è configurata le rotte restano chiuse: un endpoint che scrive
 * su Pretix o in catalogo non deve mai poter diventare pubblico per
 * dimenticanza.
 */
export function requireApiKey(request: Request): NextResponse | null {
  const key = process.env.VESTRI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: 'API non configurata su questo server.' },
      { status: 503 }
    );
  }
  if (request.headers.get('authorization') !== `Bearer ${key}`) {
    return NextResponse.json({ error: 'Non autorizzato.' }, { status: 401 });
  }
  return null;
}

/** Risposta d'errore uniforme, così l'app ha una sola forma da decodificare. */
export function apiError(err: unknown, status = 500): NextResponse {
  const message = err instanceof Error ? err.message : String(err);
  console.error('[api/planning] ❌', message);
  return NextResponse.json({ error: message }, { status });
}
