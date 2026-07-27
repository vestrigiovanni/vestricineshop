import { NextResponse } from 'next/server';
import { apiError, requireApiKey } from '@/services/apiAuth';
import { catalogSearchTmdb, catalogWhichExist } from '@/actions/catalogActions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/planning/tmdb?q=metropolis → { results: [...] }
 *
 * Cerca su TMDB, anche fuori dal catalogo. `q` accetta un titolo o direttamente
 * un id TMDB numerico, utile quando la ricerca per titolo abbina il film
 * sbagliato.
 *
 * Ogni risultato porta `inCatalog`, così l'app sa a chi proporre l'aggiunta in
 * archivio. Cercare però non aggiunge niente: per quello c'è
 * POST /api/planning/catalog, ed è una chiamata separata apposta.
 */
export async function GET(request: Request) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  const q = (new URL(request.url).searchParams.get('q') ?? '').trim();
  if (!q) {
    return NextResponse.json({ error: 'Parametro `q` mancante: serve un titolo o un id TMDB.' }, { status: 400 });
  }

  try {
    const hits = await catalogSearchTmdb(q);
    const known = new Set(await catalogWhichExist(hits.map((h) => String(h.id))));
    return NextResponse.json({
      results: hits.map((h) => ({ ...h, inCatalog: known.has(String(h.id)) })),
    });
  } catch (err) {
    return apiError(err);
  }
}
