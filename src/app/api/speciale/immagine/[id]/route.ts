import prisma from '@/lib/prisma';

/**
 * GET /api/speciale/immagine/<id> — un'immagine caricata dal gestionale.
 * Non cambia mai (una nuova è un id nuovo): la cache può tenerla un anno.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const riga = await prisma.immagineSpeciale.findUnique({ where: { id }, select: { tipo: true, dati: true } }).catch(() => null);
  if (!riga) return new Response('Immagine non trovata', { status: 404 });
  return new Response(new Uint8Array(riga.dati), {
    headers: { 'Content-Type': riga.tipo, 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}
