import { after, NextResponse } from 'next/server';
import { postiDi } from '@/biglietteria/pretix';
import { postiDaPretix, prenotabile } from '@/biglietteria/regole';
import { aggiornaDisponibilita } from '@/biglietteria/sync';

export const dynamic = 'force-dynamic';

/**
 * GET /api/seats?subeventId=123 — i posti di uno spettacolo, dal vivo, così
 * come li dà Pretix (la forma è quella della v1: la leggono la mappa della
 * sala e `video/strumenti/prendi-dati.mjs`). Se non ne resta uno libero, il
 * database si aggiorna subito: la Home smette di proporre quello spettacolo.
 */
export async function GET(request: Request) {
  const id = Number(new URL(request.url).searchParams.get('subeventId'));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ success: false, error: 'Manca lo spettacolo.' }, { status: 400 });
  try {
    const seats = await postiDi(id);
    if (seats.length && !postiDaPretix(seats).some(prenotabile)) after(() => aggiornaDisponibilita(id));
    return NextResponse.json({ success: true, seats }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[api/seats]', e);
    return NextResponse.json({ success: false, error: 'Non riesco a leggere i posti.' }, { status: 502 });
  }
}
