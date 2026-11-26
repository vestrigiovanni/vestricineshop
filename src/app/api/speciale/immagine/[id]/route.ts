import sharp from 'sharp';
import prisma from '@/lib/prisma';

/**
 * Le larghezze che il sito può chiedere: le stesse di next/image (deviceSizes
 * in next.config.ts più le imageSizes predefinite). Altre non se ne fanno, così
 * nessuno può far lavorare il server con misure a caso.
 */
const LARGHEZZE = new Set([32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920]);
const CACHE = 'public, max-age=31536000, s-maxage=31536000, immutable';

/**
 * GET /api/speciale/immagine/<id>[?w=828] — un'immagine caricata dal gestionale.
 * Non cambia mai (una nuova è un id nuovo): la cache può tenerla un anno.
 * Con `?w=` la riduce il sito stesso (sharp, in WebP), al posto
 * dell'ottimizzazione di Vercel, che sul piano gratuito ha un tetto al mese.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const riga = await prisma.immagineSpeciale.findUnique({ where: { id }, select: { tipo: true, dati: true, w: true } }).catch(() => null);
  if (!riga) return new Response('Immagine non trovata', { status: 404 });

  const w = Number(new URL(request.url).searchParams.get('w'));
  if (LARGHEZZE.has(w) && w < riga.w && riga.tipo.startsWith('image/')) {
    const ridotta = await sharp(riga.dati).resize({ width: w, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer().catch(() => null);
    if (ridotta) return new Response(new Uint8Array(ridotta), { headers: { 'Content-Type': 'image/webp', 'Cache-Control': CACHE } });
  }
  return new Response(new Uint8Array(riga.dati), {
    headers: { 'Content-Type': riga.tipo, 'Cache-Control': CACHE },
  });
}
