import { NextResponse } from 'next/server';
import { apiError, requireApiKey } from '@/services/apiAuth';
import { catalogGetRails, catalogList } from '@/actions/catalogActions';

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
