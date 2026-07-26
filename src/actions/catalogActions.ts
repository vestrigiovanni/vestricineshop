'use server';

import prisma from '@/lib/prisma';
import { searchMovies, getMovieDetails, getDirectors } from '@/services/tmdb';
import { seedCatalogFromCsv, enrichPendingFilms, backfillFilmMetadata } from '@/services/catalogImport';
import { normalizeText } from '@/services/catalogMatch';
import { CATALOG_RAIL_LABELS, type CatalogRail } from '@/constants/catalogRails';
import type { Prisma } from '@prisma/client';

export interface CatalogListParams {
  search?: string;
  genre?: string;
  decade?: number;
  director?: string;
  onlyUnverified?: boolean;
  hideScheduled?: boolean;
  /** Solo film attualmente presenti nella libreria Plex. */
  onlyInPlex?: boolean;
  /** Durata in minuti: filtri della fascia scelta nel wizard. */
  minRuntime?: number;
  maxRuntime?: number;
  originalLanguage?: string;
  sort?: 'listOrder' | 'titleAsc' | 'yearDesc';
  page?: number;
  pageSize?: number;
}

/**
 * La durata di un film può stare in `runtime` (da TMDB) o in `durationMin`
 * (da Plex o dal CSV). Nessuno dei due è sempre valorizzato, quindi ogni
 * filtro sulla durata deve accettare entrambi.
 */
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
    const scheduled = await prisma.pretixSync.findMany({
      where: { tmdbId: { not: null } },
      select: { tmdbId: true },
      distinct: ['tmdbId'],
    });
    where.tmdbId = { notIn: scheduled.map((s) => s.tmdbId!).filter(Boolean) };
  }

  if (and.length) where.AND = and;
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

// ═══════════════════════════════════════════════════════════════════════════
// CORSIE DEL CATALOGO
// Il wizard di programmazione mostra il catalogo per corsie tematiche invece
// che come una griglia piatta. Le corsie arrivano tutte in una sola chiamata:
// sei round-trip separati per una schermata che le mostra insieme sarebbero
// sei attese invece di una.
// ═══════════════════════════════════════════════════════════════════════════

/** Un film è programmabile solo se sappiamo a quale film TMDB corrisponde. */
const USABLE: Prisma.CatalogFilmWhereInput = {
  tmdbId: { not: null },
  verifyStatus: { not: 'missing' },
};

type CatalogRow = Prisma.CatalogFilmGetPayload<Record<string, never>>;

/** Durata utilizzabile di un film, da qualunque fonte l'abbiamo. */
function runtimeOf(f: { runtime: number | null; durationMin: number | null }): number | null {
  return f.runtime ?? f.durationMin ?? null;
}

async function withScheduledCount(films: CatalogRow[]) {
  const tmdbIds = films.map((f) => f.tmdbId).filter(Boolean) as string[];
  const grouped = tmdbIds.length
    ? await prisma.pretixSync.groupBy({
        by: ['tmdbId'],
        where: { tmdbId: { in: tmdbIds } },
        _count: { _all: true },
      })
    : [];
  const countMap = new Map(grouped.map((g) => [g.tmdbId, g._count._all]));
  return films.map((f) => ({ ...f, scheduledCount: f.tmdbId ? countMap.get(f.tmdbId) ?? 0 : 0 }));
}

export interface CatalogRailsOptions {
  /** Quanti film per corsia. */
  perRail?: number;
  /**
   * Durate (in minuti) dei buchi liberi trovati al passo 1 del wizard.
   * Senza questi la corsia "Perfetti per questo slot" non ha senso e sparisce.
   */
  gaps?: number[];
  /** Generi già in cartellone nel periodo: i "Consigliati" ne cercano di diversi. */
  genresInSchedule?: string[];
}

/**
 * Le corsie del catalogo per il wizard. `params` applica gli stessi filtri
 * della griglia (ricerca, genere, decennio…) così le corsie restano coerenti
 * con ciò che l'utente ha filtrato.
 */
export async function catalogGetRails(
  params: CatalogListParams = {},
  options: CatalogRailsOptions = {}
): Promise<{ rail: CatalogRail; label: string; films: Awaited<ReturnType<typeof withScheduledCount>> }[]> {
  const perRail = Math.min(Math.max(options.perRail ?? 20, 1), 60);
  const base = await buildWhere(params);
  const where: Prisma.CatalogFilmWhereInput = { AND: [base, USABLE] };

  const [awarded, acclaimed, fresh, recommendedPool, surprisePool] = await Promise.all([
    prisma.catalogFilm.findMany({
      where: { AND: [where, { NOT: { awardLabels: { isEmpty: true } } }] },
      orderBy: [{ voteAverage: 'desc' }, { id: 'asc' }],
      take: perRail * 3,
    }),
    prisma.catalogFilm.findMany({
      where: { AND: [where, { voteAverage: { gte: 7.5 } }, { voteCount: { gte: 500 } }] },
      orderBy: [{ voteAverage: 'desc' }, { id: 'asc' }],
      take: perRail,
    }),
    prisma.catalogFilm.findMany({
      where: { AND: [where, { addedAt: { not: null } }, { inPlex: true }] },
      orderBy: [{ addedAt: 'desc' }, { id: 'asc' }],
      take: perRail,
    }),
    // I consigliati partono dai mai programmati con voto solido; la scelta fine
    // (generi diversi da quelli in cartellone) si fa in memoria.
    prisma.catalogFilm.findMany({
      where: { AND: [await buildWhere({ ...params, hideScheduled: true }), USABLE, { voteAverage: { gte: 6.8 } }] },
      orderBy: [{ voteAverage: 'desc' }, { id: 'asc' }],
      take: perRail * 4,
    }),
    prisma.catalogFilm.findMany({ where, select: { id: true } }),
  ]);

  // ── Premiati: chi ha più premi per primo ──────────────────────────────────
  const awardedSorted = [...awarded]
    .sort((a, b) => b.awardLabels.length - a.awardLabels.length || (b.voteAverage ?? 0) - (a.voteAverage ?? 0))
    .slice(0, perRail);

  // ── Consigliati: varietà di genere rispetto a ciò che è già in cartellone ──
  const tired = new Set(options.genresInSchedule ?? []);
  const recommended = [...recommendedPool]
    .sort((a, b) => {
      const freshness = (f: CatalogRow) => (f.genres.some((g) => tired.has(g)) ? 0 : 1);
      return freshness(b) - freshness(a) || (b.voteAverage ?? 0) - (a.voteAverage ?? 0);
    })
    .slice(0, perRail);

  // ── Sorpresa: pescata a caso, diversa a ogni apertura ─────────────────────
  const ids = surprisePool.map((f) => f.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const surprise = ids.length
    ? await prisma.catalogFilm.findMany({ where: { id: { in: ids.slice(0, perRail) } } })
    : [];

  // ── Perfetti per questo slot ──────────────────────────────────────────────
  // Un film "incastra" se sta in uno dei buchi liberi lasciando il minimo di
  // pausa. Fra quelli che incastrano vince chi riempie meglio il buco: è la
  // corsia che rende utile aver scelto il periodo *prima* dei film.
  let perfect: CatalogRow[] = [];
  const gaps = (options.gaps ?? []).filter((g) => Number.isFinite(g) && g > 0).sort((a, b) => b - a);
  if (gaps.length > 0) {
    const GAP_MARGIN = 10; // la pausa minima fra due spettacoli
    const largest = gaps[0] - GAP_MARGIN;
    if (largest > 0) {
      const pool = await prisma.catalogFilm.findMany({
        where: { AND: [where, runtimeFilter(undefined, largest) ?? {}] },
        orderBy: [{ voteAverage: 'desc' }, { id: 'asc' }],
        take: perRail * 5,
      });
      perfect = pool
        .map((f) => {
          const rt = runtimeOf(f);
          if (rt == null) return null;
          // Il buco più stretto in cui il film ci sta ancora: più è aderente,
          // meglio riempie la giornata.
          const gap = [...gaps].reverse().find((g) => rt + GAP_MARGIN <= g);
          if (gap == null) return null;
          return { film: f, waste: gap - rt };
        })
        .filter((x): x is { film: CatalogRow; waste: number } => x !== null)
        .sort((a, b) => a.waste - b.waste || (b.film.voteAverage ?? 0) - (a.film.voteAverage ?? 0))
        .slice(0, perRail)
        .map((x) => x.film);
    }
  }

  const rails: { rail: CatalogRail; films: CatalogRow[] }[] = [
    { rail: 'perfect', films: perfect },
    { rail: 'recommended', films: recommended },
    { rail: 'awarded', films: awardedSorted },
    { rail: 'acclaimed', films: acclaimed },
    { rail: 'fresh', films: fresh },
    { rail: 'surprise', films: surprise },
  ];

  const filled = await Promise.all(
    rails
      .filter((r) => r.films.length > 0)
      .map(async (r) => ({
        rail: r.rail,
        label: CATALOG_RAIL_LABELS[r.rail],
        films: await withScheduledCount(r.films),
      }))
  );
  return filled;
}

/**
 * La riga di catalogo di un film, creandola da TMDB se non c'è.
 *
 * Serve al wizard quando viene aperto su un film preciso (`?tmdb=…`): capita
 * dalla replica di uno spettacolo esistente o dal catalogo, e quel film
 * potrebbe non essere ancora fra quelli in libreria.
 */
export async function catalogEnsureByTmdbId(tmdbId: string) {
  const existing = await prisma.catalogFilm.findFirst({
    where: { tmdbId },
    orderBy: { id: 'asc' },
  });
  if (existing) {
    const [row] = await withScheduledCount([existing]);
    return row;
  }

  await catalogAddByTmdbId(tmdbId);
  const created = await prisma.catalogFilm.findFirst({ where: { tmdbId }, orderBy: { id: 'desc' } });
  if (!created) return null;
  const [row] = await withScheduledCount([created]);
  return row;
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

/** Quali di questi id TMDB sono già in catalogo. */
export async function catalogWhichExist(tmdbIds: string[]): Promise<string[]> {
  const ids = tmdbIds.filter(Boolean);
  if (ids.length === 0) return [];
  const rows = await prisma.catalogFilm.findMany({
    where: { tmdbId: { in: ids } },
    select: { tmdbId: true },
    distinct: ['tmdbId'],
  });
  return rows.map((r) => r.tmdbId!).filter(Boolean);
}

/**
 * Un film di TMDB nella forma che il wizard sa maneggiare, **senza** scriverlo
 * in catalogo.
 *
 * Serve a programmare un titolo di passaggio. La creazione degli spettacoli
 * legge titolo, durata e locandina da TMDB (vedi `commitRunner`), non dalla
 * riga di catalogo: quella riga quindi non è un requisito tecnico, è una
 * decisione di archivio. E siccome è una decisione, la prende l'utente — questa
 * funzione non tocca il database.
 */
export async function catalogPreviewTmdb(tmdbId: string) {
  const details = await getMovieDetails(tmdbId);
  if (!details) return null;

  // Se il film in catalogo c'è già, i suoi dati vincono: sono quelli corretti a
  // mano, e mostrarne di diversi farebbe sembrare il film un doppione.
  const existing = await prisma.catalogFilm.findFirst({ where: { tmdbId }, orderBy: { id: 'asc' } });
  const scheduledCount = await prisma.pretixSync.count({ where: { tmdbId } });

  const year = details.release_date ? parseInt(details.release_date.slice(0, 4), 10) : null;
  const runtime = existing?.runtime ?? details.runtime ?? null;

  return {
    id: existing?.id ?? 0,
    title: existing?.title || details.title || details.original_title || `TMDB ${tmdbId}`,
    year: existing?.year ?? (Number.isFinite(year as number) ? year : null),
    durationMin: existing?.durationMin ?? details.runtime ?? null,
    runtime,
    director: existing?.director ?? getDirectors(details)[0] ?? null,
    tmdbId,
    posterPath: existing?.posterPath ?? details.poster_path ?? null,
    genres: existing?.genres?.length ? existing.genres : (details.genres ?? []).map((g) => g.name),
    voteAverage: existing?.voteAverage ?? details.vote_average ?? null,
    awardLabels: existing?.awardLabels ?? [],
    inPlex: existing?.inPlex ?? false,
    // Un film arrivato da un id TMDB esplicito è confermato per definizione:
    // l'abbinamento non è stato indovinato, l'hai indicato tu.
    verifyStatus: existing?.verifyStatus ?? 'fixed',
    scheduledCount,
    /** Falso = sta solo in questa sessione, il catalogo non lo conosce. */
    inCatalog: Boolean(existing),
  };
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

/**
 * Riempie voto, trama e sfondo sui film già abbinati a TMDB.
 * Serve al catalogo storico, che è tutto `ok` e quindi invisibile a
 * `catalogEnrich`. Ripetibile finché `remaining` è 0.
 */
export async function catalogBackfill(limit = 40) {
  return backfillFilmMetadata(limit);
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
