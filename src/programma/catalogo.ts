import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { cercaGrezza, dettagli, dettagliGrezzi } from '@/gestionale/tmdb/leggi';
import { campiTmdb, chiaveDi } from '@/gestionale/catalogo/abbina';

/**
 * Il catalogo come lo vede la programmazione, dalla v1 (`catalogActions`):
 * le stesse risposte, perché le legge l'app iOS da `/api/planning/catalog` e
 * `/api/planning/tmdb`. Solo dal server.
 */

export type CatalogRail = 'perfect' | 'recommended' | 'awarded' | 'acclaimed' | 'fresh' | 'surprise';

export const CATALOG_RAIL_LABELS: Record<CatalogRail, string> = {
  perfect: 'Perfetti per questo slot',
  recommended: 'Consigliati',
  awarded: 'Premiati dalla critica',
  acclaimed: 'Acclamati',
  fresh: 'Novità in libreria',
  surprise: 'Sorpresa',
};

export interface CatalogListParams {
  search?: string;
  genre?: string;
  decade?: number;
  director?: string;
  onlyUnverified?: boolean;
  hideScheduled?: boolean;
  onlyInPlex?: boolean;
  minRuntime?: number;
  maxRuntime?: number;
  originalLanguage?: string;
  sort?: 'listOrder' | 'titleAsc' | 'yearDesc';
  page?: number;
  pageSize?: number;
}

/** La durata sta in `runtime` (TMDB) o in `durationMin` (Plex): il filtro le accetta tutte e due. */
function runtimeFilter(min?: number, max?: number): Prisma.CatalogFilmWhereInput | null {
  if (min == null && max == null) return null;
  const range: Prisma.IntNullableFilter = {};
  if (min != null) range.gte = min;
  if (max != null) range.lte = max;
  return { OR: [{ runtime: range }, { AND: [{ runtime: null }, { durationMin: range }] }] };
}

async function buildWhere(params: CatalogListParams): Promise<Prisma.CatalogFilmWhereInput> {
  const where: Prisma.CatalogFilmWhereInput = {};
  const and: Prisma.CatalogFilmWhereInput[] = [];
  if (params.search) {
    where.OR = [
      { title: { contains: params.search, mode: 'insensitive' } },
      { tmdbTitle: { contains: params.search, mode: 'insensitive' } },
      { originalTitle: { contains: params.search, mode: 'insensitive' } },
      { director: { contains: params.search, mode: 'insensitive' } },
    ];
  }
  if (params.genre) where.genres = { has: params.genre };
  if (params.director) where.director = params.director;
  if (params.decade != null) where.year = { gte: params.decade, lt: params.decade + 10 };
  if (params.onlyUnverified) where.verifyStatus = { in: ['suspect', 'missing'] };
  if (params.onlyInPlex) where.inPlex = true;
  if (params.originalLanguage) where.originalLanguage = params.originalLanguage;
  const runtime = runtimeFilter(params.minRuntime, params.maxRuntime);
  if (runtime) and.push(runtime);
  if (params.hideScheduled) {
    const scheduled = await prisma.pretixSync.findMany({ where: { tmdbId: { not: null } }, select: { tmdbId: true }, distinct: ['tmdbId'] });
    where.tmdbId = { notIn: scheduled.map((s) => s.tmdbId!).filter(Boolean) };
  }
  if (and.length) where.AND = and;
  return where;
}

type CatalogRow = Prisma.CatalogFilmGetPayload<Record<string, never>>;

async function withScheduledCount(films: CatalogRow[]) {
  const tmdbIds = films.map((f) => f.tmdbId).filter(Boolean) as string[];
  const grouped = tmdbIds.length
    ? await prisma.pretixSync.groupBy({ by: ['tmdbId'], where: { tmdbId: { in: tmdbIds } }, _count: { _all: true } })
    : [];
  const countMap = new Map(grouped.map((g) => [g.tmdbId, g._count._all]));
  return films.map((f) => ({ ...f, scheduledCount: f.tmdbId ? countMap.get(f.tmdbId) ?? 0 : 0 }));
}

export async function catalogList(params: CatalogListParams = {}) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 60;
  const where = await buildWhere(params);
  const orderBy: Prisma.CatalogFilmOrderByWithRelationInput =
    params.sort === 'titleAsc' ? { title: 'asc' } : params.sort === 'yearDesc' ? { year: 'desc' } : { id: 'asc' };
  const [films, total] = await Promise.all([
    prisma.catalogFilm.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.catalogFilm.count({ where }),
  ]);
  return { films: await withScheduledCount(films), total, page, pageSize, hasMore: page * pageSize < total };
}

/** Un film è programmabile solo se sappiamo a quale film TMDB corrisponde. */
const USABLE: Prisma.CatalogFilmWhereInput = { tmdbId: { not: null }, verifyStatus: { not: 'missing' } };

const runtimeOf = (f: { runtime: number | null; durationMin: number | null }) => f.runtime ?? f.durationMin ?? null;

/** Le corsie del catalogo per l'app: stessi filtri della griglia. */
export async function catalogGetRails(
  params: CatalogListParams = {},
  options: { perRail?: number; gaps?: number[]; genresInSchedule?: string[] } = {},
) {
  const perRail = Math.min(Math.max(options.perRail ?? 20, 1), 60);
  const base = await buildWhere(params);
  const where: Prisma.CatalogFilmWhereInput = { AND: [base, USABLE] };

  const [awarded, acclaimed, fresh, recommendedPool, surprisePool] = await Promise.all([
    prisma.catalogFilm.findMany({ where: { AND: [where, { NOT: { awardLabels: { isEmpty: true } } }] }, orderBy: [{ voteAverage: 'desc' }, { id: 'asc' }], take: perRail * 3 }),
    prisma.catalogFilm.findMany({ where: { AND: [where, { voteAverage: { gte: 7.5 } }, { voteCount: { gte: 500 } }] }, orderBy: [{ voteAverage: 'desc' }, { id: 'asc' }], take: perRail }),
    prisma.catalogFilm.findMany({ where: { AND: [where, { addedAt: { not: null } }, { inPlex: true }] }, orderBy: [{ addedAt: 'desc' }, { id: 'asc' }], take: perRail }),
    prisma.catalogFilm.findMany({
      where: { AND: [await buildWhere({ ...params, hideScheduled: true }), USABLE, { voteAverage: { gte: 6.8 } }] },
      orderBy: [{ voteAverage: 'desc' }, { id: 'asc' }],
      take: perRail * 4,
    }),
    prisma.catalogFilm.findMany({ where, select: { id: true } }),
  ]);

  const awardedSorted = [...awarded]
    .sort((a, b) => b.awardLabels.length - a.awardLabels.length || (b.voteAverage ?? 0) - (a.voteAverage ?? 0))
    .slice(0, perRail);

  const tired = new Set(options.genresInSchedule ?? []);
  const fresco = (f: CatalogRow) => (f.genres.some((g) => tired.has(g)) ? 0 : 1);
  const recommended = [...recommendedPool]
    .sort((a, b) => fresco(b) - fresco(a) || (b.voteAverage ?? 0) - (a.voteAverage ?? 0))
    .slice(0, perRail);

  const ids = surprisePool.map((f) => f.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const surprise = ids.length ? await prisma.catalogFilm.findMany({ where: { id: { in: ids.slice(0, perRail) } } }) : [];

  // Perfetti per questo slot: chi riempie meglio il buco più stretto in cui ci sta.
  let perfect: CatalogRow[] = [];
  const gaps = (options.gaps ?? []).filter((g) => Number.isFinite(g) && g > 0).sort((a, b) => b - a);
  const GAP_MARGIN = 10;
  if (gaps.length > 0 && gaps[0] - GAP_MARGIN > 0) {
    const pool = await prisma.catalogFilm.findMany({
      where: { AND: [where, runtimeFilter(undefined, gaps[0] - GAP_MARGIN) ?? {}] },
      orderBy: [{ voteAverage: 'desc' }, { id: 'asc' }],
      take: perRail * 5,
    });
    perfect = pool
      .map((f) => {
        const rt = runtimeOf(f);
        if (rt == null) return null;
        const gap = [...gaps].reverse().find((g) => rt + GAP_MARGIN <= g);
        return gap == null ? null : { film: f, waste: gap - rt };
      })
      .filter((x): x is { film: CatalogRow; waste: number } => x !== null)
      .sort((a, b) => a.waste - b.waste || (b.film.voteAverage ?? 0) - (a.film.voteAverage ?? 0))
      .slice(0, perRail)
      .map((x) => x.film);
  }

  const rails: { rail: CatalogRail; films: CatalogRow[] }[] = [
    { rail: 'perfect', films: perfect },
    { rail: 'recommended', films: recommended },
    { rail: 'awarded', films: awardedSorted },
    { rail: 'acclaimed', films: acclaimed },
    { rail: 'fresh', films: fresh },
    { rail: 'surprise', films: surprise },
  ];
  return Promise.all(
    rails.filter((r) => r.films.length > 0).map(async (r) => ({ rail: r.rail, label: CATALOG_RAIL_LABELS[r.rail], films: await withScheduledCount(r.films) })),
  );
}

/** La ricerca su TMDB; un numero è un id. */
export async function catalogSearchTmdb(query: string) {
  const q = query.trim();
  if (!q) return [];
  if (/^\d+$/.test(q)) {
    const d = await dettagliGrezzi(q);
    return d ? [d] : [];
  }
  return cercaGrezza(q);
}

/** Quali di questi id TMDB sono già in catalogo. */
export async function catalogWhichExist(tmdbIds: string[]): Promise<string[]> {
  const ids = tmdbIds.filter(Boolean);
  if (ids.length === 0) return [];
  const rows = await prisma.catalogFilm.findMany({ where: { tmdbId: { in: ids } }, select: { tmdbId: true }, distinct: ['tmdbId'] });
  return rows.map((r) => r.tmdbId!).filter(Boolean);
}

/**
 * Un film di TMDB nella forma del catalogo, **senza** scriverlo: per
 * programmare un titolo di passaggio. Se il film in catalogo c'è, vincono i
 * suoi dati.
 */
export async function catalogPreviewTmdb(tmdbId: string) {
  const d = await dettagli(tmdbId);
  if (!d) return null;
  const existing = await prisma.catalogFilm.findFirst({ where: { tmdbId }, orderBy: { id: 'asc' } });
  const scheduledCount = await prisma.pretixSync.count({ where: { tmdbId } });
  return {
    id: existing?.id ?? 0,
    title: existing?.title || d.titolo,
    year: existing?.year ?? d.anno,
    durationMin: existing?.durationMin ?? d.durata,
    runtime: existing?.runtime ?? d.durata,
    director: existing?.director ?? d.regia[0] ?? null,
    tmdbId,
    posterPath: existing?.posterPath ?? d.locandina,
    genres: existing?.genres?.length ? existing.genres : d.generi,
    voteAverage: existing?.voteAverage ?? d.voto,
    awardLabels: existing?.awardLabels ?? [],
    inPlex: existing?.inPlex ?? false,
    plexLibraries: existing?.plexLibraries ?? [],
    verifyStatus: existing?.verifyStatus ?? 'fixed',
    scheduledCount,
    /** Falso = sta solo in questa bozza, il catalogo non lo conosce. */
    inCatalog: Boolean(existing),
  };
}

/** Aggiunge (o aggiorna) un film nel catalogo da un id TMDB: confermato per definizione. */
export async function catalogAddByTmdbId(tmdbId: string) {
  const d = await dettagli(tmdbId);
  if (!d) throw new Error('Film TMDB non trovato per questo id.');
  const sourceKey = chiaveDi(d.titolo, d.anno);
  const data = {
    ...campiTmdb(d),
    title: d.titolo,
    year: d.anno,
    durationMin: d.durata,
    director: d.regia[0] ?? null,
    tmdbId,
    verifyStatus: 'fixed',
    enrichedAt: new Date(),
  };
  const film = await prisma.catalogFilm.upsert({ where: { sourceKey }, update: data, create: { sourceKey, ...data } });
  return { ok: true, id: film.id, title: film.title };
}
