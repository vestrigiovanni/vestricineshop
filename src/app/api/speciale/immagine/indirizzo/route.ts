import { NextResponse } from 'next/server';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import sharp from 'sharp';
import prisma from '@/lib/prisma';
import { checkAdminSession } from '@/actions/authActions';
import { risolvi, scarica } from '@/services/stampa/distributori';
import { Spiegato } from '@/services/esito';

export const dynamic = 'force-dynamic';
/** Un'immagine grande da un sito lento (o un file Drive) può metterci un po'. */
export const maxDuration = 60;

/** Il lato lungo massimo: un banner a tutta larghezza su uno schermo grande Retina. */
const LATO = 3840;

/** Gli indirizzi della rete interna (e del server stesso) non si scaricano: il server non fa da ponte. */
function privato(ip: string): boolean {
  if (isIP(ip) === 6) {
    const x = ip.toLowerCase();
    return x === '::1' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80') || x.startsWith('::ffff:127.') || x === '::';
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

async function pubblico(host: string) {
  if (/^localhost$|\.local$|\.internal$/i.test(host)) throw new Spiegato('Quell’indirizzo non è un sito pubblico.');
  const indirizzi = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!indirizzi.length) throw new Spiegato(`Non trovo il sito ${host}.`);
  if (indirizzi.some(a => privato(a.address))) throw new Spiegato('Quell’indirizzo non è un sito pubblico.');
}

/**
 * POST /api/speciale/immagine/indirizzo — { url } → { src, w, h }.
 * Per le immagini trascinate da un'altra pagina o incollate come link: il
 * browser non può leggerle (gli altri siti non lo lasciano fare), il server sì.
 * Segue bit.ly e i file di Drive come «Riempi dal distributore», tiene la
 * qualità (fino a 3840 px, JPEG 90; PNG solo se c'è del trasparente) e la
 * salva come quelle trascinate. Solo dal gestionale.
 */
export async function POST(request: Request) {
  if (!(await checkAdminSession())) return NextResponse.json({ error: 'Serve il login del gestionale: ricarica la pagina.' }, { status: 401 });
  try {
    const { url } = (await request.json().catch(() => ({}))) as { url?: unknown };
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url.trim())) throw new Spiegato('Quello che hai incollato non è un indirizzo d’immagine.');
    const dove = await risolvi(url.trim());
    await pubblico(new URL(dove).hostname);
    const file = await scarica(dove);
    let meta: sharp.Metadata;
    try {
      meta = await sharp(file.dati, { failOn: 'none' }).metadata();
    } catch {
      throw new Spiegato('Il link non porta a un’immagine. Apri l’immagine da sola (tasto destro → Apri immagine in un’altra scheda) e trascina quella.');
    }
    if (!meta.width || !meta.height) throw new Spiegato('Il link non porta a un’immagine.');
    const trasparente = !!meta.hasAlpha && !(await sharp(file.dati, { failOn: 'none' }).stats()).isOpaque;
    const { data, info } = await sharp(file.dati, { failOn: 'none' })
      .rotate()
      .resize({ width: LATO, height: LATO, fit: 'inside', withoutEnlargement: true })
      [trasparente ? 'png' : 'jpeg'](trasparente ? { compressionLevel: 9 } : { quality: 90, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    const nome = (file.nome || 'immagine').replace(/\.\w+$/, '').slice(0, 180) + (trasparente ? '.png' : '.jpg');
    const riga = await prisma.immagineSpeciale.create({
      data: { nome, tipo: trasparente ? 'image/png' : 'image/jpeg', w: info.width, h: info.height, dati: new Uint8Array(data) },
      select: { id: true, w: true, h: true },
    });
    return NextResponse.json({ src: `/api/speciale/immagine/${riga.id}`, w: riga.w, h: riga.h });
  } catch (err) {
    if (err instanceof Spiegato) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error('[speciale] immagine da indirizzo:', err);
    return NextResponse.json({ error: 'Non sono riuscito a prendere quell’immagine. Scaricala e trascina il file.' }, { status: 500 });
  }
}
