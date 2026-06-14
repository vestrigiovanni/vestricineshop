# Catalogo Film per la Programmazione — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere all'admin un pannello "Programma dal catalogo" che pesca da un catalogo chiuso di 913 film (CSV `Title, Year, Duration (min), Director`), li abbina a TMDB, e ne consente la programmazione con anteprima live e correzione degli id sbagliati.

**Architecture:** Una nuova tabella `CatalogFilm` viene popolata da un import in due fasi (seed dal CSV → arricchimento TMDB resiliente e ripetibile). Server actions in `catalogActions.ts` espongono lista/filtri/statistiche/random/correzione. Un overlay desktop `CatalogBrowser` (dentro l'admin) consuma quelle actions e, alla selezione, riusa il flusso di scheduling esistente di `AdminPanel` (`selectMovieForScheduling`).

**Tech Stack:** Next.js 16, React 19, Prisma 7 (Postgres/Neon, `prisma db push`), servizio TMDB esistente (`src/services/tmdb.ts`), CSS Modules, Vitest (solo per la logica pura).

**Spec di riferimento:** `docs/superpowers/specs/2026-06-14-catalogo-programmazione-film-design.md`

---

## File Structure

**Nuovi file**
- `src/services/catalogMatch.ts` — logica pura di matching/normalizzazione (testabile, nessuna dipendenza da rete/DB).
- `src/services/catalogMatch.test.ts` — unit test Vitest del matcher.
- `src/services/catalogCsv.ts` — parser CSV puro (auto-rileva delimitatore, gestisce virgolette/BOM).
- `src/services/catalogCsv.test.ts` — unit test Vitest del parser.
- `src/services/catalogImport.ts` — orchestrazione import: `seedCatalogFromCsv` + `enrichPendingFilms` (usa Prisma + TMDB).
- `src/actions/catalogActions.ts` — server actions del catalogo.
- `src/components/Admin/CatalogBrowser/CatalogBrowser.tsx` — overlay (griglia + filtri + scroll).
- `src/components/Admin/CatalogBrowser/CatalogPreview.tsx` — pannello anteprima + correzione id.
- `src/components/Admin/CatalogBrowser/CatalogBrowser.module.css` — stili overlay (desktop).
- `vitest.config.ts` — config minima Vitest.

**File modificati**
- `prisma/schema.prisma` — nuovo model `CatalogFilm`.
- `src/components/Admin/AdminPanel.tsx` — pulsante "📚 Programma dal catalogo" + handler `handleSelectFromCatalog` + render overlay.
- `package.json` — devDep `vitest` + script `test`.

**Dato richiesto a runtime (non in git):** `scratch/catalogo.csv` con header `Title, Year, Duration (min), Director`.

---

## Task 1: Modello `CatalogFilm` + sync DB

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Aggiungere il model in `prisma/schema.prisma`**

In coda al file, dopo gli altri model:

```prisma
model CatalogFilm {
  id           Int       @id @default(autoincrement())
  sourceKey    String    @unique // chiave naturale normalizzata "titolo|anno" per upsert ripetibile

  // --- Dal CSV ---
  title        String
  year         Int?
  durationMin  Int?
  director     String?

  // --- Abbinati da TMDB (snapshot all'import) ---
  tmdbId       String?
  tmdbTitle    String?
  tmdbYear     Int?
  posterPath   String?
  genres       String[]  @default([])
  runtime      Int?

  // --- Qualità / verifica ---
  verifyStatus String    @default("pending") // pending | ok | suspect | missing | fixed
  enrichedAt   DateTime?

  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  @@index([tmdbId])
  @@index([verifyStatus])
}
```

- [ ] **Step 2: Sincronizzare lo schema con il DB**

Run: `npx prisma db push`
Expected: output che conferma `The database is now in sync with your Prisma schema.` e la creazione della tabella `CatalogFilm`.

- [ ] **Step 3: Rigenerare il client**

Run: `npx prisma generate`
Expected: `Generated Prisma Client` senza errori. Il tipo `prisma.catalogFilm` è ora disponibile.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(catalog): add CatalogFilm model"
```

---

## Task 2: Setup Vitest + logica di matching (TDD)

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/services/catalogMatch.ts`
- Test: `src/services/catalogMatch.test.ts`

- [ ] **Step 1: Installare Vitest e aggiungere lo script**

Run: `npm install -D vitest`

Poi in `package.json`, dentro `"scripts"`, aggiungere:

```json
"test": "vitest run"
```

- [ ] **Step 2: Creare `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 3: Scrivere i test (falliscono perché il modulo non esiste)** in `src/services/catalogMatch.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { normalizeText, yearMatches, directorMatches, pickBestMatch } from './catalogMatch';

describe('normalizeText', () => {
  it('rimuove accenti, punteggiatura e uniforma spazi/maiuscole', () => {
    expect(normalizeText('  Cuatro  Lunas! ')).toBe('cuatro lunas');
    expect(normalizeText('Amélie')).toBe('amelie');
    expect(normalizeText(null)).toBe('');
  });
});

describe('yearMatches', () => {
  it('accetta entro la tolleranza di ±1', () => {
    expect(yearMatches(2014, '2014-09-01')).toBe(true);
    expect(yearMatches(2014, '2015-01-01')).toBe(true);
    expect(yearMatches(2014, '2016-01-01')).toBe(false);
  });
  it('se manca l anno CSV non penalizza', () => {
    expect(yearMatches(null, '1999-01-01')).toBe(true);
  });
});

describe('directorMatches', () => {
  it('confronta normalizzando e con fallback sul cognome', () => {
    expect(directorMatches('Paolo Sorrentino', ['Paolo Sorrentino'])).toBe(true);
    expect(directorMatches('P. Sorrentino', ['Paolo Sorrentino'])).toBe(true);
    expect(directorMatches('Steven Spielberg', ['Christopher Nolan'])).toBe(false);
    expect(directorMatches(null, ['Qualcuno'])).toBe(false);
  });
});

describe('pickBestMatch', () => {
  const row = { title: '4 Moons', year: 2014, director: 'Sergio Tovar Velarde' };

  it('anno + regista => ok', () => {
    const res = pickBestMatch(row, [
      { id: '111', title: 'Other', releaseDate: '2001-01-01', directors: ['X'] },
      { id: '258034', title: '4 Lune', releaseDate: '2014-09-01', directors: ['Sergio Tovar Velarde'] },
    ]);
    expect(res).toEqual({ tmdbId: '258034', status: 'ok' });
  });

  it('anno giusto ma regista diverso => suspect', () => {
    const res = pickBestMatch(row, [
      { id: '999', title: '4 Moons', releaseDate: '2014-05-01', directors: ['Mario Rossi'] },
    ]);
    expect(res).toEqual({ tmdbId: '999', status: 'suspect' });
  });

  it('nessun candidato utile => null', () => {
    expect(pickBestMatch(row, [])).toBeNull();
  });
});
```

- [ ] **Step 4: Eseguire i test e verificare che falliscano**

Run: `npm run test`
Expected: FAIL — `Failed to resolve import "./catalogMatch"` (il modulo non esiste ancora).

- [ ] **Step 5: Implementare `src/services/catalogMatch.ts`**

```ts
// Logica pura di abbinamento CSV ⇄ TMDB. Nessuna dipendenza da rete/DB: testabile in isolamento.

export function normalizeText(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // rimuove accenti
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function yearOf(releaseDate: string | null | undefined): number | null {
  if (!releaseDate) return null;
  const y = parseInt(String(releaseDate).slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

export function yearMatches(
  csvYear: number | null | undefined,
  releaseDate: string | null | undefined,
  tolerance = 1,
): boolean {
  if (csvYear == null) return true; // niente anno da confrontare → non penalizzare
  const y = yearOf(releaseDate);
  if (y == null) return false;
  return Math.abs(y - csvYear) <= tolerance;
}

export function directorMatches(
  csvDirector: string | null | undefined,
  tmdbDirectors: string[],
): boolean {
  const a = normalizeText(csvDirector);
  if (!a) return false;
  return tmdbDirectors.some((d) => {
    const b = normalizeText(d);
    if (!b) return false;
    if (a === b) return true;
    const la = a.split(' ').pop() || '';
    const lb = b.split(' ').pop() || '';
    return la.length > 2 && la === lb; // fallback sul cognome
  });
}

export interface MatchCandidate {
  id: string;
  title: string;
  releaseDate?: string | null;
  directors: string[];
}

export interface CsvRowForMatch {
  title: string;
  year: number | null;
  director: string | null;
}

export function pickBestMatch(
  row: CsvRowForMatch,
  candidates: MatchCandidate[],
): { tmdbId: string; status: 'ok' | 'suspect' } | null {
  if (!candidates.length) return null;
  const titleNorm = normalizeText(row.title);

  const strong = candidates.find(
    (c) => yearMatches(row.year, c.releaseDate) && directorMatches(row.director, c.directors),
  );
  if (strong) return { tmdbId: strong.id, status: 'ok' };

  const yearTitle = candidates.find(
    (c) => yearMatches(row.year, c.releaseDate) && normalizeText(c.title) === titleNorm,
  );
  if (yearTitle) return { tmdbId: yearTitle.id, status: 'suspect' };

  const anyYear = candidates.find((c) => yearMatches(row.year, c.releaseDate));
  if (anyYear) return { tmdbId: anyYear.id, status: 'suspect' };

  const exactTitle = candidates.find((c) => normalizeText(c.title) === titleNorm);
  if (exactTitle) return { tmdbId: exactTitle.id, status: 'suspect' };

  return null;
}
```

- [ ] **Step 6: Eseguire i test e verificare che passino**

Run: `npm run test`
Expected: PASS (tutti i test di `catalogMatch.test.ts` verdi).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/services/catalogMatch.ts src/services/catalogMatch.test.ts
git commit -m "feat(catalog): add TMDB matching logic with tests"
```

---

## Task 3: Parser CSV (TDD)

**Files:**
- Create: `src/services/catalogCsv.ts`
- Test: `src/services/catalogCsv.test.ts`

- [ ] **Step 1: Scrivere i test** in `src/services/catalogCsv.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { parseCatalogCsv } from './catalogCsv';

describe('parseCatalogCsv', () => {
  it('parsa header e righe con delimitatore virgola', () => {
    const csv =
      'Title,Year,Duration (min),Director\n' +
      'Cuatro Lunas,2014,107,Sergio Tovar Velarde\n' +
      '"Good, Bad",1999,120,Sergio Leone\n';
    const rows = parseCatalogCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ title: 'Cuatro Lunas', year: 2014, durationMin: 107, director: 'Sergio Tovar Velarde' });
    expect(rows[1].title).toBe('Good, Bad'); // virgola dentro le virgolette preservata
  });

  it('rileva il delimitatore punto e virgola e ignora il BOM', () => {
    const csv = '﻿Title;Year;Duration (min);Director\nFilm X;2001;90;Tizio\n';
    const rows = parseCatalogCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ title: 'Film X', year: 2001, durationMin: 90, director: 'Tizio' });
  });

  it('salta righe vuote e gestisce campi mancanti', () => {
    const csv = 'Title,Year,Duration (min),Director\nSolo Titolo,,,\n\n';
    const rows = parseCatalogCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ title: 'Solo Titolo', year: null, durationMin: null, director: null });
  });
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `npm run test`
Expected: FAIL — `Failed to resolve import "./catalogCsv"`.

- [ ] **Step 3: Implementare `src/services/catalogCsv.ts`**

```ts
// Parser CSV puro per il catalogo film. Auto-rileva il delimitatore, gestisce
// virgolette (RFC4180-ish), BOM e header con nomi flessibili.

export interface CatalogCsvRow {
  title: string;
  year: number | null;
  durationMin: number | null;
  director: string | null;
}

function detectDelimiter(text: string): string {
  const firstLine = text.replace(/^﻿/, '').split(/\r?\n/)[0] || '';
  const counts: Record<string, number> = {
    ',': (firstLine.match(/,/g) || []).length,
    ';': (firstLine.match(/;/g) || []).length,
    '\t': (firstLine.match(/\t/g) || []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function tokenize(text: string, delim: string): string[][] {
  const s = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function parseIntOrNull(v: string | undefined): number | null {
  if (!v) return null;
  const m = v.match(/-?\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) ? n : null;
}

export function parseCatalogCsv(text: string): CatalogCsvRow[] {
  if (!text || !text.trim()) return [];
  const delim = detectDelimiter(text);
  const records = tokenize(text, delim);
  if (!records.length) return [];

  const header = records[0].map((h) => h.replace(/^﻿/, '').trim().toLowerCase());
  const idx = {
    title: header.findIndex((h) => h.includes('title') || h.includes('titolo')),
    year: header.findIndex((h) => h.includes('year') || h.includes('anno')),
    duration: header.findIndex((h) => h.includes('dur')),
    director: header.findIndex((h) => h.includes('director') || h.includes('regist')),
  };

  const rows: CatalogCsvRow[] = [];
  for (let i = 1; i < records.length; i++) {
    const r = records[i];
    if (!r.length || r.every((c) => c.trim() === '')) continue;
    const title = ((idx.title >= 0 ? r[idx.title] : r[0]) || '').trim();
    if (!title) continue;
    rows.push({
      title,
      year: parseIntOrNull(idx.year >= 0 ? r[idx.year] : undefined),
      durationMin: parseIntOrNull(idx.duration >= 0 ? r[idx.duration] : undefined),
      director: ((idx.director >= 0 ? r[idx.director] : '') || '').trim() || null,
    });
  }
  return rows;
}
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/catalogCsv.ts src/services/catalogCsv.test.ts
git commit -m "feat(catalog): add robust CSV parser with tests"
```

---

## Task 4: Import service (seed + enrich resiliente)

**Files:**
- Create: `src/services/catalogImport.ts`

- [ ] **Step 1: Implementare `src/services/catalogImport.ts`**

```ts
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
      // su update aggiorniamo SOLO i campi del CSV; stato/abbinamento restano intatti
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
          // fallimento tecnico: lasciamo "pending" per riprovare alla run successiva
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
  const candidates = await searchMovies(film.title, false, 'it-IT'); // MovieItem[] grezzi

  // shortlist per anno (riduce le chiamate ai dettagli); se vuota usa i primi risultati
  const byYear = candidates.filter((c) =>
    film.year == null || Math.abs((parseInt(String(c.release_date).slice(0, 4), 10) || 0) - film.year) <= 1,
  );
  const pool = (byYear.length ? byYear : candidates).slice(0, 4);

  // dettagli (per regista + generi + poster autorevole)
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
```

- [ ] **Step 2: Verifica di tipo**

Run: `npx tsc --noEmit`
Expected: nessun errore relativo a `src/services/catalogImport.ts` (i tipi `MovieItem`/`MovieDetails` da `tmdb` risolvono; `prisma.catalogFilm` esiste dopo Task 1).

- [ ] **Step 3: Commit**

```bash
git add src/services/catalogImport.ts
git commit -m "feat(catalog): add resilient CSV seed + TMDB enrichment service"
```

---

## Task 5: Server actions del catalogo

**Files:**
- Create: `src/actions/catalogActions.ts`

> Nota: come le altre `adminActions`, queste actions sono `'use server'` e sono protette dal fatto che l'unico consumatore è la pagina admin (stessa protezione di accesso esistente). Non aggiungiamo un gate diverso da quello già in uso.

- [ ] **Step 1: Implementare `src/actions/catalogActions.ts`**

```ts
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
```

- [ ] **Step 2: Verifica di tipo**

Run: `npx tsc --noEmit`
Expected: nessun errore in `catalogActions.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/actions/catalogActions.ts
git commit -m "feat(catalog): add catalog server actions (list, facets, stats, random, fix, import)"
```

---

## Task 6: Componente `CatalogBrowser` (overlay, griglia, filtri)

**Files:**
- Create: `src/components/Admin/CatalogBrowser/CatalogBrowser.tsx`
- Create: `src/components/Admin/CatalogBrowser/CatalogBrowser.module.css`

- [ ] **Step 1: Creare `CatalogBrowser.module.css`**

```css
.overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(10, 10, 14, 0.92);
  backdrop-filter: blur(6px);
  display: flex;
  flex-direction: column;
  color: #f3f3f5;
}
.header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.header h2 { font-size: 1.1rem; margin: 0; }
.stats { font-size: 0.8rem; opacity: 0.7; }
.closeBtn { margin-left: auto; background: none; border: none; color: inherit; cursor: pointer; }
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  padding: 0.8rem 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  align-items: center;
}
.toolbar input[type="text"],
.toolbar select {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #fff;
  border-radius: 8px;
  padding: 0.45rem 0.6rem;
  font-size: 0.85rem;
}
.toolbar input[type="text"] { min-width: 220px; }
.toggle { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; cursor: pointer; }
.surprise {
  margin-left: auto;
  background: linear-gradient(135deg, #7c3aed, #db2777);
  border: none; color: #fff; border-radius: 8px;
  padding: 0.5rem 0.9rem; font-weight: 600; cursor: pointer;
}
.grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 1rem;
  padding: 1.2rem 1.5rem;
  align-content: start;
}
.card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.12s ease, border-color 0.12s ease;
  position: relative;
}
.card:hover { transform: translateY(-3px); border-color: rgba(255, 255, 255, 0.3); }
.poster { width: 100%; aspect-ratio: 2 / 3; object-fit: cover; display: block; background: #1a1a22; }
.noPoster {
  width: 100%; aspect-ratio: 2 / 3; display: flex; align-items: center; justify-content: center;
  font-size: 0.75rem; opacity: 0.5; text-align: center; padding: 0.5rem;
}
.cardBody { padding: 0.5rem 0.6rem; }
.cardTitle { font-size: 0.82rem; font-weight: 600; line-height: 1.2; }
.cardMeta { font-size: 0.72rem; opacity: 0.6; }
.badges { position: absolute; top: 6px; left: 6px; display: flex; flex-direction: column; gap: 4px; }
.badge { font-size: 0.65rem; padding: 2px 6px; border-radius: 6px; font-weight: 700; }
.badgeWarn { background: #b45309; color: #fff; }
.badgeScheduled { background: #15803d; color: #fff; }
.loadMore {
  grid-column: 1 / -1; display: flex; justify-content: center; padding: 1rem;
}
.loadMore button {
  background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff; border-radius: 8px; padding: 0.5rem 1.2rem; cursor: pointer;
}
.empty { grid-column: 1 / -1; text-align: center; opacity: 0.6; padding: 3rem; }
```

- [ ] **Step 2: Creare `CatalogBrowser.tsx`**

```tsx
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import styles from './CatalogBrowser.module.css';
import { catalogList, catalogGetFacets, catalogStats, catalogRandom, type CatalogListParams } from '@/actions/catalogActions';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import CatalogPreview from './CatalogPreview';

export type CatalogFilmRow = {
  id: number;
  title: string;
  year: number | null;
  durationMin: number | null;
  director: string | null;
  tmdbId: string | null;
  tmdbTitle: string | null;
  posterPath: string | null;
  genres: string[];
  verifyStatus: string;
  scheduledCount: number;
};

interface Props {
  onSelectFilm: (tmdbId: string) => void;
  onClose: () => void;
}

export default function CatalogBrowser({ onSelectFilm, onClose }: Props) {
  const [films, setFilms] = useState<CatalogFilmRow[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [facets, setFacets] = useState<{ genres: string[]; directors: string[]; decades: number[] }>({ genres: [], directors: [], decades: [] });
  const [stats, setStats] = useState<{ total: number; ok: number; suspect: number; missing: number } | null>(null);
  const [preview, setPreview] = useState<CatalogFilmRow | null>(null);

  const [filters, setFilters] = useState<CatalogListParams>({ sort: 'listOrder' });

  const load = useCallback(async (reset: boolean) => {
    setLoading(true);
    try {
      const nextPage = reset ? 1 : page + 1;
      const res = await catalogList({ ...filters, page: nextPage, pageSize: 60 });
      setFilms((prev) => (reset ? res.films : [...prev, ...res.films]) as CatalogFilmRow[]);
      setPage(nextPage);
      setHasMore(res.hasMore);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  // ricarica da capo quando cambiano i filtri
  useEffect(() => { load(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filters]);

  useEffect(() => {
    catalogGetFacets().then(setFacets);
    catalogStats().then(setStats);
  }, []);

  const setFilter = (patch: Partial<CatalogListParams>) => setFilters((f) => ({ ...f, ...patch }));

  const handleSurprise = async () => {
    const film = await catalogRandom(filters);
    if (film) setPreview(film as CatalogFilmRow);
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.header}>
        <h2>📚 Programma dal catalogo</h2>
        {stats && (
          <span className={styles.stats}>
            {stats.total} film · {stats.ok} ok · {stats.suspect} da verificare · {stats.missing} non trovati
          </span>
        )}
        <button className={styles.closeBtn} onClick={onClose} aria-label="Chiudi"><X size={22} /></button>
      </div>

      <div className={styles.toolbar}>
        <input
          type="text"
          placeholder="Cerca titolo o regista…"
          onChange={(e) => setFilter({ search: e.target.value || undefined })}
        />
        <select onChange={(e) => setFilter({ genre: e.target.value || undefined })} defaultValue="">
          <option value="">Tutti i generi</option>
          {facets.genres.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select onChange={(e) => setFilter({ decade: e.target.value ? parseInt(e.target.value) : undefined })} defaultValue="">
          <option value="">Tutti i decenni</option>
          {facets.decades.map((d) => <option key={d} value={d}>{d}s</option>)}
        </select>
        <select onChange={(e) => setFilter({ director: e.target.value || undefined })} defaultValue="">
          <option value="">Tutti i registi</option>
          {facets.directors.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select onChange={(e) => setFilter({ sort: e.target.value as CatalogListParams['sort'] })} defaultValue="listOrder">
          <option value="listOrder">Ordine classifica</option>
          <option value="titleAsc">Titolo A→Z</option>
          <option value="yearDesc">Anno ↓</option>
        </select>
        <label className={styles.toggle}>
          <input type="checkbox" onChange={(e) => setFilter({ hideScheduled: e.target.checked || undefined })} />
          Nascondi già programmati
        </label>
        <label className={styles.toggle}>
          <input type="checkbox" onChange={(e) => setFilter({ onlyUnverified: e.target.checked || undefined })} />
          Solo da verificare
        </label>
        <button className={styles.surprise} onClick={handleSurprise}>🎲 Sorprendimi</button>
      </div>

      <div className={styles.grid}>
        {films.map((f) => {
          const poster = getTMDBImageUrl(f.posterPath, 'w342');
          const suspect = f.verifyStatus === 'suspect' || f.verifyStatus === 'missing';
          return (
            <div key={f.id} className={styles.card} onClick={() => setPreview(f)}>
              <div className={styles.badges}>
                {suspect && <span className={`${styles.badge} ${styles.badgeWarn}`}>⚠️ verifica</span>}
                {f.scheduledCount > 0 && <span className={`${styles.badge} ${styles.badgeScheduled}`}>✅ ×{f.scheduledCount}</span>}
              </div>
              {poster
                ? <img className={styles.poster} src={poster} alt={f.title} loading="lazy" />
                : <div className={styles.noPoster}>{f.title}</div>}
              <div className={styles.cardBody}>
                <div className={styles.cardTitle}>{f.title}</div>
                <div className={styles.cardMeta}>{f.year ?? '—'}{f.director ? ` · ${f.director}` : ''}</div>
              </div>
            </div>
          );
        })}

        {!loading && films.length === 0 && <div className={styles.empty}>Nessun film con questi filtri.</div>}

        {hasMore && (
          <div className={styles.loadMore}>
            <button onClick={() => load(false)} disabled={loading}>
              {loading ? 'Carico…' : 'Carica altri'}
            </button>
          </div>
        )}
      </div>

      {preview && (
        <CatalogPreview
          film={preview}
          onClose={() => setPreview(null)}
          onSchedule={(tmdbId) => { onSelectFilm(tmdbId); onClose(); }}
          onFixed={() => { setPreview(null); load(true); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verifica di tipo**

Run: `npx tsc --noEmit`
Expected: errore atteso SOLO su `./CatalogPreview` (creato in Task 7). Nessun altro errore in `CatalogBrowser.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/Admin/CatalogBrowser/CatalogBrowser.tsx src/components/Admin/CatalogBrowser/CatalogBrowser.module.css
git commit -m "feat(catalog): add CatalogBrowser overlay (grid, filters, surprise)"
```

---

## Task 7: Componente `CatalogPreview` (anteprima live + correggi id)

**Files:**
- Create: `src/components/Admin/CatalogBrowser/CatalogPreview.tsx`

> Riusa `adminGetMovieById` (già esistente) per l'anteprima live da TMDB e `catalogSearchTmdb` + `catalogFixTmdbId` per la correzione.

- [ ] **Step 1: Creare `CatalogPreview.tsx`**

```tsx
'use client';

import React, { useEffect, useState } from 'react';
import { X, Wand2, Calendar } from 'lucide-react';
import styles from './CatalogBrowser.module.css';
import { adminGetMovieById } from '@/actions/adminActions';
import { catalogSearchTmdb, catalogFixTmdbId } from '@/actions/catalogActions';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import type { CatalogFilmRow } from './CatalogBrowser';

interface Props {
  film: CatalogFilmRow;
  onClose: () => void;
  onSchedule: (tmdbId: string) => void;
  onFixed: () => void;
}

export default function CatalogPreview({ film, onClose, onSchedule, onFixed }: Props) {
  const [details, setDetails] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [fixMode, setFixMode] = useState(false);
  const [fixQuery, setFixQuery] = useState('');
  const [fixResults, setFixResults] = useState<any[]>([]);
  const [fixing, setFixing] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    if (!film.tmdbId) { setLoading(false); setFixMode(true); setFixQuery(film.title); return; }
    adminGetMovieById(film.tmdbId)
      .then((d) => { if (alive) setDetails(d); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [film.tmdbId, film.title]);

  const runFixSearch = async () => {
    const res = await catalogSearchTmdb(fixQuery || film.title);
    setFixResults(res);
  };

  const applyFix = async (newTmdbId: string) => {
    setFixing(true);
    try {
      await catalogFixTmdbId(film.id, newTmdbId);
      onFixed();
    } finally {
      setFixing(false);
    }
  };

  return (
    <div className={styles.overlay} style={{ zIndex: 1100, background: 'rgba(0,0,0,0.85)' }}>
      <div className={styles.header}>
        <h2>{film.title} {film.year ? `(${film.year})` : ''}</h2>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Chiudi"><X size={22} /></button>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', padding: '1.5rem', overflow: 'auto' }}>
        <div style={{ flex: '0 0 280px' }}>
          {(() => {
            const poster = getTMDBImageUrl(details?.poster_path ?? film.posterPath, 'w500');
            return poster
              ? <img src={poster} alt={film.title} style={{ width: '100%', borderRadius: 12 }} />
              : <div className={styles.noPoster} style={{ borderRadius: 12 }}>Nessun poster</div>;
          })()}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {loading && <p>Carico anteprima da TMDB…</p>}

          {!loading && details && (
            <>
              <p style={{ opacity: 0.75 }}>
                <strong>{details.title}</strong>{details.release_date ? ` · ${details.release_date.slice(0, 4)}` : ''}
                {details.runtime ? ` · ${details.runtime}m` : ''}
              </p>
              {details.director && <p><strong>Regia:</strong> {Array.isArray(details.director) ? details.director.join(', ') : details.director}</p>}
              {details.cast && <p style={{ opacity: 0.8 }}><strong>Cast:</strong> {(Array.isArray(details.cast) ? details.cast : []).slice(0, 5).join(', ')}</p>}
              <p style={{ lineHeight: 1.5, opacity: 0.9 }}>{details.overview || 'Trama non disponibile.'}</p>
            </>
          )}

          <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            {film.tmdbId && (
              <button className={styles.surprise} style={{ margin: 0 }} onClick={() => onSchedule(film.tmdbId!)}>
                <Calendar size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} /> Programma
              </button>
            )}
            <button
              className={styles.loadMore as any}
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: 8, padding: '0.5rem 1rem', cursor: 'pointer' }}
              onClick={() => { setFixMode((v) => !v); setFixQuery(film.title); }}
            >
              <Wand2 size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} /> ID sbagliato? Correggi
            </button>
          </div>

          {fixMode && (
            <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={fixQuery}
                  onChange={(e) => setFixQuery(e.target.value)}
                  placeholder="Cerca su TMDB il film giusto…"
                  style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 8, padding: '0.45rem 0.6rem' }}
                />
                <button onClick={runFixSearch} className={styles.surprise} style={{ margin: 0 }}>Cerca</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginTop: '0.8rem' }}>
                {fixResults.map((m) => {
                  const p = getTMDBImageUrl(m.poster_path, 'w185');
                  return (
                    <button
                      key={m.id}
                      disabled={fixing}
                      onClick={() => applyFix(String(m.id))}
                      style={{ width: 110, background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', cursor: 'pointer', padding: 0, overflow: 'hidden' }}
                      title={`${m.title} (${m.release_date?.slice(0, 4) || 'N/D'})`}
                    >
                      {p ? <img src={p} alt={m.title} style={{ width: '100%', display: 'block' }} /> : <div style={{ height: 150 }} />}
                      <div style={{ fontSize: '0.7rem', padding: '4px' }}>{m.title} ({m.release_date?.slice(0, 4) || 'N/D'})</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verifica di tipo**

Run: `npx tsc --noEmit`
Expected: nessun errore in `CatalogPreview.tsx` né in `CatalogBrowser.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/Admin/CatalogBrowser/CatalogPreview.tsx
git commit -m "feat(catalog): add CatalogPreview with live TMDB preview and id fix"
```

---

## Task 8: Integrazione in `AdminPanel`

**Files:**
- Modify: `src/components/Admin/AdminPanel.tsx`

- [ ] **Step 1: Import del componente e dell'icona**

In cima al file, vicino agli altri import di componenti (dopo `import RoomManagementModal from './RoomManagementModal';`):

```tsx
import dynamic from 'next/dynamic';
const CatalogBrowser = dynamic(() => import('./CatalogBrowser/CatalogBrowser'), { ssr: false });
```

> Nota: `dynamic` è già importato più in alto nel file (riga ~34 per `TicketRecoveryButton`). Se è già importato, NON ri-importarlo: aggiungi solo la riga `const CatalogBrowser = ...`.

E aggiungi `BookOpen` alla lista di icone importate da `lucide-react` (alla riga dell'import esistente da `lucide-react`).

- [ ] **Step 2: Stato per l'overlay + handler di selezione**

Subito dopo `const [showModal, setShowModal] = useState(false);` (riga ~104):

```tsx
  const [showCatalog, setShowCatalog] = useState(false);

  const handleSelectFromCatalog = async (tmdbId: string) => {
    setShowCatalog(false);
    const movie = await adminGetMovieById(tmdbId);
    if (movie) {
      await selectMovieForScheduling(movie as any);
    }
  };
```

> `selectMovieForScheduling` e `adminGetMovieById` esistono già nel file e impostano il form + aprono il modal di scheduling esistente.

- [ ] **Step 3: Pulsante nella sezione "Cerca Film (TMDB)"**

Nel JSX della sezione header (intorno alla riga 845-851), accanto al link "Gestisci Overrides", aggiungi il pulsante:

```tsx
            <button
              type="button"
              className={styles.btnActionIcon}
              title="Programma dal catalogo"
              onClick={() => setShowCatalog(true)}
            >
              <BookOpen size={18} />
            </button>
```

- [ ] **Step 4: Render dell'overlay**

In fondo al JSX del componente, subito prima della chiusura del `<div className={styles.dashboard}>` finale, aggiungi:

```tsx
      {showCatalog && (
        <CatalogBrowser
          onSelectFilm={handleSelectFromCatalog}
          onClose={() => setShowCatalog(false)}
        />
      )}
```

- [ ] **Step 5: Verifica di tipo**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 6: Verifica build/lint rapida**

Run: `npm run lint`
Expected: nessun errore bloccante introdotto dai file nuovi.

- [ ] **Step 7: Commit**

```bash
git add src/components/Admin/AdminPanel.tsx
git commit -m "feat(catalog): wire CatalogBrowser button into AdminPanel"
```

---

## Task 9: Import reale dei 913 film + verifica nel browser

> Questo task carica i dati veri. Richiede `scratch/catalogo.csv` presente.

- [ ] **Step 1: Confermare il file**

Run: `head -3 scratch/catalogo.csv`
Expected: riga header `Title,Year,Duration (min),Director` (o simile) + 2 righe di film.

- [ ] **Step 2: Avviare il dev server**

Usa lo strumento di preview (preview_start) per avviare `next dev`. Non usare un terminale separato.

- [ ] **Step 3: Eseguire il SEED dal catalogo**

Apri la pagina admin, apri l'overlay catalogo: alla prima apertura sarà vuoto. Per popolare, esegui il seed. Modo pragmatico per innescare seed+enrich: aggiungi temporaneamente (solo per questa sessione) due bottoni "Seed" ed "Enrich" nell'header dell'overlay che chiamano `catalogSeed()` e in loop `catalogEnrich(40)` finché `remaining === 0`, mostrando il progresso. In alternativa esegui le due server actions da una route admin di servizio.

Sequenza attesa:
1. `catalogSeed()` → `{ total: ~913, created: ~913 }`.
2. Ripeti `catalogEnrich(40)` finché `remaining === 0`. Ogni chiamata logga `{ processed, remaining, ok, suspect, missing }`. Con ~913 film e blocchi da 40 servono ~23 chiamate.

- [ ] **Step 4: Verifica dati**

Run: `npx prisma studio` (oppure una query) e controlla che `CatalogFilm` abbia ~913 righe, la maggioranza `verifyStatus = ok`, alcune `suspect`/`missing`.

- [ ] **Step 5: Verifica UI nel browser (preview tools)**

- La griglia mostra i poster.
- I filtri (genere/decennio/regista) popolano e filtrano.
- "🎲 Sorprendimi" apre un'anteprima.
- Una card `suspect` mostra il badge ⚠️; aprendola, "Correggi" cerca su TMDB e salva (il badge sparisce dopo il fix).
- "Programma" su un film verificato apre il form di scheduling esistente con titolo/poster giusti.

Cattura uno screenshot della griglia popolata come prova.

- [ ] **Step 6: Rimuovere gli eventuali bottoni temporanei di seed/enrich** (se aggiunti nello Step 3) e ripetere `npx tsc --noEmit`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore(catalog): import tooling cleanup after first catalog load"
```

---

## Task 10: Verifica finale

- [ ] **Step 1: Type-check completo**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 2: Test unitari**

Run: `npm run test`
Expected: PASS (matcher + parser CSV).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build completata senza errori (include `prisma generate`).

- [ ] **Step 4: Commit finale (se restano modifiche)**

```bash
git add -A
git commit -m "feat(catalog): film catalog scheduling assistant"
```

---

## Self-Review — Copertura spec → task

| Requisito spec | Task |
|---|---|
| Tabella `CatalogFilm` (CSV + snapshot TMDB + verifyStatus) | Task 1 |
| Import ripetibile + auto-rilevamento omonimi (regista+anno) | Task 2, 3, 4 |
| Resilienza/batch per 913 film | Task 4 (`enrichPendingFilms`), Task 9 |
| Server actions (list, facets, stats, random, fix, import) | Task 5 |
| Overlay desktop con griglia poster live | Task 6 |
| Filtri genere/decennio/regista, "Sorprendimi", "già programmato", ordina | Task 6 |
| Anteprima live TMDB per conferma | Task 7 |
| Correggi-e-salva id (verifyStatus="fixed") | Task 5 (`catalogFixTmdbId`) + Task 7 |
| Pulsante nell'admin + riuso scheduling esistente | Task 8 |
| Caricamento reale dei 913 film + verifica | Task 9 |

**Note di adattamento al codebase:**
- Il progetto non ha test runner: aggiungiamo Vitest *solo* per la logica pura (matcher, parser). DB/UI/actions verificati con `tsc --noEmit`, `lint`, `build` e prove nel browser.
- Niente cartella `migrations`: si usa `prisma db push`.
- Nessuno script-runner standalone (`tsx`/`ts-node`): l'import gira come **server action** dentro il runtime Next.js (env, Prisma, TMDB già disponibili), in modo resiliente e ripetibile.
