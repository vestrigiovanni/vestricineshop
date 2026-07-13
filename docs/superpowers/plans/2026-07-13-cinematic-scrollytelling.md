# CinematicStory (Scrollytelling homepage) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere sotto la home un'esperienza scroll stile Apple (slogan giganti, strisce backdrop+logo in parallax, calendario integrato, mosaico poster) alimentata dai film in programmazione già sincronizzati nel DB Neon.

**Architecture:** Due campi nuovi su `MovieOverride` (`tagline`, `extraBackdrops`) popolati dal sync TMDB esistente + script di backfill one-off. Nuovo client component `CinematicStory` (framer-motion + CSS Modules) che in `page.tsx` sostituisce `<WeeklyCinemaCalendar>` inglobandolo come capitolo. Click su un film → CustomEvent → `MovieShowcase` seleziona il film nella hero.

**Tech Stack:** Next.js 16 (App Router), React 19, Prisma 7 + Neon Postgres, framer-motion 12 (già installato), CSS Modules (NO Tailwind), vitest.

**Spec di riferimento:** `docs/superpowers/specs/2026-07-13-cinematic-scrollytelling-design.md`

**Convenzioni vincolanti del progetto:**
- AGENTS.md: questo Next.js ha breaking changes — prima di scrivere codice che tocca API Next, leggi i doc in `node_modules/next/dist/docs/` (percorsi esatti indicati nei task).
- CSS Modules, tema scuro esistente (variabili in `src/app/globals.css`: `--background: #050507`, `--font-apple`, `--radius-md`, `--text-muted`...). Mobile in `@media (max-width: 768px)`.
- NON avviare dev server o preview: la verifica visiva la fa Giovanni. Verifiche automatiche: vitest, `npx tsc --noEmit`, `npm run build`.
- Hero, carosello poster e `WeeklyCinemaCalendar` NON vanno modificati nel loro funzionamento (al calendario cambia solo la posizione nel DOM).
- Messaggi di commit senza prefissi convenzionali inglesi obbligatori (lo storico usa italiano semplice); usa i messaggi indicati nei task.

## File Structure

| File | Azione | Responsabilità |
|---|---|---|
| `prisma/schema.prisma` | Modifica | +`tagline String?`, +`extraBackdrops String[] @default([])` su `MovieOverride` |
| `src/services/tmdb.utils.ts` | Modifica | +`pickExtraBackdrops()` (funzione pura, condivisa server/client) |
| `src/services/tmdb.utils.test.ts` | Crea | Test vitest di `pickExtraBackdrops` |
| `src/services/tmdb.ts` | Modifica | `getEnrichedMovieMetadata` espone `tagline` + `extraBackdrops` |
| `src/services/sync.service.ts` | Modifica | Persistenza dei 2 campi nei 2 punti di hydration |
| `src/services/db.service.ts` | Modifica | `VALID_FIELDS` + create del "big bang" |
| `scratch/backfill_story_fields.ts` | Crea | Backfill one-off dei film già in DB |
| `src/components/CinematicStory/storyBuilder.ts` | Crea | Logica pura: da `GroupedMovie[]` a lista capitoli |
| `src/components/CinematicStory/storyBuilder.test.ts` | Crea | Test vitest di `buildStory` |
| `src/components/CinematicStory/CinematicStory.tsx` | Crea | Component client con i capitoli animati |
| `src/components/CinematicStory/CinematicStory.module.css` | Crea | Stili dei capitoli |
| `src/components/MovieShowcase/MovieShowcase.tsx` | Modifica | +2 campi su `GroupedMovie`; listener `vestri:select-movie` |
| `src/app/page.tsx` | Modifica | Mapping nuovi campi; `CinematicStory` al posto di `WeeklyCinemaCalendar` |

---

### Task 1: Schema Prisma

**Files:**
- Modify: `prisma/schema.prisma` (model `MovieOverride`, righe 9-35)

- [ ] **Step 1: Aggiungi i campi al model**

In `prisma/schema.prisma`, dentro `model MovieOverride`, dopo la riga `customTrailerKeys  String[]     @default([])`:

```prisma
  tagline            String?
  extraBackdrops     String[]     @default([])
```

- [ ] **Step 2: Applica lo schema al DB Neon**

Il progetto non usa migration (nessuna cartella `prisma/migrations`): lo schema si applica con `db push`.

Run: `npx prisma db push`
Expected: `Your database is now in sync with your Prisma schema.` + rigenerazione del client.

⚠️ Se l'anteprima proponesse DROP di colonne/tabelle, INTERROMPI e segnala: le modifiche attese sono solo 2 colonne ADD.
⚠️ Se fallisce con `Environment variable not found: DATABASE_URL`, carica le env e riprova:

```bash
set -a; [ -f .env ] && . ./.env; [ -f .env.local ] && . ./.env.local; set +a
npx prisma db push
```

- [ ] **Step 3: Verifica il client generato**

Run: `npx tsc --noEmit`
Expected: exit 0 (il tipo `MovieOverride` ora include `tagline` ed `extraBackdrops`).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "Schema: campi tagline ed extraBackdrops su MovieOverride"
```

---

### Task 2: `pickExtraBackdrops` (TDD)

**Files:**
- Test: `src/services/tmdb.utils.test.ts` (nuovo)
- Modify: `src/services/tmdb.utils.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `src/services/tmdb.utils.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { pickExtraBackdrops, TMDBBackdrop } from './tmdb.utils';

const bd = (file_path: string, iso: string | null, vote = 5, votes = 10): TMDBBackdrop => ({
  file_path,
  iso_639_1: iso,
  vote_average: vote,
  vote_count: votes,
});

describe('pickExtraBackdrops', () => {
  it('esclude il backdrop principale già in uso', () => {
    const result = pickExtraBackdrops([bd('/main.jpg', null), bd('/alt.jpg', null)], '/main.jpg');
    expect(result).toEqual(['/alt.jpg']);
  });

  it('preferisce i backdrop senza lingua, ordinati per voto', () => {
    const result = pickExtraBackdrops(
      [bd('/en.jpg', 'en', 9), bd('/a.jpg', null, 6), bd('/b.jpg', null, 8)],
      '/main.jpg'
    );
    expect(result).toEqual(['/b.jpg', '/a.jpg', '/en.jpg']);
  });

  it('rispetta il massimo di 3 e scarta i duplicati', () => {
    const result = pickExtraBackdrops(
      [bd('/a.jpg', null, 9), bd('/a.jpg', null, 9), bd('/b.jpg', null, 8), bd('/c.jpg', null, 7), bd('/d.jpg', null, 6)],
      null
    );
    expect(result).toEqual(['/a.jpg', '/b.jpg', '/c.jpg']);
  });

  it('a parità di voto ordina per numero di voti', () => {
    const result = pickExtraBackdrops([bd('/pochi.jpg', null, 7, 3), bd('/tanti.jpg', null, 7, 50)], null);
    expect(result).toEqual(['/tanti.jpg', '/pochi.jpg']);
  });

  it('restituisce array vuoto senza candidati', () => {
    expect(pickExtraBackdrops([], '/main.jpg')).toEqual([]);
    expect(pickExtraBackdrops([bd('/main.jpg', null)], '/main.jpg')).toEqual([]);
  });
});
```

- [ ] **Step 2: Verifica che fallisca**

Run: `npx vitest run src/services/tmdb.utils.test.ts`
Expected: FAIL — `pickExtraBackdrops` non esiste (`has no exported member` / import error).

- [ ] **Step 3: Implementa**

In fondo a `src/services/tmdb.utils.ts`:

```ts
export interface TMDBBackdrop {
  file_path: string;
  iso_639_1: string | null;
  width?: number;
  vote_average?: number;
  vote_count?: number;
}

/**
 * Sceglie i backdrop "extra" per lo scrollytelling della home:
 * esclude quello principale già in uso nella hero, preferisce le immagini
 * senza testo (iso_639_1 nullo, più cinematografiche) e ordina per voto.
 */
export function pickExtraBackdrops(
  backdrops: TMDBBackdrop[],
  mainBackdropPath: string | null | undefined,
  max: number = 3
): string[] {
  const byScore = (a: TMDBBackdrop, b: TMDBBackdrop) =>
    (b.vote_average || 0) - (a.vote_average || 0) || (b.vote_count || 0) - (a.vote_count || 0);

  const seen = new Set<string>();
  const candidates = backdrops.filter(b => {
    if (!b.file_path || b.file_path === mainBackdropPath || seen.has(b.file_path)) return false;
    seen.add(b.file_path);
    return true;
  });

  const noLang = candidates.filter(b => !b.iso_639_1).sort(byScore);
  const withLang = candidates.filter(b => b.iso_639_1).sort(byScore);

  return [...noLang, ...withLang].slice(0, max).map(b => b.file_path);
}
```

- [ ] **Step 4: Verifica che passi**

Run: `npx vitest run src/services/tmdb.utils.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/services/tmdb.utils.ts src/services/tmdb.utils.test.ts
git commit -m "Selezione backdrop extra per lo scrollytelling (pickExtraBackdrops)"
```

---

### Task 3: `getEnrichedMovieMetadata` espone tagline ed extraBackdrops

**Files:**
- Modify: `src/services/tmdb.ts` (funzione `getEnrichedMovieMetadata`, oggetto `result` ~riga 930)

Contesto: `getMovieDetails` recupera GIÀ `details.tagline` con fallback IT→EN (righe ~371-372) e `details.images.backdrops`. La "Advanced Backdrop Logic" (righe ~915-927) calcola il `backdrop_path` principale: gli extra devono escluderlo.

- [ ] **Step 1: Importa la funzione**

In cima a `src/services/tmdb.ts`, insieme agli altri import:

```ts
import { pickExtraBackdrops } from './tmdb.utils';
```

(Se il file non ha import statici da `./tmdb.utils`, aggiungilo come nuovo import statico: il modulo è puro, senza dipendenze server.)

- [ ] **Step 2: Estendi l'oggetto `result`**

Nell'oggetto `result` di `getEnrichedMovieMetadata`, dopo la riga `logo_path,`:

```ts
      tagline: details.tagline || '',
      extraBackdrops: pickExtraBackdrops(details.images?.backdrops || [], backdrop_path),
```

Nota: la cache metadata (`saveMovieMetadata`) è in-memory a 24h: gli oggetti già in cache non avranno i campi nuovi, ma il backfill (Task 5) gira in un processo fresco e la hydration del sync cancella comunque la cache prima di rigenerare (riga ~139 di sync.service.ts). Nessuna azione necessaria.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/services/tmdb.ts
git commit -m "Metadata TMDB: espone tagline e backdrop extra"
```

---

### Task 4: Persistenza nel sync

**Files:**
- Modify: `src/services/sync.service.ts` (upsert Deep Hydration ~righe 162-231; upsert surgical ~righe 529-558)
- Modify: `src/services/db.service.ts` (`VALID_FIELDS` ~riga 88; create del big bang ~riga 179)

- [ ] **Step 1: Deep Hydration (sync.service.ts, primo upsert)**

Nel blocco `update:` (dopo le righe di `customTrailerKeys`, ~riga 176), aggiungi — stesso pattern `pick`/array già usato lì:

```ts
              tagline: pick(existingMovie?.tagline, tmdbData.tagline),
              extraBackdrops: (isManual && (existingMovie as any)?.extraBackdrops?.length)
                ? (existingMovie as any).extraBackdrops
                : ((tmdbData.extraBackdrops?.length) ? tmdbData.extraBackdrops : ((existingMovie as any)?.extraBackdrops || [])),
```

Nel blocco `create:` dello stesso upsert (dopo `customTrailerKeys: tmdbData.trailerKeys || [],` ~riga 214):

```ts
              tagline: tmdbData.tagline || null,
              extraBackdrops: tmdbData.extraBackdrops || [],
```

- [ ] **Step 2: Surgical sync (sync.service.ts, upsert in `syncNewlyCreatedEvents`)**

Nel blocco `update:` (dopo `runtime: ...` ~riga 541):

```ts
                  tagline: existingMovie?.tagline || tmdbData.tagline || null,
                  extraBackdrops: (existingMovie?.extraBackdrops?.length)
                    ? existingMovie.extraBackdrops
                    : (tmdbData.extraBackdrops || []),
```

Nel blocco `create:` (dopo `runtime: tmdbData.runtime` ~riga 556):

```ts
                  tagline: tmdbData.tagline || null,
                  extraBackdrops: tmdbData.extraBackdrops || [],
```

- [ ] **Step 3: db.service.ts**

In `VALID_FIELDS` (dentro `saveOverride`, ~riga 88) aggiungi in coda all'array:

```ts
      'tagline', 'extraBackdrops'
```

Nel `create` di `syncAllMoviesFromPretix` (~riga 179, dopo `customCast: ...`):

```ts
              tagline: metadata.tagline || null,
              extraBackdrops: metadata.extraBackdrops || [],
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0. (Se `existingMovie` risultasse tipato senza i campi nuovi, assicurati che il Task 1 abbia rigenerato il client: `npx prisma generate`.)

- [ ] **Step 5: Commit**

```bash
git add src/services/sync.service.ts src/services/db.service.ts
git commit -m "Sync: persiste tagline ed extraBackdrops su MovieOverride"
```

---

### Task 5: Backfill dei film già in DB

**Files:**
- Create: `scratch/backfill_story_fields.ts`

Il sync arricchisce solo film nuovi/stub: senza backfill i film già in programmazione resterebbero senza tagline/extraBackdrops.

- [ ] **Step 1: Crea lo script**

```ts
import prisma from '../src/lib/prisma';
import { getMovieDetails } from '../src/services/tmdb';
import { pickExtraBackdrops } from '../src/services/tmdb.utils';

async function main() {
  const movies = await prisma.movieOverride.findMany({
    where: { projections: { some: { active: true, dateFrom: { gte: new Date() } } } },
  });
  console.log(`Trovati ${movies.length} film con proiezioni future.`);

  let updated = 0;
  for (const m of movies) {
    const needsTagline = !m.tagline;
    const needsBackdrops = m.extraBackdrops.length === 0;
    if (!needsTagline && !needsBackdrops) {
      console.log(`- ${m.customTitle} (${m.tmdbId}): già completo, salto.`);
      continue;
    }

    const details = await getMovieDetails(m.tmdbId);
    if (!details) {
      console.log(`- ${m.customTitle} (${m.tmdbId}): TMDB non risponde, salto.`);
      continue;
    }

    const data: { tagline?: string | null; extraBackdrops?: string[] } = {};
    if (needsTagline) data.tagline = details.tagline || null;
    if (needsBackdrops) {
      data.extraBackdrops = pickExtraBackdrops(details.images?.backdrops || [], m.customBackdropPath);
    }

    await prisma.movieOverride.update({ where: { tmdbId: m.tmdbId }, data });
    updated++;
    const t = needsTagline ? (data.tagline ? `"${data.tagline}"` : 'assente su TMDB') : 'già presente';
    const b = needsBackdrops ? `${data.extraBackdrops!.length} trovati` : 'già presenti';
    console.log(`- ${m.customTitle} (${m.tmdbId}): tagline=${t}, extraBackdrops=${b}`);
  }
  console.log(`Fatto: ${updated} film aggiornati su ${movies.length}.`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Esegui il backfill**

Run: `npx tsx --env-file=.env --env-file=.env.local scratch/backfill_story_fields.ts`

(tsx risolve da solo gli alias `@/` del tsconfig usati internamente dai servizi. Se la versione di tsx non supportasse `--env-file`: `set -a; . ./.env; . ./.env.local; set +a; npx tsx scratch/backfill_story_fields.ts`.)

Expected: elenco dei film con tagline trovate/assenti e numero di backdrop extra, chiusura con `Fatto: N film aggiornati su M.` — nessuno stack trace.

- [ ] **Step 3: Verifica a campione**

Run: `npx tsx --env-file=.env --env-file=.env.local -e "import p from './src/lib/prisma'; p.movieOverride.findMany({ where: { tagline: { not: null } }, select: { customTitle: true, tagline: true, extraBackdrops: true }, take: 5 }).then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(0); })"`
Expected: almeno un film con `tagline` valorizzata e `extraBackdrops` non vuoto.

- [ ] **Step 4: Commit**

```bash
git add scratch/backfill_story_fields.ts
git commit -m "Script backfill tagline/extraBackdrops per i film in programmazione"
```

---

### Task 6: `storyBuilder` (TDD)

**Files:**
- Create: `src/components/CinematicStory/storyBuilder.ts`
- Test: `src/components/CinematicStory/storyBuilder.test.ts`

Logica pura che decide i capitoli. Regole (dalla spec):
1. Primo film con tagline → capitolo slogan.
2. Fino a 3 film NON già usati e con visual (extraBackdrops o backdrop_path) → capitolo strisce. Se non ce ne sono e NON c'è stato lo slogan iniziale, fallback: fino a 2 film con visual anche se già usati.
3. Calendario: sempre.
4. Secondo film con tagline (preferendo uno non ancora mostrato, altrimenti uno diverso dal primo) → secondo slogan.
5. Mosaico: tutti i film con poster, solo se almeno 3.
6. Chiusura: sempre (se ci sono film).

- [ ] **Step 1: Scrivi i test che falliscono**

Crea `src/components/CinematicStory/storyBuilder.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildStory } from './storyBuilder';
import type { GroupedMovie } from '../MovieShowcase/MovieShowcase';

const mk = (id: number, opts: Partial<GroupedMovie> = {}): GroupedMovie => ({
  id,
  title: `Film ${id}`,
  overview: '',
  poster_path: `/p${id}.jpg`,
  backdrop_path: `/b${id}.jpg`,
  release_date: '2026-01-01',
  subevents: [],
  tagline: `Slogan ${id}`,
  extraBackdrops: [`/x${id}.jpg`],
  ...opts,
});

const kinds = (chapters: ReturnType<typeof buildStory>) => chapters.map(c => c.kind);

describe('buildStory', () => {
  it('senza film non produce capitoli', () => {
    expect(buildStory([])).toEqual([]);
  });

  it('con 5 film completi produce la sequenza intera', () => {
    const movies = [mk(1), mk(2), mk(3), mk(4), mk(5)];
    const chapters = buildStory(movies);
    expect(kinds(chapters)).toEqual(['tagline', 'stripes', 'calendar', 'tagline', 'mosaic', 'outro']);

    const [t1, stripes, , t2, mosaic] = chapters as any[];
    expect(t1.movie.id).toBe(1);
    expect(stripes.movies).toHaveLength(3);
    expect(stripes.movies.map((m: GroupedMovie) => m.id)).not.toContain(1);
    expect(t2.movie.id).not.toBe(1);
    expect(mosaic.movies).toHaveLength(5);
  });

  it('film senza tagline non generano capitoli slogan', () => {
    const movies = [mk(1, { tagline: '' }), mk(2, { tagline: undefined }), mk(3, { tagline: '  ' })];
    const chapters = buildStory(movies);
    expect(kinds(chapters)).toEqual(['stripes', 'calendar', 'mosaic', 'outro']);
  });

  it('con un solo film completo evita strisce duplicate e mosaico', () => {
    const chapters = buildStory([mk(1)]);
    expect(kinds(chapters)).toEqual(['tagline', 'calendar', 'outro']);
  });

  it('il mosaico esclude i film senza poster e richiede almeno 3 poster', () => {
    const conMosaico = buildStory([mk(1), mk(2), mk(3), mk(4, { poster_path: null })]);
    const mosaic = conMosaico.find(c => c.kind === 'mosaic') as any;
    expect(mosaic.movies).toHaveLength(3);

    const senzaMosaico = buildStory([mk(1), mk(2, { poster_path: null }), mk(3, { poster_path: null })]);
    expect(kinds(senzaMosaico)).not.toContain('mosaic');
  });

  it('film senza alcun backdrop non entrano nelle strisce', () => {
    const movies = [mk(1), mk(2, { backdrop_path: null, extraBackdrops: [] }), mk(3)];
    const chapters = buildStory(movies);
    const stripes = chapters.find(c => c.kind === 'stripes') as any;
    expect(stripes.movies.map((m: GroupedMovie) => m.id)).toEqual([3]);
  });
});
```

Nota: `GroupedMovie` non ha ancora i campi `tagline`/`extraBackdrops` — arrivano al passo 3. Il test DEVE essere scritto prima comunque (fallirà anche per questo).

- [ ] **Step 2: Verifica che fallisca**

Run: `npx vitest run src/components/CinematicStory/storyBuilder.test.ts`
Expected: FAIL — modulo `./storyBuilder` inesistente.

- [ ] **Step 3: Estendi `GroupedMovie`**

In `src/components/MovieShowcase/MovieShowcase.tsx`, dentro `export interface GroupedMovie` (righe 23-43), dopo `awards?: any[];`:

```ts
  tagline?: string;
  extraBackdrops?: string[];
```

- [ ] **Step 4: Implementa `storyBuilder.ts`**

Crea `src/components/CinematicStory/storyBuilder.ts` (`import type` è obbligatorio: evita di caricare a runtime il componente client nei test):

```ts
import type { GroupedMovie } from '../MovieShowcase/MovieShowcase';

export type StoryChapter =
  | { kind: 'tagline'; movie: GroupedMovie }
  | { kind: 'stripes'; movies: GroupedMovie[] }
  | { kind: 'calendar' }
  | { kind: 'mosaic'; movies: GroupedMovie[] }
  | { kind: 'outro' };

const hasTagline = (m: GroupedMovie) => Boolean(m.tagline && m.tagline.trim());
const hasStripeVisual = (m: GroupedMovie) =>
  Boolean((m.extraBackdrops && m.extraBackdrops.length > 0) || m.backdrop_path);

/**
 * Trasforma i film in programmazione nella sequenza di capitoli dello
 * scrollytelling. I capitoli senza contenuto vengono omessi, mai resi vuoti.
 */
export function buildStory(movies: GroupedMovie[]): StoryChapter[] {
  if (movies.length === 0) return [];

  const chapters: StoryChapter[] = [];
  const featured = new Set<number>();
  const taglineMovies = movies.filter(hasTagline);

  const first = taglineMovies[0];
  if (first) {
    chapters.push({ kind: 'tagline', movie: first });
    featured.add(first.id);
  }

  let stripeMovies = movies.filter(m => hasStripeVisual(m) && !featured.has(m.id)).slice(0, 3);
  if (stripeMovies.length === 0 && !first) {
    stripeMovies = movies.filter(hasStripeVisual).slice(0, 2);
  }
  if (stripeMovies.length > 0) {
    chapters.push({ kind: 'stripes', movies: stripeMovies });
    stripeMovies.forEach(m => featured.add(m.id));
  }

  chapters.push({ kind: 'calendar' });

  const second =
    taglineMovies.find(m => !featured.has(m.id)) ||
    taglineMovies.find(m => m.id !== first?.id);
  if (second) {
    chapters.push({ kind: 'tagline', movie: second });
  }

  const mosaicMovies = movies.filter(m => m.poster_path);
  if (mosaicMovies.length >= 3) {
    chapters.push({ kind: 'mosaic', movies: mosaicMovies });
  }

  chapters.push({ kind: 'outro' });
  return chapters;
}
```

- [ ] **Step 5: Verifica che passi**

Run: `npx vitest run src/components/CinematicStory/storyBuilder.test.ts`
Expected: 6 passed.

Run anche l'intera suite: `npm run test`
Expected: tutti i test passano.

- [ ] **Step 6: Commit**

```bash
git add src/components/CinematicStory/storyBuilder.ts src/components/CinematicStory/storyBuilder.test.ts src/components/MovieShowcase/MovieShowcase.tsx
git commit -m "StoryBuilder: sequenza capitoli dello scrollytelling"
```

---

### Task 7: Componente `CinematicStory`

**Files:**
- Create: `src/components/CinematicStory/CinematicStory.module.css`
- Create: `src/components/CinematicStory/CinematicStory.tsx`

- [ ] **Step 1: Leggi i doc Next.js pertinenti (obbligatorio da AGENTS.md)**

- `node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md` (prop `fill`, `sizes`)
- `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md`

Se qualcosa nel codice sotto contraddice i doc (deprecazioni, prop rinominate), adegua il codice ai doc.

- [ ] **Step 2: Crea il CSS Module**

Crea `src/components/CinematicStory/CinematicStory.module.css`:

```css
/* === CinematicStory: scrollytelling stile Apple sotto la home === */

.story {
  position: relative;
  background: var(--background);
  overflow-x: clip;
}

/* --- Capitolo slogan --- */
.taglineChapter {
  min-height: 70vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  padding: 6rem 1.5rem;
  text-align: center;
}

.taglineText {
  margin: 0;
  max-width: 900px;
  font-family: var(--font-apple);
  font-size: clamp(2rem, 6vw, 4.5rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.12;
  background: linear-gradient(180deg, #ffffff 0%, rgba(255, 255, 255, 0.55) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  cursor: pointer;
}

.taglineMovie {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.95rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

/* --- Strisce backdrop + logo --- */
.stripes {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stripe {
  position: relative;
  height: clamp(320px, 55vh, 560px);
  overflow: hidden;
  cursor: pointer;
}

/* Bleed verticale extra per il travel del parallax (±8%) */
.stripeBg {
  position: absolute;
  inset: -12% 0;
}

.stripeShade {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    rgba(5, 5, 7, 0.72) 0%,
    rgba(5, 5, 7, 0.05) 40%,
    rgba(5, 5, 7, 0.05) 60%,
    rgba(5, 5, 7, 0.72) 100%
  );
}

.stripeContent {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 0 8%;
}

.stripeFlip {
  justify-content: flex-end;
}

.stripeLogo {
  width: clamp(160px, 26vw, 340px);
  height: auto;
  filter: drop-shadow(0 4px 24px rgba(0, 0, 0, 0.65));
}

.stripeTitle {
  font-family: var(--font-apple);
  font-size: clamp(1.6rem, 4vw, 3rem);
  font-weight: 700;
  color: var(--foreground);
  text-shadow: 0 2px 24px rgba(0, 0, 0, 0.85);
}

/* --- Capitolo calendario --- */
.calendarChapter {
  padding: 3rem 0 1rem;
}

/* --- Mosaico poster --- */
.mosaic {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: clamp(10px, 2vw, 24px);
  align-items: start;
  padding: 6rem clamp(1rem, 6vw, 5rem);
}

.mosaicColumn {
  display: flex;
  flex-direction: column;
  gap: clamp(10px, 2vw, 24px);
}

.mosaicColumn:nth-child(2) {
  margin-top: 3.5rem;
}

.mosaicPoster {
  position: relative;
  aspect-ratio: 2 / 3;
  border: none;
  padding: 0;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--surface);
  cursor: pointer;
  display: block;
  width: 100%;
}

/* --- Chiusura --- */
.outro {
  min-height: 50vh;
  display: grid;
  place-items: center;
  padding: 5rem 1.5rem;
}

.outroText {
  margin: 0;
  text-align: center;
  font-family: var(--font-apple);
  font-size: clamp(1.8rem, 5vw, 3.5rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  background: linear-gradient(180deg, #ffffff 0%, rgba(255, 255, 255, 0.55) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

/* --- Mobile --- */
@media (max-width: 768px) {
  .taglineChapter {
    min-height: 55vh;
    padding: 4rem 1.25rem;
  }

  .stripe {
    height: clamp(220px, 38vh, 320px);
  }

  .stripeContent {
    padding: 0 6%;
  }

  .mosaic {
    padding: 3.5rem 1rem;
  }

  .mosaicColumn:nth-child(2) {
    margin-top: 2rem;
  }

  .outro {
    min-height: 40vh;
  }
}
```

- [ ] **Step 3: Crea il componente**

Crea `src/components/CinematicStory/CinematicStory.tsx`:

```tsx
'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import type { GroupedMovie } from '../MovieShowcase/MovieShowcase';
import WeeklyCinemaCalendar from '../WeeklyCinemaCalendar/WeeklyCinemaCalendar';
import { buildStory } from './storyBuilder';
import styles from './CinematicStory.module.css';

interface CinematicStoryProps {
  movies: GroupedMovie[];
  subEvents: any[];
}

const easeApple: [number, number, number, number] = [0.22, 1, 0.36, 1];

// Riporta l'utente alla hero con il film selezionato: MovieShowcase ascolta
// questo evento e invoca la stessa logica del click sui poster in galleria.
function selectMovie(movieId: number) {
  window.dispatchEvent(new CustomEvent('vestri:select-movie', { detail: { movieId } }));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function TaglineChapter({ movie, reduced }: { movie: GroupedMovie; reduced: boolean }) {
  return (
    <section className={styles.taglineChapter}>
      <motion.blockquote
        className={styles.taglineText}
        onClick={() => selectMovie(movie.id)}
        initial={reduced ? false : { opacity: 0, y: 50, filter: 'blur(10px)' }}
        whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 1, ease: easeApple }}
      >
        {movie.tagline}
      </motion.blockquote>
      <motion.p
        className={styles.taglineMovie}
        initial={reduced ? false : { opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.8, delay: 0.35 }}
      >
        {movie.title}
      </motion.p>
    </section>
  );
}

function Stripe({ movie, flip, reduced }: { movie: GroupedMovie; flip: boolean; reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], ['-8%', '8%']);

  const backdrop = (movie.extraBackdrops && movie.extraBackdrops[0]) || movie.backdrop_path;
  if (!backdrop) return null;

  return (
    <div ref={ref} className={styles.stripe} onClick={() => selectMovie(movie.id)}>
      <motion.div className={styles.stripeBg} style={reduced ? undefined : { y }}>
        <Image
          src={getTMDBImageUrl(backdrop, 'w1280')!}
          alt={movie.title}
          fill
          sizes="100vw"
          style={{ objectFit: 'cover' }}
        />
      </motion.div>
      <div className={styles.stripeShade} />
      <motion.div
        className={`${styles.stripeContent} ${flip ? styles.stripeFlip : ''}`}
        initial={reduced ? false : { opacity: 0, x: flip ? 60 : -60 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.8, ease: easeApple }}
      >
        {movie.logo_path ? (
          <Image
            src={getTMDBImageUrl(movie.logo_path, 'w500')!}
            alt={movie.title}
            width={340}
            height={140}
            className={styles.stripeLogo}
          />
        ) : (
          <span className={styles.stripeTitle}>{movie.title}</span>
        )}
      </motion.div>
    </div>
  );
}

function MosaicChapter({ movies, reduced }: { movies: GroupedMovie[]; reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const ySlow = useTransform(scrollYProgress, [0, 1], [40, -40]);
  const yFast = useTransform(scrollYProgress, [0, 1], [120, -120]);
  const yMid = useTransform(scrollYProgress, [0, 1], [70, -70]);
  const speeds = [ySlow, yFast, yMid];

  const columns: GroupedMovie[][] = [[], [], []];
  movies.forEach((m, i) => columns[i % 3].push(m));

  return (
    <section ref={ref} className={styles.mosaic}>
      {columns.map((col, i) => (
        <motion.div key={i} className={styles.mosaicColumn} style={reduced ? undefined : { y: speeds[i] }}>
          {col.map(m => (
            <button
              key={m.id}
              className={styles.mosaicPoster}
              onClick={() => selectMovie(m.id)}
              aria-label={`Vai a ${m.title}`}
            >
              <Image
                src={getTMDBImageUrl(m.poster_path, 'w342')!}
                alt={m.title}
                fill
                sizes="(max-width: 768px) 33vw, 260px"
                style={{ objectFit: 'cover' }}
              />
            </button>
          ))}
        </motion.div>
      ))}
    </section>
  );
}

function OutroChapter({ reduced }: { reduced: boolean }) {
  return (
    <section className={styles.outro}>
      <motion.p
        className={styles.outroText}
        initial={reduced ? false : { opacity: 0, scale: 0.92 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 1.1, ease: easeApple }}
      >
        Ti aspettiamo al cinema.
      </motion.p>
    </section>
  );
}

export default function CinematicStory({ movies, subEvents }: CinematicStoryProps) {
  const reduced = useReducedMotion() ?? false;
  const chapters = buildStory(movies);

  if (chapters.length === 0) {
    // Nessun film: mostriamo comunque il calendario, come faceva la home prima.
    return <WeeklyCinemaCalendar subEvents={subEvents} />;
  }

  return (
    <div className={styles.story}>
      {chapters.map((chapter, i) => {
        switch (chapter.kind) {
          case 'tagline':
            return <TaglineChapter key={i} movie={chapter.movie} reduced={reduced} />;
          case 'stripes':
            return (
              <section key={i} className={styles.stripes}>
                {chapter.movies.map((m, j) => (
                  <Stripe key={m.id} movie={m} flip={j % 2 === 1} reduced={reduced} />
                ))}
              </section>
            );
          case 'calendar':
            return (
              <motion.section
                key={i}
                className={styles.calendarChapter}
                initial={reduced ? false : { opacity: 0, y: 60 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.9, ease: easeApple }}
              >
                <WeeklyCinemaCalendar subEvents={subEvents} />
              </motion.section>
            );
          case 'mosaic':
            return <MosaicChapter key={i} movies={chapter.movies} reduced={reduced} />;
          case 'outro':
            return <OutroChapter key={i} reduced={reduced} />;
        }
      })}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: exit 0, nessun errore nei file nuovi.

- [ ] **Step 5: Commit**

```bash
git add src/components/CinematicStory/CinematicStory.tsx src/components/CinematicStory/CinematicStory.module.css
git commit -m "Componente CinematicStory: capitoli animati stile Apple"
```

---

### Task 8: Integrazione in homepage e MovieShowcase

**Files:**
- Modify: `src/app/page.tsx` (import ~riga 3, mapping `movies` ~riga 110-131, render ~riga 184)
- Modify: `src/components/MovieShowcase/MovieShowcase.tsx` (listener evento, dopo `handleMovieSelect` ~riga 212)

- [ ] **Step 1: page.tsx — mapping dei nuovi campi**

Nel `return` del mapping `movies` (dopo `awards: (movie as any).awards || [],` ~riga 129) aggiungi:

```ts
      tagline: ((movie as any).tagline || '').trim(),
      extraBackdrops: Array.isArray((movie as any).extraBackdrops) ? (movie as any).extraBackdrops : [],
```

(La query è `SELECT *` sul JOIN: le colonne nuove di `MovieOverride` arrivano da sole; `text[]` viene deserializzato da pg come array JS.)

- [ ] **Step 2: page.tsx — sostituisci il calendario**

Sostituisci l'import a riga 3:

```ts
import CinematicStory from '@/components/CinematicStory/CinematicStory';
```

(rimuovi l'import di `WeeklyCinemaCalendar`, che ora è usato solo dentro `CinematicStory`).

Sostituisci `<WeeklyCinemaCalendar subEvents={enrichedSubEvents as any} />` (riga 184) con:

```tsx
      <CinematicStory movies={movies} subEvents={enrichedSubEvents as any} />
```

- [ ] **Step 3: MovieShowcase — listener dell'evento**

In `src/components/MovieShowcase/MovieShowcase.tsx`, subito dopo la definizione di `handleMovieSelect` (~riga 212), aggiungi:

```ts
  // Selezione film richiesta dallo scrollytelling (CinematicStory) in fondo alla pagina.
  useEffect(() => {
    const handler = (e: Event) => {
      const movieId = Number((e as CustomEvent).detail?.movieId);
      if (Number.isNaN(movieId)) return;
      setActiveMovieId(movieId);
      setTimerKey(prev => prev + 1);
      disableAutoScroll();
    };
    window.addEventListener('vestri:select-movie', handler);
    return () => window.removeEventListener('vestri:select-movie', handler);
  }, [disableAutoScroll]);
```

(Il corpo replica `handleMovieSelect` invece di richiamarlo per non dipendere da una funzione ricreata a ogni render; `useEffect` è già importato a riga 3.)

- [ ] **Step 4: Typecheck + suite completa**

Run: `npx tsc --noEmit && npm run test`
Expected: exit 0, tutti i test passano.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/components/MovieShowcase/MovieShowcase.tsx
git commit -m "Homepage: scrollytelling CinematicStory con calendario integrato"
```

---

### Task 9: Verifica finale

- [ ] **Step 1: Build di produzione**

Run: `npm run build`
Expected: build completata senza errori né warning nuovi sui file toccati.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: nessun errore.

- [ ] **Step 3: Checklist di regressione (statica, senza avviare server)**

- `git diff main --stat` (o il diff dei commit del piano): NESSUNA modifica a `MovieShowcase.module.css`, `WeeklyCinemaCalendar.tsx`, `WeeklyCinemaCalendar.module.css`, `BookingDrawer`, `BookingFlow`.
- In `MovieShowcase.tsx` le uniche modifiche sono: 2 campi opzionali su `GroupedMovie` + il `useEffect` del listener.
- In `page.tsx` il calendario è renderizzato SOLO tramite `CinematicStory`.

- [ ] **Step 4: Consegna a Giovanni per la verifica visiva**

NON avviare dev server. Riepiloga cosa verificare manualmente:
1. Home: sotto il carosello poster iniziano i capitoli (slogan → strisce → calendario → slogan → mosaico → chiusura).
2. Il calendario funziona identico a prima (prenotazioni incluse).
3. Click su slogan/striscia/poster del mosaico → scroll in cima con il film selezionato nella hero.
4. Mobile: layout adattato, animazioni fluide.
5. Desktop: hero e carosello identici a prima.

Se Giovanni segnala problemi, correggere e ri-eseguire Step 1-3.
