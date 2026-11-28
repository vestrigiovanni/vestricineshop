import { NextResponse } from 'next/server';
import { caricaDisplay } from '@/display/carica';

export const dynamic = 'force-dynamic';

/**
 * GET /api/display — gli spettacoli di oggi e dei prossimi giorni con i posti
 * rimasti, per lo schermo d'ingresso (`/display-esterno`, che lo richiede ogni
 * 30 secondi). Se il database non risponde dice 503 e basta: il display allora
 * tiene l'ultimo stato che ha e scrive a che ora l'ha avuto. Mai `{}` finto,
 * che sembrerebbe «nessuno spettacolo».
 */
export async function GET() {
  try {
    return NextResponse.json(await caricaDisplay(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[api/display]', e);
    return NextResponse.json({ errore: 'Il programma non è disponibile adesso.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
