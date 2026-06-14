'use server';

import prisma from '@/lib/prisma';
import { searchMovies, getMovieDetails } from '@/services/tmdb';
import { seedCatalogFromCsv, enrichPendingFilms } from '@/services/catalogImport';
import type { Prisma } from '@prisma/client';

export interface CatalogListParams {
  search?: string;
  genre?: string;
  decade?: number;
  director?: string;
  onlyUnverified?: boolean;
  hideScheduled?: boolean;
  sort?: 'listOrder' | 'titleAsc' | 'yearDesc';
  page?: number;
  pageSize?: number;
}

async function buildWhere(params: CatalogListParams): Promise<Prisma.CatalogFilmWhereInput> {
  const where: Prisma.CatalogFilmWhereInput = {};
  if (params.search) {
    where.OR = [
      { title: { contains: params.search, mode: 'insensitive' } },
      { tmdbTitle: { contains: params.search, mode: 'insensitive' } },
      { director: { contains: params.search, mode: 'insensitive' } },
    ];
  }
  if (params.genre) where.genres = { has: params.genre };
  if (params.director) where.director = params.director;
  if (params.decade != null) where.year = { gte: params.decade, lt: params.decade + 10 };
  if (params.onlyUnverified) where.verifyStatus = { in: ['suspect', 'missing'] };
  if (params.hideScheduled) {
    const scheduled = await prisma.pretixSync.findMany({
      where: { tmdbId: { not: null } },
      select: { tmdbId: true },
      distinct: ['tmdbId'],
    });
    where.tmdbId = { notIn: scheduled.map((s) => s.tmdbId!).filter(Boolean) };
  }
  return where;
}

export async function catalogList(params: CatalogListParams = {}) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 60;
  const where = await buildWhere(params);
  const orderBy: Prisma.CatalogFilmOrderByWithRelationInput =
    params.sort === 'titleAsc' ? { title: 'asc' }
    : params.sort === 'yearDesc' ? { year: 'desc' }
    : { id: 'asc' };

  const [films, total] = await Promise.all([
    prisma.catalogFilm.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.catalogFilm.count({ where }),
  ]);

  const tmdbIds = films.map((f) => f.tmdbId).filter(Boolean) as string[];
  const grouped = tmdbIds.length
    ? await prisma.pretixSync.groupBy({
        by: ['tmdbId'],
        where: { tmdbId: { in: tmdbIds } },
        _count: { _all: true },
      })
    : [];
  const countMap = new Map(grouped.map((g) => [g.tmdbId, g._count._all]));

  return {
    films: films.map((f) => ({ ...f, scheduledCount: f.tmdbId ? countMap.get(f.tmdbId) ?? 0 : 0 })),
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  };
}

export async function catalogGetFacets() {
  const films = await prisma.catalogFilm.findMany({ select: { genres: true, director: true, year: true } });
  const genres = new Set<string>();
  const directors = new Set<string>();
  const decades = new Set<number>();
  for (const f of films) {
    f.genres.forEach((g) => genres.add(g));
    if (f.director) directors.add(f.director);
    if (f.year) decades.add(Math.floor(f.year / 10) * 10);
  }
  return {
    genres: [...genres].sort(),
    directors: [...directors].sort(),
    decades: [...decades].sort((a, b) => b - a),
  };
}

export async function catalogStats() {
  const [total, ok, suspect, missing] = await Promise.all([
    prisma.catalogFilm.count(),
    prisma.catalogFilm.count({ where: { verifyStatus: 'ok' } }),
    prisma.catalogFilm.count({ where: { verifyStatus: 'suspect' } }),
    prisma.catalogFilm.count({ where: { verifyStatus: 'missing' } }),
  ]);
  return { total, ok, suspect, missing };
}

export async function catalogRandom(params: CatalogListParams = {}) {
  const where = await buildWhere({ ...params, hideScheduled: params.hideScheduled ?? true });
  const count = await prisma.catalogFilm.count({ where });
  if (!count) return null;
  const skip = Math.floor(Math.random() * count);
  const [film] = await prisma.catalogFilm.findMany({ where, skip, take: 1 });
  return film ?? null;
}

export async function catalogSearchTmdb(query: string) {
  if (!query.trim()) return [];
  return searchMovies(query, false, 'it-IT');
}

export async function catalogFixTmdbId(catalogId: number, newTmdbId: string) {
  const details = await getMovieDetails(newTmdbId);
  if (!details) throw new Error('Film TMDB non trovato per questo id.');
  const tmdbYear = details.release_date ? parseInt(details.release_date.slice(0, 4), 10) : null;
  await prisma.catalogFilm.update({
    where: { id: catalogId },
    data: {
      tmdbId: newTmdbId,
      tmdbTitle: details.title,
      tmdbYear: Number.isFinite(tmdbYear as number) ? tmdbYear : null,
      posterPath: details.poster_path ?? null,
      genres: (details.genres ?? []).map((g) => g.name),
      runtime: details.runtime ?? null,
      verifyStatus: 'fixed',
      enrichedAt: new Date(),
    },
  });
  return { ok: true };
}

// --- Import (eseguiti dall'admin, una tantum / ripetibili) ---
export async function catalogSeed() {
  return seedCatalogFromCsv();
}

export async function catalogEnrich(limit = 40) {
  return enrichPendingFilms(limit);
}
