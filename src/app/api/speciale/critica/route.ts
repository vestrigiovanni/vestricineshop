import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { dalMac } from '@/lib/segretoMac';

export const dynamic = 'force-dynamic';

const STATI = ['lavoro', 'fatto', 'errore'];
const testo = (t: unknown, max = 500) => (typeof t === 'string' ? t.trim().slice(0, max) : '');

/**
 * POST /api/speciale/critica — le risposte di «Critica dal trailer» dal Mac
 * (scripts/critica-dal-trailer.mjs): a che punto è, e alla fine le citazioni
 * e il carattere. La scheda Speciale le legge con `specialeCriticaStato`.
 */
export async function POST(request: Request) {
  if (!dalMac(request)) return NextResponse.json({ error: 'Non autorizzato.' }, { status: 401 });
  const b = await request.json().catch(() => null);
  const tmdbId = Number(b?.tmdbId);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return NextResponse.json({ error: 'Manca il film.' }, { status: 400 });
  if (!STATI.includes(b?.stato)) return NextResponse.json({ error: 'Stato sconosciuto.' }, { status: 400 });
  const citazioni = Array.isArray(b.citazioni)
    ? b.citazioni.slice(0, 30).map((c: Record<string, unknown>) => ({
      testo: testo(c.testo), fonte: testo(c.fonte, 120), critico: testo(c.critico, 120), fondale: testo(c.fondale, 300),
    })).filter((c: { testo: string }) => c.testo)
    : undefined;
  const k = b.carattere;
  const carattere = k && typeof k === 'object' && testo(k.famiglia, 80) && testo(k.src, 300)
    ? { famiglia: testo(k.famiglia, 80), peso: Number(k.peso) || 400, src: testo(k.src, 300) }
    : undefined;
  const dati = {
    stato: b.stato as string,
    messaggio: testo(b.messaggio),
    ...(typeof b.trailer === 'string' ? { trailer: testo(b.trailer, 40) } : {}),
    ...(citazioni ? { citazioni: citazioni as Prisma.InputJsonValue } : {}),
    ...(carattere ? { carattere: carattere as Prisma.InputJsonValue } : {}),
  };
  await prisma.criticaTrailer.upsert({ where: { tmdbId }, create: { tmdbId, ...dati }, update: dati });
  return NextResponse.json({ ok: true });
}
