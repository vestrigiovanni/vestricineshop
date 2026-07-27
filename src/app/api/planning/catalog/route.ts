import { NextResponse } from 'next/server';
import { apiError, requireApiKey } from '@/services/apiAuth';
import { catalogAddByTmdbId, catalogGetRails, catalogList } from '@/actions/catalogActions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/planning/catalog
 *   ?search= &genre= &decade= &minRuntime= &maxRuntime= &page=
 *   &rails=1&gaps=240,180   → in più, le corsie tematiche
 *
 * Senza `rails` risponde con la griglia paginata; con `rails=1` aggiunge le
 * corsie, che hanno senso solo se le passi i buchi liberi del periodo scelto.
 */
export async function GET(request: Request) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  const q = new URL(request.url).searchParams;
  const num = (k: string) => (q.get(k) ? Number(q.get(k)) : undefined);

  const params = {
    search: q.get('search') ?? undefined,
    genre: q.get('genre') ?? undefined,
    decade: num('decade'),
    minRuntime: num('minRuntime'),
    maxRuntime: num('maxRuntime'),
    onlyInPlex: q.get('onlyInPlex') === '1',
    hideScheduled: q.get('hideScheduled') !== '0',
    page: num('page') ?? 1,
    pageSize: Math.min(num('pageSize') ?? 40, 100),
    sort: 'titleAsc' as const,
  };

  try {
    const grid = await catalogList(params);
    if (q.get('rails') !== '1') return NextResponse.json(grid);

    const gaps = (q.get('gaps') ?? '')
      .split(',')
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);

    const rails = await catalogGetRails(params, {
      perRail: 18,
      gaps,
      genresInSchedule: (q.get('genresInSchedule') ?? '').split(',').filter(Boolean),
    });
    return NextResponse.json({ ...grid, rails });
  } catch (err) {
    return apiError(err);
  }
}

/**
 * POST /api/planning/catalog
 * { tmdbId } → { ok, id, title }
 *
 * Mette un film in archivio a partire da un id TMDB, e lo marca come confermato
 * a mano ("fixed"). Se il film c'è già, ne aggiorna i dati.
 *
 * È **l'unica rotta TMDB che scrive**: cercare (GET /api/planning/tmdb) e
 * sbirciare un film (GET /api/planning/tmdb/{tmdbId}) non toccano il catalogo.
 * Il confine è voluto: gli spettacoli leggono titolo, durata e locandina da
 * TMDB, quindi la riga di catalogo non è un requisito tecnico ma una decisione
 * di archivio — e la decisione la prende l'utente, mai una ricerca di passaggio.
 */
export async function POST(request: Request) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  let body: { tmdbId?: string | number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corpo della richiesta non valido.' }, { status: 400 });
  }

  const tmdbId = String(body?.tmdbId ?? '').trim();
  if (!/^\d+$/.test(tmdbId)) {
    return NextResponse.json(
      { error: 'Serve `tmdbId`: un id TMDB numerico.' },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(await catalogAddByTmdbId(tmdbId));
  } catch (err) {
    return apiError(err);
  }
}
