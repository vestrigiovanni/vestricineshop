'use server';

import prisma from '@/lib/prisma';
import { searchMovies, getMovieDetails, getDirectors } from '@/services/tmdb';
import { seedCatalogFromCsv, enrichPendingFilms } from '@/services/catalogImport';
import { normalizeText } from '@/services/catalogMatch';
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

/**
 * Restituisce fino a `count` film casuali (distinti) tra quelli filtrati,
 * con scheduledCount, in ordine mescolato. Diversi a ogni chiamata.
 */
export async function catalogRandomMany(params: CatalogListParams = {}, count = 20) {
  const where = await buildWhere({ ...params, hideScheduled: params.hideScheduled ?? true });
  const ids = (await prisma.catalogFilm.findMany({ where, select: { id: true } })).map((f) => f.id);
  // shuffle (Fisher–Yates) e prendi i primi `count`
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const pickIds = ids.slice(0, count);
  if (pickIds.length === 0) return [];

  const films = await prisma.catalogFilm.findMany({ where: { id: { in: pickIds } } });
  const tmdbIds = films.map((f) => f.tmdbId).filter(Boolean) as string[];
  const grouped = tmdbIds.length
    ? await prisma.pretixSync.groupBy({ by: ['tmdbId'], where: { tmdbId: { in: tmdbIds } }, _count: { _all: true } })
    : [];
  const countMap = new Map(grouped.map((g) => [g.tmdbId, g._count._all]));
  const byId = new Map(films.map((f) => [f.id, f]));

  return pickIds
    .map((id) => byId.get(id))
    .filter((f): f is NonNullable<typeof f> => Boolean(f))
    .map((f) => ({ ...f, scheduledCount: f.tmdbId ? countMap.get(f.tmdbId) ?? 0 : 0 }));
}

export async function catalogSearchTmdb(query: string) {
  const q = query.trim();
  if (!q) return [];
  // Se è un id TMDB numerico, recupera direttamente quel film (utile quando la
  // ricerca per titolo non trova l'associazione giusta).
  if (/^\d+$/.test(q)) {
    const details = await getMovieDetails(q);
    return details ? [details] : [];
  }
  return searchMovies(q, false, 'it-IT');
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

// --- Gestione manuale del catalogo ---

/** Esiste già un film in catalogo con questo tmdbId? */
export async function catalogExists(tmdbId: string): Promise<boolean> {
  const count = await prisma.catalogFilm.count({ where: { tmdbId } });
  return count > 0;
}

/**
 * Conferma manualmente che l'abbinamento TMDB corrente del film è corretto.
 * Toglie il film dallo stato "da verificare" marcandolo come confermato ("fixed").
 */
export async function catalogMarkVerified(catalogId: number) {
  await prisma.catalogFilm.update({
    where: { id: catalogId },
    data: { verifyStatus: 'fixed', enrichedAt: new Date() },
  });
  return { ok: true };
}

/** Elimina un film dal catalogo. */
export async function catalogDelete(catalogId: number) {
  await prisma.catalogFilm.delete({ where: { id: catalogId } });
  return { ok: true };
}

/**
 * Aggiunge (o aggiorna) un film nel catalogo a partire da un id TMDB.
 * Lo marca come "fixed" (inserito/confermato manualmente).
 */
export async function catalogAddByTmdbId(tmdbId: string) {
  const details = await getMovieDetails(tmdbId);
  if (!details) throw new Error('Film TMDB non trovato per questo id.');

  const title = details.title || details.original_title || `TMDB ${tmdbId}`;
  const year = details.release_date ? parseInt(details.release_date.slice(0, 4), 10) : null;
  const directors = getDirectors(details);
  const sourceKey = `${normalizeText(title)}|${year ?? ''}`;

  const data = {
    title,
    year: Number.isFinite(year as number) ? year : null,
    durationMin: details.runtime ?? null,
    director: directors[0] ?? null,
    tmdbId,
    tmdbTitle: details.title,
    tmdbYear: Number.isFinite(year as number) ? year : null,
    posterPath: details.poster_path ?? null,
    genres: (details.genres ?? []).map((g) => g.name),
    runtime: details.runtime ?? null,
    verifyStatus: 'fixed',
    enrichedAt: new Date(),
  };

  const film = await prisma.catalogFilm.upsert({
    where: { sourceKey },
    update: data,
    create: { sourceKey, ...data },
  });
  return { ok: true, id: film.id, title: film.title };
}
