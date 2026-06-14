import fs from 'fs';
import path from 'path';
import prisma from '@/lib/prisma';
import { searchMovies, getMovieDetails, getDirectors } from '@/services/tmdb';
import { parseCatalogCsv } from '@/services/catalogCsv';
import { normalizeText, pickBestMatch, type MatchCandidate } from '@/services/catalogMatch';

const CSV_PATH = path.join(process.cwd(), 'scratch', 'catalogo.csv');

function sourceKeyFor(title: string, year: number | null): string {
  return `${normalizeText(title)}|${year ?? ''}`;
}

/**
 * FASE 1 — Legge il CSV e fa upsert dei film (senza TMDB).
 * Veloce. I film nuovi nascono con verifyStatus = "pending".
 * Le righe già "fixed" o già arricchite mantengono il loro stato (non resettate).
 */
export async function seedCatalogFromCsv(): Promise<{ total: number; created: number }> {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`File non trovato: ${CSV_PATH}. Metti il catalogo in scratch/catalogo.csv`);
  }
  const text = fs.readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCatalogCsv(text);

  let created = 0;
  for (const r of rows) {
    const sourceKey = sourceKeyFor(r.title, r.year);
    const existing = await prisma.catalogFilm.findUnique({ where: { sourceKey } });
    if (!existing) created++;
    await prisma.catalogFilm.upsert({
      where: { sourceKey },
      update: { title: r.title, year: r.year, durationMin: r.durationMin, director: r.director },
      create: {
        sourceKey,
        title: r.title,
        year: r.year,
        durationMin: r.durationMin,
        director: r.director,
        verifyStatus: 'pending',
      },
    });
  }
  return { total: rows.length, created };
}

async function chunk<T>(arr: T[], size: number): Promise<T[][]> {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * FASE 2 — Arricchisce via TMDB un blocco di film "pending".
 * Resiliente e ripetibile: chiamala più volte finché remaining === 0.
 */
export async function enrichPendingFilms(
  limit = 40,
): Promise<{ processed: number; remaining: number; ok: number; suspect: number; missing: number }> {
  const pending = await prisma.catalogFilm.findMany({
    where: { verifyStatus: 'pending' },
    orderBy: { id: 'asc' },
    take: limit,
  });

  let ok = 0, suspect = 0, missing = 0;
  const batches = await chunk(pending, 6); // concorrenza limitata verso TMDB

  for (const batch of batches) {
    await Promise.all(
      batch.map(async (film) => {
        try {
          const result = await enrichOne(film);
          if (result === 'ok') ok++;
          else if (result === 'suspect') suspect++;
          else missing++;
        } catch (err) {
          console.error(`[catalogImport] enrich fallito per id=${film.id} "${film.title}"`, err);
        }
      }),
    );
  }

  const remaining = await prisma.catalogFilm.count({ where: { verifyStatus: 'pending' } });
  return { processed: ok + suspect + missing, remaining, ok, suspect, missing };
}

async function enrichOne(film: {
  id: number; title: string; year: number | null; director: string | null;
}): Promise<'ok' | 'suspect' | 'missing'> {
  const candidates = await searchMovies(film.title, false, 'it-IT');

  const byYear = candidates.filter((c) =>
    film.year == null || Math.abs((parseInt(String(c.release_date).slice(0, 4), 10) || 0) - film.year) <= 1,
  );
  const pool = (byYear.length ? byYear : candidates).slice(0, 4);

  const detailed = await Promise.all(
    pool.map(async (c) => ({ raw: c, details: await getMovieDetails(String(c.id)) })),
  );

  const forMatch: MatchCandidate[] = detailed.map((d) => ({
    id: String(d.raw.id),
    title: d.raw.title,
    releaseDate: d.raw.release_date,
    directors: d.details ? getDirectors(d.details) : [],
  }));

  const match = pickBestMatch(
    { title: film.title, year: film.year, director: film.director },
    forMatch,
  );

  if (!match) {
    await prisma.catalogFilm.update({
      where: { id: film.id },
      data: { verifyStatus: 'missing', enrichedAt: new Date() },
    });
    return 'missing';
  }

  const chosen = detailed.find((d) => String(d.raw.id) === match.tmdbId)!;
  const det = chosen.details;
  const tmdbYear = det?.release_date ? parseInt(det.release_date.slice(0, 4), 10) : null;

  await prisma.catalogFilm.update({
    where: { id: film.id },
    data: {
      tmdbId: match.tmdbId,
      tmdbTitle: det?.title ?? chosen.raw.title,
      tmdbYear: Number.isFinite(tmdbYear as number) ? tmdbYear : null,
      posterPath: det?.poster_path ?? chosen.raw.poster_path ?? null,
      genres: (det?.genres ?? []).map((g) => g.name),
      runtime: det?.runtime ?? null,
      verifyStatus: match.status,
      enrichedAt: new Date(),
    },
  });
  return match.status;
}
