import { after, NextResponse } from 'next/server';
import { PrenotazioneRifiutata, prenota, quote, spettacolo } from '@/biglietteria/pretix';
import { CHIUSURA_MINUTI, OSPITE, disponibilitaDaQuote, emailValida } from '@/biglietteria/regole';
import { aggiornaDisponibilita, esauritiDeiFilm } from '@/biglietteria/sync';

export const dynamic = 'force-dynamic';

/** Quanti posti in una prenotazione sola. */
const MASSIMO_POSTI = 10;

const no = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

/**
 * POST /api/book { email, seats: [seat_guid], subeventId } → { success, order }.
 * Il browser non parla con Pretix: passa da qui. Prima si controlla che la
 * vendita sia aperta e che ci sia ancora posto, poi l'ordine a 0 €; dopo, il
 * database prende i posti nuovi (la Home lo vede subito).
 * `email` vuota = senza email: l'ordine va all'indirizzo dell'ospite.
 */
export async function POST(request: Request) {
  const b = await request.json().catch(() => null);
  const id = Number(b?.subeventId);
  const posti: unknown = b?.seats;
  const email = typeof b?.email === 'string' && b.email.trim() ? b.email.trim() : OSPITE;
  if (!Number.isInteger(id) || id <= 0) return no('Manca lo spettacolo.');
  if (!Array.isArray(posti) || !posti.length || !posti.every(p => typeof p === 'string' && p.length < 200)) return no('Scegli almeno un posto.');
  if (posti.length > MASSIMO_POSTI) return no(`Al massimo ${MASSIMO_POSTI} posti per prenotazione.`);
  if (email !== OSPITE && !emailValida(email)) return no('Questo indirizzo email non va bene: controllalo.');

  try {
    const se = await spettacolo(id);
    if (!se || !se.active) return no('Questo spettacolo non è in programma.', 404);
    if (new Date(se.date_from).getTime() - Date.now() < CHIUSURA_MINUTI * 60_000) return no('La prenotazione per questo spettacolo è chiusa.', 409);
    if (disponibilitaDaQuote(await quote(id)).esaurito) {
      after(() => aggiornaDisponibilita(id, true));
      return no('I posti per questa proiezione sono finiti.', 409);
    }

    const order = await prenota(email, posti as string[], id);
    after(async () => { await aggiornaDisponibilita(id, true); await esauritiDeiFilm(); });
    // `secret` è la chiave dell'ordine: con il codice apre il biglietto in PDF (/api/biglietto).
    return NextResponse.json({ success: true, order: { code: order.code, secret: order.secret, positions: order.positions } });
  } catch (e) {
    if (e instanceof PrenotazioneRifiutata) return no(e.message, 409);
    console.error('[api/book]', e);
    return no('La prenotazione non è andata a buon fine. Riprova fra un momento.', 502);
  }
}
