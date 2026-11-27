import prisma from '@/lib/prisma';
import { ErrorePretix, ordine } from '@/biglietteria/pretix';
import { disegnaBiglietto } from '@/biglietteria/biglietto';
import { sala as nomeSala } from '@/home/metadati';

export const dynamic = 'force-dynamic';

const testo = (t: string, status: number) => new Response(t, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

/**
 * GET /api/biglietto?ordine=ABC12&chiave=<segreto dell'ordine> — il PDF dei
 * biglietti di un ordine, una pagina per posto. Serve la chiave che riceve
 * solo chi ha prenotato: il codice dell'ordine da solo non basta.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const codice = (q.get('ordine') || '').trim().toUpperCase();
  const chiave = (q.get('chiave') || '').trim();
  if (!/^[A-Z0-9]{4,16}$/.test(codice) || !chiave) return testo('Manca il codice del biglietto.', 400);

  try {
    const o = await ordine(codice);
    if (!o || o.secret !== chiave) return testo('Biglietto non trovato.', 404);
    const prima = o.positions[0];
    if (!prima) return testo('Questo ordine non ha biglietti.', 404);

    const riga = await prisma.pretixSync.findUnique({ where: { pretixId: prima.subevent }, include: { movie: true } });
    if (!riga) return testo('Lo spettacolo di questo biglietto non è più in programma.', 404);
    const m = riga.movie;
    const pdf = await disegnaBiglietto({
      titolo: m?.customTitle && m.customTitle !== 'Caricamento...' ? m.customTitle : riga.name,
      data: riga.dateFrom.toISOString(),
      sala: nomeSala({ id: 0, date: '', roomName: m?.customRoomName || riga.roomName || '' }),
      durata: m?.runtime,
      regia: m?.customDirector || '',
      fondale: m?.customBackdropPath || '',
      logo: m?.customLogoPath && m.customLogoPath !== 'none' ? m.customLogoPath : '',
      ordine: o.code,
      posti: o.positions.map(p => ({ segreto: p.secret, posto: p.seat?.name || 'Posto unico' })),
    });
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="biglietto-vestri-cinema-${o.code}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    if (e instanceof ErrorePretix && e.stato === 404) return testo('Biglietto non trovato.', 404);
    console.error('[api/biglietto]', e);
    return testo('Non riesco a preparare il biglietto adesso. Riprova fra un momento.', 502);
  }
}
