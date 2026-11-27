import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { dalMac } from '@/lib/segretoMac';

export const dynamic = 'force-dynamic';

/** Il tetto di un'immagine caricata: il browser la riduce prima, questo è il paracadute. */
const MASSIMO = 4 * 1024 * 1024;
const TIPI = ['image/jpeg', 'image/png', 'image/webp'];
/** Dal Mac arriva anche il carattere delle citazioni («Critica dal trailer»). */
const CARATTERI = ['font/woff2'];

/**
 * POST /api/speciale/immagine — carica un'immagine per la proiezione speciale.
 * Risposte identiche alla v1. Dal Mac (segreto) già ora; dal gestionale (cookie
 * del login) dalla fetta 6, quando arriva il login sicuro.
 * Il browser la manda già ridotta (al massimo 3840 px, sotto i 4 MB) con le sue
 * misure: qui si controlla e si salva.
 * Risponde col riferimento da usare nella scheda: `/api/speciale/immagine/<id>`.
 */
export async function POST(request: Request) {
  const mac = dalMac(request);
  if (!mac) return NextResponse.json({ error: 'Serve il login del gestionale.' }, { status: 401 });
  const form = await request.formData();
  const file = form.get('file');
  const w = Number(form.get('w')), h = Number(form.get('h'));
  if (!(file instanceof File)) return NextResponse.json({ error: 'Manca il file.' }, { status: 400 });
  if (!TIPI.includes(file.type) && !(mac && CARATTERI.includes(file.type))) return NextResponse.json({ error: 'Solo JPEG, PNG o WebP.' }, { status: 400 });
  if (file.size > MASSIMO) return NextResponse.json({ error: 'Immagine troppo grande (oltre 4 MB anche ridotta).' }, { status: 400 });
  if (!(w > 0 && h > 0)) return NextResponse.json({ error: 'Mancano le misure dell’immagine.' }, { status: 400 });
  const riga = await prisma.immagineSpeciale.create({
    data: { nome: (file.name || 'immagine').slice(0, 200), tipo: file.type, w: Math.round(w), h: Math.round(h), dati: Buffer.from(await file.arrayBuffer()) },
    select: { id: true, w: true, h: true },
  });
  return NextResponse.json({ src: `/api/speciale/immagine/${riga.id}`, w: riga.w, h: riga.h });
}
