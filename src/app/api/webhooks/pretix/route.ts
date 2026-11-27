import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { aggiornaDisponibilita, syncSpettacoli } from '@/biglietteria/sync';

export const dynamic = 'force-dynamic';

const ORDINI = ['pretix.event.order.placed', 'pretix.event.order.paid', 'pretix.event.order.canceled', 'pretix.event.order.expired', 'pretix.event.order.placed.require_approval'];
const CAMBIATI = ['pretix.event.subevent.added', 'pretix.event.subevent.changed'];
const CANCELLATI = ['pretix.event.subevent.deleted'];

const numero = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * POST /api/webhooks/pretix — Pretix avvisa di un ordine o di uno spettacolo
 * cambiato, e il database si aggiorna su quello spettacolo e basta. Come nella
 * v1, e allo stesso indirizzo: il webhook su Pretix punta qui.
 */
export async function POST(request: Request) {
  const b = await request.json().catch(() => null);
  if (!b) return NextResponse.json({ error: 'Corpo non valido.' }, { status: 400 });
  const azione = String(b.action ?? '');
  if (![...ORDINI, ...CAMBIATI, ...CANCELLATI].includes(azione)) return NextResponse.json({ received: true });

  const ids = new Set<number>();
  for (const v of [b.subevent, b.data?.subevent, ...(Array.isArray(b.data?.positions) ? b.data.positions.map((p: { subevent?: unknown }) => p.subevent) : [])]) {
    const n = numero(v);
    if (n) ids.add(n);
  }
  if (!ids.size) return NextResponse.json({ received: true });

  try {
    if (ORDINI.includes(azione)) for (const id of ids) await aggiornaDisponibilita(id, true);
    else if (CAMBIATI.includes(azione)) await syncSpettacoli([...ids]);
    else await prisma.pretixSync.deleteMany({ where: { pretixId: { in: [...ids] } } });
    revalidatePath('/');
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error('[webhook pretix]', azione, e);
    return NextResponse.json({ error: 'Aggiornamento non riuscito.' }, { status: 500 });
  }
}
