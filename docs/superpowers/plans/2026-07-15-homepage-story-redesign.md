# Homepage Story Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ridisegnare la storia cinematica della homepage secondo la spec `docs/superpowers/specs/2026-07-15-homepage-story-redesign-design.md`: due citazioni serif con backdrop in dissolvenza, fix loghi strisce, muro loghi completo, weekend a filmstrip full-bleed, nuovo capitolo Reveal, calendario ridisegnato, sezione festival raggruppata per festival, dieta dei metadati.

**Architecture:** La sequenza dei capitoli è logica pura in `storyBuilder.ts` (testata con vitest); il rendering è in `CinematicStory.tsx` + CSS Modules. Ogni task è una fetta verticale (builder+componente+CSS) che lascia il progetto compilante e i test verdi. Il calendario (`WeeklyCinemaCalendar`) mantiene dati/booking e cambia solo la UI.

**Tech Stack:** Next.js App Router (versione con breaking changes — docs in `node_modules/next/dist/docs/`), React, framer-motion, CSS Modules, vitest, `next/font/google`, `next/image`.

**Vincoli di sessione (memoria utente):** niente subagent, niente avvio dev server/preview da parte dell'agente — la verifica visiva la fa Giovanni. Verifica automatica = `npm test` + `npx tsc --noEmit`.

---

## Nuova sequenza capitoli (riferimento)

```
quote (apertura) → stripes A → stats → logos (tutti) → weekend (filmstrip)
→ reveal (nuovo) → calendar (redesign) → festival (nuovo) → stripes B
→ mosaic → marquee → quote (chiusura)
```

Spariscono i kind `tagline` e `awards`. I capitoli senza contenuto continuano a essere omessi.

---

### Task 1: Font serif Playfair Display

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1.1: Aggiungere il font al layout**

In `src/app/layout.tsx` sostituire l'import e il blocco font:

```tsx
import { Inter, Playfair_Display } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

// Serif da grande schermo per le citazioni della storia cinematica.
const playfair = Playfair_Display({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-serif-display',
  display: 'swap',
});
```

e nel JSX aggiornare la className del body:

```tsx
<body className={`${inter.variable} ${playfair.variable} antialiased`} style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
```

- [ ] **Step 1.2: Verifica typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 1.3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "Font serif Playfair Display per le citazioni (var --font-serif-display)"
```

---

### Task 2: Citazioni unificate — solo apertura e chiusura

**Files:**
- Modify: `src/components/CinematicStory/storyBuilder.ts`
- Modify: `src/components/CinematicStory/storyBuilder.test.ts`
- Modify: `src/components/CinematicStory/CinematicStory.tsx`
- Modify: `src/components/CinematicStory/CinematicStory.module.css`

Il kind `tagline` sparisce. Resta un solo kind `quote` (testo = tagline se presente, altrimenti excerpt della trama) usato SOLO come primo e ultimo capitolo.

- [ ] **Step 2.1: Aggiornare i test di buildStory**

In `storyBuilder.test.ts`:

1. Rimuovere il type alias `TaglineChapter` e ogni suo uso, sostituendolo con `QuoteChapter` (l'alias `AwardsChapter` resta: si rimuove nel Task 7).
2. Sostituire i test elencati sotto (il resto resta invariato):

```ts
  it('con 5 film completi produce la sequenza ricca', () => {
    const movies = [mk(1), mk(2), mk(3), mk(4), mk(5)];
    const chapters = buildStory(movies);
    expect(kinds(chapters)).toEqual([
      'quote', 'stripes', 'stats', 'logos', 'calendar',
      'stripes', 'mosaic', 'marquee', 'quote',
    ]);

    const opening = chapters[0] as QuoteChapter;
    const stripes = chapters[1] as StripesChapter;
    const logos = chapters[3] as LogosChapter;
    const closing = chapters[chapters.length - 1] as QuoteChapter;
    expect(opening.movie.id).toBe(1);
    expect(opening.text).toBe('Slogan 1');
    expect(stripes.movies.map(m => m.id)).toEqual([2, 3, 4]);
    expect(stripes.backdropIndex).toBe(0);
    expect(logos.movies).toHaveLength(5);
    // Chiusura: nessun film libero rimasto → primo film con frase diverso dall'apertura.
    expect(closing.movie.id).toBe(2);
  });
```

```ts
  it('la citazione usa la tagline se presente, altrimenti la trama', () => {
    const overview = 'Una lunga storia di mare e di vento che attraversa tre generazioni di pescatori sulle isole Orcadi.';
    const conTagline = buildStory([mk(1), mk(2), mk(3)])[0] as QuoteChapter;
    expect(conTagline.text).toBe('Slogan 1');

    const senzaTagline = buildStory([mk(1, { tagline: '', overview }), mk(2), mk(3)])[0] as QuoteChapter;
    expect(senzaTagline.movie.id).toBe(1);
    expect(senzaTagline.text).toContain('Una lunga storia');
  });
```

```ts
  it('chiude con la frase di un film, preferendo i premiati (niente messaggi commerciali)', () => {
    const movies = Array.from({ length: 10 }, (_, i) => mk(i + 1, i === 9 ? { awards: [{}] } : {}));
    const chapters = buildStory(movies);
    const last = chapters[chapters.length - 1] as QuoteChapter;
    expect(last.kind).toBe('quote');
    expect(last.movie.id).toBe(10);
  });
```

```ts
  it('con un solo film resta una sequenza minima senza capitoli vuoti', () => {
    const chapters = buildStory([mk(1)]);
    expect(kinds(chapters)).toEqual(['quote', 'stats', 'calendar']);
  });
```

```ts
  it('film senza tagline né trama non generano citazioni', () => {
    const movies = [mk(1, { tagline: '' }), mk(2, { tagline: undefined }), mk(3, { tagline: '  ' })];
    const chapters = buildStory(movies);
    expect(kinds(chapters)).not.toContain('quote');
    const stripes = chapters.find(c => c.kind === 'stripes') as StripesChapter;
    expect(stripes.movies).toHaveLength(3);
  });
```

3. Nel test `'usa una citazione dalla trama per i film senza tagline'`: eliminarlo (assorbito dal nuovo test sopra).
4. Nel test `'con seed la rotazione è deterministica ma varia tra i refresh'`: sostituire i due cast `as TaglineChapter` con `as QuoteChapter`.
5. Nel test `'con 6 film aggiunge la seconda serie di strisce (backdropIndex 1)'`: invariato per ora (cambierà nel Task 6).

- [ ] **Step 2.2: Verificare che i test falliscano**

Run: `npm test`
Expected: FAIL (sequenze con `tagline` non più attese).

- [ ] **Step 2.3: Implementare in storyBuilder.ts**

1. Nel tipo `StoryChapter` rimuovere la riga `| { kind: 'tagline'; movie: GroupedMovie }`.
2. Sotto gli helper esistenti aggiungere:

```ts
// Un film ha una "voce" se ha una tagline o una trama abbastanza lunga da citarne l'incipit.
const hasQuote = (m: GroupedMovie) => hasTagline(m) || (m.overview || '').trim().length >= 80;
const quoteTextFor = (m: GroupedMovie) => (hasTagline(m) ? m.tagline!.trim() : excerptOverview(m.overview));
```

3. Sostituire integralmente il corpo di `buildStory` con:

```ts
export function buildStory(movies: GroupedMovie[], now: Date = new Date(), seed?: number): StoryChapter[] {
  if (movies.length === 0) return [];

  // Con un seed i film ruotano a ogni refresh; senza seed l'ordine resta quello dato.
  const pool = seed == null ? movies : seededShuffle(movies, seed);

  const chapters: StoryChapter[] = [];
  const featured = new Set<number>();

  // Citazione d'apertura: tagline se c'è, altrimenti l'incipit della trama.
  const opening = pool.find(hasQuote);
  if (opening) {
    chapters.push({ kind: 'quote', movie: opening, text: quoteTextFor(opening) });
    featured.add(opening.id);
  }

  // Prima serie di strisce backdrop+logo
  let stripesA = pool.filter(m => hasStripeVisual(m) && !featured.has(m.id)).slice(0, 3);
  if (stripesA.length === 0 && !opening) {
    stripesA = pool.filter(hasStripeVisual).slice(0, 2);
  }
  if (stripesA.length > 0) {
    chapters.push({ kind: 'stripes', movies: stripesA, backdropIndex: 0 });
    stripesA.forEach(m => featured.add(m.id));
  }

  // I numeri della programmazione (sempre su tutto il catalogo)
  chapters.push({ kind: 'stats', stats: computeStats(movies) });

  // Muro di loghi
  const logoMovies = pool.filter(m => m.logo_path);
  if (logoMovies.length >= 4) {
    chapters.push({ kind: 'logos', movies: logoMovies.slice(0, MAX_LOGOS) });
  }

  // Questo weekend al cinema (sempre completo, mai ruotato)
  const weekendDays = buildWeekend(movies, now);
  if (weekendDays.length > 0) {
    chapters.push({ kind: 'weekend', days: weekendDays });
  }

  chapters.push({ kind: 'calendar' });

  // Premi e riconoscimenti (la rotazione decide quali premiati mostrare)
  const awardMovies = pool.filter(hasAwards).slice(0, 3);
  if (awardMovies.length > 0) {
    chapters.push({ kind: 'awards', movies: awardMovies });
  }

  // Seconda serie di strisce con i film non ancora protagonisti
  const stripesB = pool.filter(m => hasStripeVisual(m) && !featured.has(m.id)).slice(0, 3);
  if (stripesB.length > 0) {
    chapters.push({ kind: 'stripes', movies: stripesB, backdropIndex: 1 });
    stripesB.forEach(m => featured.add(m.id));
  }

  // Mosaico in parallax
  const posterMovies = pool.filter(m => m.poster_path);
  if (posterMovies.length >= 3) {
    chapters.push({ kind: 'mosaic', movies: posterMovies.slice(0, MAX_MOSAIC) });
  }

  // Nastro di poster in scorrimento continuo
  if (posterMovies.length >= 4) {
    chapters.push({ kind: 'marquee', movies: posterMovies.slice(0, MAX_MARQUEE) });
  }

  // Citazione di chiusura: preferisce i premiati mai stati protagonisti.
  const closing =
    pool.find(m => hasQuote(m) && !featured.has(m.id) && hasAwards(m)) ||
    pool.find(m => hasQuote(m) && !featured.has(m.id)) ||
    pool.find(m => hasQuote(m) && m.id !== opening?.id);
  if (closing) {
    chapters.push({ kind: 'quote', movie: closing, text: quoteTextFor(closing) });
  }

  return chapters;
}
```

- [ ] **Step 2.4: Run test**

Run: `npm test`
Expected: PASS.

- [ ] **Step 2.5: Nuovo QuoteChapter nel componente**

In `CinematicStory.tsx`:

1. Eliminare le funzioni `TaglineChapter` e `QuoteChapter` esistenti; al loro posto:

```tsx
function QuoteChapter({ movie, text, reduced }: { movie: GroupedMovie; text: string; reduced: boolean }) {
  // Terzo backdrop alternativo: mai usato da hero (principale) né dalle strisce ([0] e [1]).
  const extras = movie.extraBackdrops || [];
  const bg = extras[2] || extras[1] || movie.backdrop_path;
  return (
    <section className={styles.quoteChapter}>
      {bg && (
        <motion.div
          className={styles.quoteBg}
          aria-hidden="true"
          initial={reduced ? false : { opacity: 0, scale: 1.07 }}
          whileInView={{ opacity: 0.42, scale: 1 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 1.6, ease: easeApple }}
        >
          <Image
            src={getTMDBImageUrl(bg, 'w1280')!}
            alt=""
            fill
            sizes="100vw"
            style={{ objectFit: 'cover' }}
          />
        </motion.div>
      )}
      <div className={styles.quoteVignette} aria-hidden="true" />
      <motion.blockquote
        className={styles.quoteText}
        onClick={() => selectMovie(movie.id)}
        initial={reduced ? false : { opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 1, delay: 0.35, ease: easeApple }}
      >
        {text}
      </motion.blockquote>
      <motion.p
        className={styles.quoteMovie}
        initial={reduced ? false : { opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.8, delay: 0.7 }}
      >
        {movie.title}{movie.director ? ` — di ${movie.director}` : ''}
      </motion.p>
    </section>
  );
}
```

2. Nello switch del componente principale: rimuovere il case `'tagline'`; il case `'quote'` diventa:

```tsx
case 'quote':
  return <QuoteChapter key={i} movie={chapter.movie} text={chapter.text} reduced={reduced} />;
```

- [ ] **Step 2.6: CSS delle citazioni**

In `CinematicStory.module.css`:

1. Rimuovere i blocchi: `.taglineChapter`, `.taglineBg`, `.taglineVignette`, `.taglineChapter > *…`, `.taglineText`, `.taglineMovie`, e il vecchio `.quoteChapter`/`.quoteText`. Rimuovere anche le regole mobile `.taglineChapter` e `.quoteChapter` esistenti nel blocco `@media`.
2. Aggiungere:

```css
/* --- Capitolo citazione (apertura e chiusura) --- */
.quoteChapter {
  position: relative;
  overflow: hidden;
  min-height: 82vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.6rem;
  padding: 6rem 1.5rem;
  text-align: center;
}

/* Il backdrop emerge dal nero in dissolvenza (opacity animata da framer-motion). */
.quoteBg {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.quoteVignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(180deg, var(--background) 0%, transparent 28%, transparent 72%, var(--background) 100%),
    radial-gradient(ellipse at center, transparent 30%, rgba(5, 5, 7, 0.72) 100%);
}

.quoteChapter > *:not(.quoteBg):not(.quoteVignette) {
  position: relative;
  z-index: 1;
}

.quoteText {
  margin: 0;
  max-width: 920px;
  font-family: var(--font-serif-display), Georgia, 'Times New Roman', serif;
  font-style: italic;
  font-weight: 500;
  font-size: clamp(1.8rem, 5vw, 3.6rem);
  line-height: 1.25;
  letter-spacing: 0.01em;
  color: rgba(255, 255, 255, 0.94);
  text-shadow: 0 2px 34px rgba(0, 0, 0, 0.75);
  cursor: pointer;
}

.quoteMovie {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.95rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}
```

3. Nel blocco `@media (max-width: 768px)` aggiungere:

```css
  .quoteChapter {
    min-height: 60vh;
    padding: 4rem 1.25rem;
  }
```

- [ ] **Step 2.7: Typecheck + test**

Run: `npx tsc --noEmit && npm test`
Expected: nessun errore, test PASS. (Le MetaRow nelle citazioni sono già sparite col nuovo componente; quelle di strisce/premi si tolgono nei task dedicati.)

- [ ] **Step 2.8: Commit**

```bash
git add src/components/CinematicStory src/app/layout.tsx
git commit -m "Citazioni serif con backdrop in dissolvenza: solo apertura e chiusura"
```

---

### Task 3: Strisce — tetto ai loghi e dieta metadati

**Files:**
- Modify: `src/components/CinematicStory/CinematicStory.tsx`
- Modify: `src/components/CinematicStory/CinematicStory.module.css`

- [ ] **Step 3.1: Rimuovere la MetaRow dalla striscia**

In `CinematicStory.tsx`, funzione `Stripe`, eliminare la riga `<MetaRow movie={movie} />` (restano logo/titolo e regista).

- [ ] **Step 3.2: Tetto d'altezza al logo**

In `CinematicStory.module.css` sostituire `.stripeLogo` con:

```css
.stripeLogo {
  width: auto;
  height: auto;
  max-width: clamp(160px, 26vw, 340px);
  max-height: clamp(80px, 13vh, 140px);
  object-fit: contain;
  filter: drop-shadow(0 4px 24px rgba(0, 0, 0, 0.65));
}
```

e nel blocco `@media (max-width: 768px)` aggiungere:

```css
  .stripeLogo {
    max-height: 84px;
  }
```

- [ ] **Step 3.3: Typecheck + test + commit**

Run: `npx tsc --noEmit && npm test` — Expected: verdi.

```bash
git add src/components/CinematicStory
git commit -m "Strisce: tetto d'altezza ai loghi e via i badge metadati"
```

---

### Task 4: Muro loghi senza tetto

**Files:**
- Modify: `src/components/CinematicStory/storyBuilder.ts`
- Modify: `src/components/CinematicStory/storyBuilder.test.ts`

- [ ] **Step 4.1: Aggiornare il test dei tetti**

Sostituire il test `'con cataloghi grandi applica i tetti: 8 loghi, 12 mosaico, 16 marquee'` con:

```ts
  it('con cataloghi grandi il muro loghi li mostra tutti; mosaico e marquee restano a tetto', () => {
    const now = new Date('2026-07-15T10:00:00Z');
    const movies = Array.from({ length: 20 }, (_, i) => mk(i + 1));
    const chapters = buildStory(movies, now, 42);
    expect((chapters.find(c => c.kind === 'logos') as LogosChapter).movies).toHaveLength(20);
    expect((chapters.find(c => c.kind === 'mosaic') as MosaicChapter).movies).toHaveLength(12);
    expect((chapters.find(c => c.kind === 'marquee') as MarqueeChapter).movies).toHaveLength(16);
  });
```

- [ ] **Step 4.2: Run test → FAIL** (`toHaveLength(20)` contro 8).

- [ ] **Step 4.3: Implementare**

In `storyBuilder.ts`: eliminare la costante `MAX_LOGOS` e cambiare la push del capitolo loghi in:

```ts
  if (logoMovies.length >= 4) {
    chapters.push({ kind: 'logos', movies: logoMovies });
  }
```

- [ ] **Step 4.4: Run test → PASS, poi commit**

```bash
git add src/components/CinematicStory
git commit -m "Muro loghi: tutti i film in programmazione, senza tetto a 8"
```

---

### Task 5: Weekend filmstrip full-bleed

**Files:**
- Modify: `src/components/CinematicStory/CinematicStory.tsx`
- Modify: `src/components/CinematicStory/CinematicStory.module.css`

I dati (`buildWeekend`) non cambiano: cambia solo la presentazione. Import aggiuntivo: `WeekendShow` dal builder.

- [ ] **Step 5.1: Sostituire WeekendChapter**

In `CinematicStory.tsx`:

1. Aggiornare l'import: `import { buildStory, StoryStats, WeekendDay, WeekendShow } from './storyBuilder';`
2. Sostituire integralmente la funzione `WeekendChapter` con:

```tsx
function WeekendStrip({ show, reduced }: { show: WeekendShow; reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], ['-8%', '8%']);

  const movie = show.movie;
  // Quarto backdrop: le strisce narrative usano [0] e [1], le citazioni [2].
  const extras = movie.extraBackdrops || [];
  const backdrop = extras[3] || extras[0] || movie.backdrop_path;
  const runtime = formatRuntime(movie.runtime);

  return (
    <div
      ref={ref}
      className={styles.weekendStrip}
      onClick={() => selectMovie(movie.id)}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectMovie(movie.id);
        }
      }}
    >
      {backdrop && (
        <motion.div className={styles.stripeBg} style={reduced ? undefined : { y }}>
          <Image
            src={getTMDBImageUrl(backdrop, 'w1280')!}
            alt={movie.title}
            fill
            sizes="100vw"
            style={{ objectFit: 'cover' }}
          />
        </motion.div>
      )}
      <div className={styles.weekendStripShade} />
      <motion.div
        className={styles.weekendStripContent}
        initial={reduced ? false : { opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.8, ease: easeApple }}
      >
        {movie.logo_path ? (
          <Image
            src={getTMDBImageUrl(movie.logo_path, 'w500')!}
            alt={movie.title}
            width={340}
            height={140}
            className={styles.weekendLogo}
          />
        ) : (
          <span className={styles.weekendStripTitle}>{movie.title}</span>
        )}
        <div className={styles.weekendMeta}>
          <RatingBadge rating={movie.rating} size="xs" />
          {runtime && (
            <span className={styles.metaChip}>
              <Clock size={11} strokeWidth={2.4} aria-hidden="true" />
              {runtime}
            </span>
          )}
        </div>
        <div className={styles.weekendTimes}>
          {show.times.map(t => (
            <span
              key={t.time}
              className={`${styles.weekendTimeChip} ${t.isSoldOut ? styles.timeChipSoldOut : ''}`}
              title={t.isSoldOut ? 'Sold out' : (t.roomName || undefined)}
            >
              {t.time}
            </span>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function WeekendChapter({ days, reduced }: { days: WeekendDay[]; reduced: boolean }) {
  return (
    <section className={styles.weekendChapter}>
      <div className={styles.weekendIntro}>
        <motion.span
          className={styles.chapterKicker}
          initial={reduced ? false : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.8 }}
        >
          Venerdì, sabato e domenica
        </motion.span>
        <motion.h2
          className={styles.weekendTitle}
          initial={reduced ? false : { opacity: 0, y: 30, filter: 'blur(6px)' }}
          whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.9, delay: 0.1, ease: easeApple }}
        >
          Questo weekend al cinema.
        </motion.h2>
      </div>
      {days.map(day => (
        <div key={day.isoDate} className={styles.weekendDayBlock}>
          <motion.header
            className={styles.weekendDayHeader}
            initial={reduced ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.7, ease: easeApple }}
          >
            <span className={styles.weekendDayDate}>{day.dateLabel}</span>
            <span className={styles.weekendDayName}>{day.label}</span>
          </motion.header>
          <div className={styles.weekendStrips}>
            {day.shows.map(show => (
              <WeekendStrip key={show.movie.id} show={show} reduced={reduced} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 5.2: CSS weekend**

In `CinematicStory.module.css`:

1. Rimuovere i blocchi: `.weekendGrid`, `.weekendDay`, `.weekendShows`, `.weekendCard`, `.weekendCard:hover`, `.weekendPoster`, `.weekendInfo`, `.weekendFilmTitle`, `.weekendTimes` (vecchio), `.timeChip` (il `.timeChipSoldOut` RESTA). Nel blocco `@media`: rimuovere `.weekendGrid { grid-template-columns: 1fr; }`.
2. Sostituire `.weekendChapter` e `.weekendDayHeader`/`.weekendDayName`/`.weekendDayDate` e aggiungere i nuovi:

```css
/* --- Questo weekend: filmstrip full-bleed --- */
.weekendChapter {
  display: flex;
  flex-direction: column;
  padding: 6rem 0 4rem;
}

.weekendIntro {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 0 1.5rem;
  text-align: center;
}

.weekendTitle {
  margin: 0;
  font-family: var(--font-apple);
  font-size: clamp(2rem, 5.5vw, 4rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  text-align: center;
  background: linear-gradient(180deg, #ffffff 0%, rgba(255, 255, 255, 0.55) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.weekendDayBlock {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 3.5rem;
}

.weekendDayHeader {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 0 1.5rem 1.4rem;
  text-align: center;
}

.weekendDayDate {
  color: var(--text-muted);
  font-size: 0.85rem;
  letter-spacing: 0.28em;
  text-transform: uppercase;
}

.weekendDayName {
  font-family: var(--font-apple);
  font-size: clamp(1.8rem, 4.5vw, 3rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  background: linear-gradient(180deg, #ffffff 0%, rgba(255, 255, 255, 0.6) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.weekendStrips {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.weekendStrip {
  position: relative;
  height: clamp(300px, 48vh, 480px);
  overflow: hidden;
  cursor: pointer;
}

.weekendStripShade {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(5, 5, 7, 0.25) 0%, rgba(5, 5, 7, 0.1) 45%, rgba(5, 5, 7, 0.82) 100%);
}

.weekendStripContent {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 0.9rem;
  padding: 2rem 1.5rem 2.4rem;
  text-align: center;
}

.weekendLogo {
  width: auto;
  height: auto;
  max-width: min(60vw, 340px);
  max-height: clamp(70px, 11vh, 120px);
  object-fit: contain;
  filter: drop-shadow(0 4px 24px rgba(0, 0, 0, 0.65));
}

.weekendStripTitle {
  font-family: var(--font-apple);
  font-size: clamp(1.5rem, 3.6vw, 2.6rem);
  font-weight: 700;
  color: var(--foreground);
  text-shadow: 0 2px 24px rgba(0, 0, 0, 0.85);
}

.weekendMeta {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}

.weekendTimes {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.55rem;
}

.weekendTimeChip {
  padding: 0.5rem 1.1rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  background: rgba(5, 5, 7, 0.45);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  font-family: var(--font-apple);
  font-size: 1rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--foreground);
}
```

3. Nel blocco `@media (max-width: 768px)` sostituire la vecchia regola `.weekendChapter` con:

```css
  .weekendChapter {
    padding: 4rem 0 3rem;
  }

  .weekendStrip {
    height: clamp(240px, 40vh, 340px);
  }

  .weekendLogo {
    max-height: 76px;
  }

  .weekendTimeChip {
    padding: 0.4rem 0.85rem;
    font-size: 0.9rem;
  }
```

- [ ] **Step 5.3: Typecheck + test + commit**

Run: `npx tsc --noEmit && npm test` — Expected: verdi.

```bash
git add src/components/CinematicStory
git commit -m "Weekend a filmstrip full-bleed: backdrop, logo e orari per giorno"
```

---

### Task 6: Capitolo Reveal (dissolvenze sticky)

**Files:**
- Modify: `src/components/CinematicStory/storyBuilder.ts`
- Modify: `src/components/CinematicStory/storyBuilder.test.ts`
- Modify: `src/components/CinematicStory/CinematicStory.tsx`
- Modify: `src/components/CinematicStory/CinematicStory.module.css`

- [ ] **Step 6.1: Test del builder**

In `storyBuilder.test.ts`:

1. Aggiungere il type alias: `type RevealChapter = Extract<StoryChapter, { kind: 'reveal' }>;`
2. Sostituire il test `'con 6 film aggiunge la seconda serie di strisce (backdropIndex 1)'` con:

```ts
  it('con 6 film il reveal assorbe i film residui; con 12 restano anche le strisce B', () => {
    const sei = buildStory([mk(1), mk(2), mk(3), mk(4), mk(5), mk(6)]);
    const reveal = sei.find(c => c.kind === 'reveal') as RevealChapter;
    expect(reveal.movies.map(m => m.id)).toEqual([5, 6]);
    expect(sei.filter(c => c.kind === 'stripes')).toHaveLength(1);

    const dodici = buildStory(Array.from({ length: 12 }, (_, i) => mk(i + 1)));
    const reveal12 = dodici.find(c => c.kind === 'reveal') as RevealChapter;
    expect(reveal12.movies.map(m => m.id)).toEqual([5, 6, 7, 8]);
    const stripeChapters = dodici.filter(c => c.kind === 'stripes') as StripesChapter[];
    expect(stripeChapters).toHaveLength(2);
    expect(stripeChapters[1].movies.map(m => m.id)).toEqual([9, 10, 11]);
    expect(stripeChapters[1].backdropIndex).toBe(1);
  });

  it('il reveal sta tra weekend/loghi e calendario e serve almeno 2 film con visual', () => {
    const k = kinds(buildStory(Array.from({ length: 8 }, (_, i) => mk(i + 1))));
    expect(k.indexOf('reveal')).toBe(k.indexOf('calendar') - 1);

    // Con 5 film resta un solo candidato → capitolo omesso.
    expect(kinds(buildStory([mk(1), mk(2), mk(3), mk(4), mk(5)]))).not.toContain('reveal');
  });
```

3. Il test della sequenza a 5 film NON cambia (il reveal con 1 solo candidato è omesso).
4. Aggiornare il test `'chiude con la frase di un film, preferendo i premiati (niente messaggi commerciali)'`: con 10 film il reveal assorbe i film 5-8 e le strisce B i film 9-10, quindi il premiato n.10 diventerebbe "featured". Portarlo a 14 film col premio sull'ultimo, che resta libero:

```ts
  it('chiude con la frase di un film, preferendo i premiati (niente messaggi commerciali)', () => {
    const movies = Array.from({ length: 14 }, (_, i) => mk(i + 1, i === 13 ? { awards: [{}] } : {}));
    const chapters = buildStory(movies);
    const last = chapters[chapters.length - 1] as QuoteChapter;
    expect(last.kind).toBe('quote');
    expect(last.movie.id).toBe(14);
  });
```

- [ ] **Step 6.2: Run test → FAIL** (kind `reveal` inesistente).

- [ ] **Step 6.3: Implementare nel builder**

In `storyBuilder.ts`:

1. Al tipo `StoryChapter` aggiungere `| { kind: 'reveal'; movies: GroupedMovie[] }`.
2. Vicino a `MAX_MOSAIC` aggiungere:

```ts
const MAX_REVEAL = 4;
const MIN_REVEAL = 2;
```

3. In `buildStory`, subito PRIMA di `chapters.push({ kind: 'calendar' });`, inserire:

```ts
  // Reveal: dissolvenze a schermo pieno con i film non ancora protagonisti.
  const revealMovies = pool.filter(m => hasStripeVisual(m) && !featured.has(m.id)).slice(0, MAX_REVEAL);
  if (revealMovies.length >= MIN_REVEAL) {
    chapters.push({ kind: 'reveal', movies: revealMovies });
    revealMovies.forEach(m => featured.add(m.id));
  }
```

- [ ] **Step 6.4: Run test → PASS**

- [ ] **Step 6.5: Componente RevealChapter**

In `CinematicStory.tsx`:

1. Aggiornare l'import framer-motion:

```tsx
import { animate, motion, MotionValue, useInView, useMotionTemplate, useReducedMotion, useScroll, useTransform } from 'framer-motion';
```

2. Aggiungere (prima del componente principale):

```tsx
function pickRevealBackdrop(movie: GroupedMovie): string | null {
  // Quinto backdrop: strisce usano [0]/[1], citazioni [2], weekend [3].
  const extras = movie.extraBackdrops || [];
  return extras[4] || extras[3] || extras[0] || movie.backdrop_path || null;
}

function RevealSlide({ movie, index, count, progress }: {
  movie: GroupedMovie;
  index: number;
  count: number;
  progress: MotionValue<number>;
}) {
  const start = index / count;
  const end = (index + 1) / count;
  const fade = (end - start) * 0.25;

  // Il primo slide parte già visibile, l'ultimo resta visibile fino in fondo.
  const opacity = useTransform(
    progress,
    [start, start + fade, end - fade, end],
    [index === 0 ? 1 : 0, 1, 1, index === count - 1 ? 1 : 0]
  );
  const scale = useTransform(progress, [start, end], [1, 1.08]);
  const logoOpacity = useTransform(
    progress,
    [start + fade * 0.6, start + fade * 1.6, end - fade * 1.6, end - fade * 0.6],
    [index === 0 ? 1 : 0, 1, 1, index === count - 1 ? 1 : 0]
  );
  const logoBlur = useTransform(
    progress,
    [start + fade * 0.6, start + fade * 1.6, end - fade * 1.6, end - fade * 0.6],
    [index === 0 ? 0 : 10, 0, 0, index === count - 1 ? 0 : 10]
  );
  const logoFilter = useMotionTemplate`blur(${logoBlur}px)`;
  const pointerEvents = useTransform(opacity, o => (o > 0.5 ? 'auto' : 'none'));

  const backdrop = pickRevealBackdrop(movie);
  if (!backdrop) return null;

  return (
    <motion.div
      className={styles.revealSlide}
      style={{ opacity, pointerEvents }}
      onClick={() => selectMovie(movie.id)}
    >
      <motion.div className={styles.revealBg} style={{ scale }}>
        <Image
          src={getTMDBImageUrl(backdrop, 'w1280')!}
          alt={movie.title}
          fill
          sizes="100vw"
          style={{ objectFit: 'cover' }}
        />
      </motion.div>
      <div className={styles.revealVignette} aria-hidden="true" />
      <motion.div className={styles.revealLogoWrap} style={{ opacity: logoOpacity, filter: logoFilter }}>
        {movie.logo_path ? (
          <Image
            src={getTMDBImageUrl(movie.logo_path, 'w500')!}
            alt=""
            width={460}
            height={190}
            className={styles.revealLogo}
          />
        ) : (
          <span className={styles.revealTitle}>{movie.title}</span>
        )}
      </motion.div>
    </motion.div>
  );
}

function RevealChapter({ movies, reduced }: { movies: GroupedMovie[]; reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });

  if (reduced) {
    // Reduced motion: una sola immagine statica con il logo visibile.
    const movie = movies[0];
    const backdrop = pickRevealBackdrop(movie);
    if (!backdrop) return null;
    return (
      <section className={styles.revealStatic} onClick={() => selectMovie(movie.id)}>
        <div className={styles.revealBg}>
          <Image
            src={getTMDBImageUrl(backdrop, 'w1280')!}
            alt={movie.title}
            fill
            sizes="100vw"
            style={{ objectFit: 'cover' }}
          />
        </div>
        <div className={styles.revealVignette} aria-hidden="true" />
        <div className={styles.revealLogoWrap}>
          {movie.logo_path ? (
            <Image
              src={getTMDBImageUrl(movie.logo_path, 'w500')!}
              alt=""
              width={460}
              height={190}
              className={styles.revealLogo}
            />
          ) : (
            <span className={styles.revealTitle}>{movie.title}</span>
          )}
        </div>
      </section>
    );
  }

  return (
    <section ref={ref} className={styles.reveal} style={{ height: `${movies.length * 120}vh` }}>
      <div className={styles.revealSticky}>
        {movies.map((m, i) => (
          <RevealSlide key={m.id} movie={m} index={i} count={movies.length} progress={scrollYProgress} />
        ))}
      </div>
    </section>
  );
}
```

3. Nello switch aggiungere:

```tsx
case 'reveal':
  return <RevealChapter key={i} movies={chapter.movies} reduced={reduced} />;
```

- [ ] **Step 6.6: CSS reveal**

Aggiungere in `CinematicStory.module.css`:

```css
/* --- Reveal: dissolvenze a schermo pieno --- */
.reveal {
  position: relative;
}

.revealSticky {
  position: sticky;
  top: 0;
  height: 100vh;
  overflow: hidden;
}

.revealSlide {
  position: absolute;
  inset: 0;
  cursor: pointer;
}

.revealBg {
  position: absolute;
  inset: 0;
}

.revealVignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(180deg, var(--background) 0%, transparent 18%, transparent 82%, var(--background) 100%),
    radial-gradient(ellipse at center, transparent 45%, rgba(5, 5, 7, 0.55) 100%);
}

.revealLogoWrap {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.revealLogo {
  width: auto;
  height: auto;
  max-width: min(70vw, 460px);
  max-height: clamp(90px, 16vh, 180px);
  object-fit: contain;
  filter: drop-shadow(0 6px 30px rgba(0, 0, 0, 0.7));
}

.revealTitle {
  font-family: var(--font-serif-display), Georgia, serif;
  font-style: italic;
  font-size: clamp(2rem, 6vw, 4rem);
  font-weight: 500;
  color: rgba(255, 255, 255, 0.95);
  text-shadow: 0 2px 30px rgba(0, 0, 0, 0.8);
  text-align: center;
  padding: 0 1.5rem;
}

.revealStatic {
  position: relative;
  height: 80vh;
  overflow: hidden;
  cursor: pointer;
}
```

- [ ] **Step 6.7: Typecheck + test + commit**

Run: `npx tsc --noEmit && npm test` — Expected: verdi.

```bash
git add src/components/CinematicStory
git commit -m "Nuovo capitolo Reveal: backdrop in dissolvenza e loghi che emergono dal buio"
```

---

### Task 7: Sezione festival raggruppata per festival

**Files:**
- Create: `src/components/CinematicStory/festivals.ts`
- Modify: `src/components/CinematicStory/storyBuilder.ts`
- Modify: `src/components/CinematicStory/storyBuilder.test.ts`
- Modify: `src/components/CinematicStory/CinematicStory.tsx`
- Modify: `src/components/CinematicStory/CinematicStory.module.css`

- [ ] **Step 7.1: Test del raggruppamento**

In `storyBuilder.test.ts`:

1. Aggiungere all'import: `buildFestivalGroups` da `./storyBuilder`.
2. Sostituire il type alias `AwardsChapter` con `type FestivalChapterT = Extract<StoryChapter, { kind: 'festival' }>;`
3. Sostituire il test `'crea il capitolo premi solo se ci sono premiati, max 3'` con:

```ts
describe('buildFestivalGroups', () => {
  it('raggruppa i film per festival, ordina per numero di film e poi prestigio', () => {
    const movies = [
      mk(1, { awards: [
        { type: 'cannes', label: "Palma d'Oro", year: 2024 },
        { type: 'venice', label: "Leone d'Argento", year: 2023 },
      ] }),
      mk(2, { awards: [{ type: 'venice', label: 'Coppa Volpi', year: 2025 }] }),
      mk(3, { awards: [{ type: 'VENICE ', label: "Leone d'Oro" }] }),
    ];
    const groups = buildFestivalGroups(movies);

    expect(groups.map(g => g.festival.key)).toEqual(['venice', 'cannes']);
    expect(groups[0].films.map(f => f.movie.id)).toEqual([1, 2, 3]);
    expect(groups[0].films[0].awardLabel).toBe("Leone d'Argento · 2023");
    expect(groups[0].films[2].awardLabel).toBe("Leone d'Oro");
    expect(groups[1].films.map(f => f.movie.id)).toEqual([1]);
  });

  it('a parità di film vince il prestigio; alias e tipi ignoti hanno un fallback', () => {
    const movies = [
      mk(1, { awards: [{ type: 'venice', label: 'Premio' }] }),
      mk(2, { awards: [{ type: 'cannes', label: 'Premio' }] }),
      mk(3, { awards: [{ type: 'TIFF People Choice', label: 'Premio' }] }),
      mk(4, { awards: [{ type: 'sconosciuto', label: 'Premio' }] }),
    ];
    const groups = buildFestivalGroups(movies);
    expect(groups.map(g => g.festival.key)).toEqual(['cannes', 'venice', 'oscar', 'toronto']);
  });

  it('senza premi non produce gruppi', () => {
    expect(buildFestivalGroups([mk(1), mk(2)])).toEqual([]);
  });
});
```

4. Aggiungere nel describe di `buildStory`:

```ts
  it('crea il capitolo festival dopo il calendario solo se ci sono premiati', () => {
    const senza = kinds(buildStory([mk(1), mk(2), mk(3)]));
    expect(senza).not.toContain('festival');

    const movies = [mk(1, { awards: [{ type: 'cannes', label: "Palma d'Oro", year: 2024 }] }), mk(2), mk(3)];
    const k = kinds(buildStory(movies));
    expect(k.indexOf('festival')).toBe(k.indexOf('calendar') + 1);

    const festival = buildStory(movies).find(c => c.kind === 'festival') as FestivalChapterT;
    expect(festival.groups[0].festival.key).toBe('cannes');
    expect(festival.groups[0].films[0].movie.id).toBe(1);
  });
```

- [ ] **Step 7.2: Run test → FAIL** (`buildFestivalGroups` inesistente).

- [ ] **Step 7.3: Creare `festivals.ts`**

Nuovo file `src/components/CinematicStory/festivals.ts` (modulo puro, importabile sia dal builder sia dal componente):

```ts
// Risoluzione award.type → festival: chiavi e loghi allineati a
// getFestivalConfig in MovieAwards (stessi alias, stesso fallback Oscar).

export interface FestivalInfo {
  key: string;
  name: string;
  logo: string;
  logoWidth: number;
  logoHeight: number;
}

const STD = { logoWidth: 95, logoHeight: 95 };

export const FESTIVALS: Record<string, FestivalInfo> = {
  cannes: { key: 'cannes', name: 'Festival di Cannes', logo: '/logos/cannes_v1.png', ...STD },
  venice: { key: 'venice', name: 'Mostra di Venezia', logo: '/logos/venezia_v1.png', ...STD },
  berlin: { key: 'berlin', name: 'Berlinale', logo: '/logos/berlinale_v1.png', ...STD },
  oscar: { key: 'oscar', name: 'Academy Awards', logo: '/logos/oscars_v1.png', ...STD },
  bafta: { key: 'bafta', name: 'BAFTA', logo: '/logos/bafta_v1.png', ...STD },
  ssiff: { key: 'ssiff', name: 'Festival di San Sebastián', logo: '/logos/ssiff_v1.png', ...STD },
  telluride: { key: 'telluride', name: 'Telluride Film Festival', logo: '/logos/telluride_v1.png', ...STD },
  toronto: { key: 'toronto', name: 'Toronto International Film Festival', logo: '/logos/tiff.png', logoWidth: 200, logoHeight: 95 },
  locarno: { key: 'locarno', name: 'Locarno Film Festival', logo: '/logos/locarno.png', ...STD },
  davids: { key: 'davids', name: 'David di Donatello', logo: '/logos/david.png', ...STD },
  nastri: { key: 'nastri', name: "Nastri d'Argento", logo: '/logos/nastri.png', ...STD },
  romacinemafest: { key: 'romacinemafest', name: 'Festa del Cinema di Roma', logo: '/logos/roma.png', ...STD },
};

/** Tie-break nell'ordinamento dei blocchi festival. */
export const FESTIVAL_PRESTIGE = [
  'cannes', 'venice', 'berlin', 'oscar', 'bafta', 'toronto',
  'ssiff', 'locarno', 'telluride', 'davids', 'nastri', 'romacinemafest',
];

/** Stessa logica di getFestivalConfig: alias Toronto/TIFF, fallback Oscar. */
export function resolveFestival(type: string): FestivalInfo {
  const t = (type || '').toLowerCase().trim();
  if (t === 'toronto' || t === 'tiff' || t.includes('toronto') || t.includes('tiff')) {
    return FESTIVALS.toronto;
  }
  return FESTIVALS[t] || FESTIVALS.oscar;
}
```

- [ ] **Step 7.4: Implementare nel builder**

In `storyBuilder.ts`:

1. Import in testa: `import { FESTIVAL_PRESTIGE, FestivalInfo, resolveFestival } from './festivals';`
2. Nuovi tipi esportati (vicino a `WeekendDay`):

```ts
export interface FestivalFilm {
  movie: GroupedMovie;
  /** Riconoscimento principale a questo festival, es. "Palma d'Oro · 2024" */
  awardLabel: string;
}

export interface FestivalGroup {
  festival: FestivalInfo;
  films: FestivalFilm[];
}
```

3. Nel tipo `StoryChapter`: sostituire `| { kind: 'awards'; movies: GroupedMovie[] }` con `| { kind: 'festival'; groups: FestivalGroup[] }`.
4. Aggiungere la funzione:

```ts
interface AwardLike {
  type?: string;
  label?: string;
  year?: number | null;
}

/**
 * Raggruppa i film premiati per festival: il festival è il protagonista,
 * sotto di lui i poster dei film in programmazione candidati o vincitori.
 */
export function buildFestivalGroups(movies: GroupedMovie[]): FestivalGroup[] {
  const map = new Map<string, { festival: FestivalInfo; films: Map<number, FestivalFilm> }>();

  for (const movie of movies) {
    for (const award of (movie.awards || []) as AwardLike[]) {
      const festival = resolveFestival(award.type || '');
      let group = map.get(festival.key);
      if (!group) {
        group = { festival, films: new Map() };
        map.set(festival.key, group);
      }
      // Primo riconoscimento del film a questo festival: diventa l'etichetta.
      if (!group.films.has(movie.id)) {
        const awardLabel = [award.label, award.year].filter(Boolean).join(' · ');
        group.films.set(movie.id, { movie, awardLabel });
      }
    }
  }

  const prestige = (key: string) => {
    const i = FESTIVAL_PRESTIGE.indexOf(key);
    return i === -1 ? FESTIVAL_PRESTIGE.length : i;
  };

  return Array.from(map.values())
    .map(g => ({ festival: g.festival, films: Array.from(g.films.values()) }))
    .sort((a, b) => b.films.length - a.films.length || prestige(a.festival.key) - prestige(b.festival.key));
}
```

5. In `buildStory`, sostituire il blocco `awardMovies` (dopo `calendar`) con:

```ts
  // Dai festival alla nostra sala: blocchi per festival, non per film.
  const festivalGroups = buildFestivalGroups(pool);
  if (festivalGroups.length > 0) {
    chapters.push({ kind: 'festival', groups: festivalGroups });
  }
```

(`hasAwards` resta: serve alla preferenza della citazione di chiusura.)

- [ ] **Step 7.5: Run test → PASS**

- [ ] **Step 7.6: Componente FestivalChapter**

In `CinematicStory.tsx`:

1. Rimuovere `import { getFestivalConfig } from '../MovieAwards/MovieAwards';` e l'intera funzione `AwardsChapter`.
2. Aggiornare l'import dal builder: `import { buildStory, FestivalGroup, StoryStats, WeekendDay, WeekendShow } from './storyBuilder';`
3. Aggiungere:

```tsx
function FestivalChapter({ groups, reduced }: { groups: FestivalGroup[]; reduced: boolean }) {
  return (
    <section className={styles.festivalChapter}>
      <motion.span
        className={styles.chapterKicker}
        initial={reduced ? false : { opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.8 }}
      >
        Dai festival alla nostra sala
      </motion.span>
      {groups.map(group => (
        <div key={group.festival.key} className={styles.festivalBlock}>
          <motion.div
            className={styles.festivalHeader}
            initial={reduced ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.8, ease: easeApple }}
          >
            <Image
              src={group.festival.logo}
              alt=""
              aria-hidden="true"
              width={Math.round(group.festival.logoWidth * 1.6)}
              height={Math.round(group.festival.logoHeight * 1.6)}
              className={styles.festivalLogo}
              unoptimized
            />
            <h3 className={styles.festivalName}>{group.festival.name}</h3>
          </motion.div>
          <div className={styles.festivalFilms}>
            {group.films.map((film, i) => (
              <motion.button
                key={film.movie.id}
                className={styles.festivalFilm}
                onClick={() => selectMovie(film.movie.id)}
                aria-label={`Vai a ${film.movie.title}`}
                initial={reduced ? false : { opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.7, delay: i * 0.08, ease: easeApple }}
              >
                <span className={styles.festivalPoster}>
                  {film.movie.poster_path && (
                    <Image
                      src={getTMDBImageUrl(film.movie.poster_path, 'w342')!}
                      alt={film.movie.title}
                      fill
                      sizes="(max-width: 768px) 40vw, 200px"
                      style={{ objectFit: 'cover' }}
                    />
                  )}
                </span>
                <span className={styles.festivalFilmTitle}>{film.movie.title}</span>
                <span className={styles.festivalAward}>{film.awardLabel}</span>
              </motion.button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
```

4. Nello switch: rimuovere il case `'awards'` e aggiungere:

```tsx
case 'festival':
  return <FestivalChapter key={i} groups={chapter.groups} reduced={reduced} />;
```

5. Ora che `AwardsChapter`, le citazioni e le strisce non usano più `MetaRow`: eliminare la funzione `MetaRow` (resta `formatRuntime`, usato dal weekend).

- [ ] **Step 7.7: CSS festival**

In `CinematicStory.module.css`:

1. Rimuovere i blocchi: `.awardsChapter`, `.awardsTitle`, `.awardsGrid`, `.awardCard`, `.awardLogos`, `.awardLogoImg`, `.awardCard:hover .awardLogoImg`, `.awardFilmTitle`, `.awardList`, `.awardItemLabel`, `.awardMore`, e le regole mobile `.awardsChapter`/`.awardCard`. Rimuovere anche `.metaRow`, `.metaRowWrap`, `.metaRowCompact`, `.metaRowCompact .metaChip`, `.genreChip` e le regole annidate (`.stripeInfo .metaRow`, `.stripeInfoFlip .metaRow`) — il solo `.metaChip` RESTA (usato dal weekend).
2. Aggiungere:

```css
/* --- Dai festival: blocchi per festival --- */
.festivalChapter {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 6rem 1.5rem;
}

.festivalBlock {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem;
  margin-top: 3.5rem;
  width: min(1100px, 100%);
}

.festivalBlock:first-of-type {
  margin-top: 2rem;
}

.festivalHeader {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  text-align: center;
}

.festivalLogo {
  width: auto;
  height: clamp(110px, 15vw, 160px);
  filter:
    drop-shadow(0 6px 26px rgba(0, 0, 0, 0.55))
    drop-shadow(0 0 26px rgba(255, 255, 255, 0.08));
}

.festivalName {
  margin: 0;
  font-family: var(--font-apple);
  font-size: clamp(1.4rem, 3.2vw, 2.2rem);
  font-weight: 700;
  letter-spacing: -0.01em;
  background: linear-gradient(180deg, #ffffff 0%, rgba(255, 255, 255, 0.6) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.festivalFilms {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: clamp(1.2rem, 3vw, 2.4rem);
}

.festivalFilm {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  width: clamp(130px, 16vw, 190px);
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  text-align: center;
  transition: var(--transition-snappy);
}

.festivalFilm:hover {
  transform: translateY(-4px);
}

.festivalPoster {
  position: relative;
  width: 100%;
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--surface);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
}

.festivalFilmTitle {
  font-family: var(--font-apple);
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--foreground);
  line-height: 1.25;
}

.festivalAward {
  color: var(--text-muted);
  font-size: 0.78rem;
  line-height: 1.3;
}
```

3. Nel blocco `@media (max-width: 768px)` aggiungere:

```css
  .festivalChapter {
    padding: 4rem 1rem;
  }

  .festivalLogo {
    height: clamp(90px, 22vw, 120px);
  }

  .festivalFilm {
    width: clamp(120px, 38vw, 160px);
  }
```

- [ ] **Step 7.8: Typecheck + test + commit**

Run: `npx tsc --noEmit && npm test` — Expected: verdi.

```bash
git add src/components/CinematicStory
git commit -m "Sezione festival ribaltata: logo del festival protagonista, sotto i poster dei film"
```

---

### Task 8: Calendario settimanale — redesign a cartellone

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/WeeklyCinemaCalendar/WeeklyCinemaCalendar.tsx`
- Modify: `src/components/WeeklyCinemaCalendar/WeeklyCinemaCalendar.module.css`

- [ ] **Step 8.1: Arricchire i subevents in page.tsx**

In `src/app/page.tsx`, dentro la costruzione di `enrichedSubEvents`, dopo `active: p.active,` aggiungere:

```ts
    tmdbId: p.tmdbId || null,
    posterPath: p.movie?.customPosterPath || null,
```

- [ ] **Step 8.2: Nuova UI del calendario**

Riscrivere il render di `WeeklyCinemaCalendar.tsx` mantenendo INVARIATI: SWR availability, stato settimana/giorno, `screeningsByDay` (col cutoff 2 minuti), `openBooking`, `BookingDrawer`. Il file completo diventa:

```tsx
'use client';

import { useState, useMemo, useEffect } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Film, Ticket } from 'lucide-react';
import styles from './WeeklyCinemaCalendar.module.css';
import BookingDrawer from '../BookingDrawer/BookingDrawer';
import RatingBadge from '../RatingBadge';
import LanguageBadge from '../LanguageBadge';
import { getTMDBImageUrl } from '@/services/tmdb.utils';

import { useAutoScroll } from '@/context/AutoScrollContext';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(res => res.json());

interface SubEvent {
  id: number;
  name: { it: string } | string;
  date_from: string;
  date_to?: string;
  seating_plan?: number;
  roomName?: string;
  meta_data?: Record<string, string>;
  comment?: string;
  isSoldOut?: boolean;
  calculatedRating?: string;
  tmdbId?: string | null;
  posterPath?: string | null;
}

interface WeeklyCinemaCalendarProps {
  subEvents: SubEvent[];
}

// Helper function to get local YYYY-MM-DD string
const toLocalDateStr = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function WeeklyCinemaCalendar({ subEvents: initialSubEvents }: WeeklyCinemaCalendarProps) {
  const { data: availabilityData } = useSWR('/api/availability', fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true
  });

  const subEvents = useMemo(() => {
    if (!availabilityData) return initialSubEvents;
    return initialSubEvents.map(se => {
      const liveIsSoldOut = availabilityData[se.id] === true || availabilityData[se.id.toString()] === true;
      return {
        ...se,
        isSoldOut: se.isSoldOut || liveIsSoldOut
      };
    });
  }, [initialSubEvents, availabilityData]);

  // Navigation state: start of the currently viewed week (Monday)
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
    const monday = new Date(now.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  });

  // Giorno selezionato: unico pannello visibile, su ogni viewport.
  const [selectedDayStr, setSelectedDayStr] = useState<string>(() => {
    const now = new Date();
    return toLocalDateStr(now);
  });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedSubevent, setSelectedSubevent] = useState<{ id: number; title: string } | null>(null);

  const { disableAutoScroll } = useAutoScroll();

  // Generate 7 days of the week
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(currentWeekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [currentWeekStart]);

  // Ensure selectedDayStr is within the current week when week changes
  useEffect(() => {
    const weekDayStrings = weekDays.map(d => toLocalDateStr(d));
    if (!weekDayStrings.includes(selectedDayStr)) {
      setSelectedDayStr(weekDayStrings[0]);
    }
  }, [weekDays, selectedDayStr]);

  const handlePrevWeek = () => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() - 7);
    setCurrentWeekStart(d);
  };

  const handleNextWeek = () => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + 7);
    setCurrentWeekStart(d);
  };

  const openBooking = (id: number, title: string) => {
    setSelectedSubevent({ id, title });
    setDrawerOpen(true);
    disableAutoScroll();
  };

  // Group screenings by date string (YYYY-MM-DD) for easy access
  const screeningsByDay = useMemo(() => {
    const groups: Record<string, SubEvent[]> = {};
    const now = new Date();
    const CUTOFF_MINUTES = 2;

    subEvents.forEach(se => {
      const startTime = new Date(se.date_from);
      // Filter out screenings starting in < 2 minutes (or already started)
      if (startTime.getTime() - now.getTime() < CUTOFF_MINUTES * 60 * 1000) {
        return;
      }

      const dateStr = toLocalDateStr(startTime);
      if (!groups[dateStr]) groups[dateStr] = [];
      groups[dateStr].push(se);
    });
    // Sort each day's screenings by time
    Object.values(groups).forEach(dayList => {
      dayList.sort((a, b) => new Date(a.date_from).getTime() - new Date(b.date_from).getTime());
    });
    return groups;
  }, [subEvents]);

  const formatDateRange = () => {
    const start = weekDays[0];
    const end = weekDays[6];
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
    return `${start.toLocaleDateString('it-IT', options)} - ${end.toLocaleDateString('it-IT', options)} ${end.getFullYear()}`;
  };

  const selectedScreenings = screeningsByDay[selectedDayStr] || [];
  const selectedDay = weekDays.find(d => toLocalDateStr(d) === selectedDayStr);

  return (
    <section className={styles.calendarContainer}>
      <div className={styles.calendarWrapper}>
        <header className={styles.header}>
          <span className={styles.kicker}>La settimana in sala</span>
          <h2 className={styles.title}>Programmazione</h2>
          <div className={styles.weekNav}>
            <button
              className={styles.navButton}
              onClick={handlePrevWeek}
              aria-label="Settimana precedente"
            >
              <ChevronLeft size={18} />
            </button>
            <span className={styles.dateRange}>{formatDateRange()}</span>
            <button
              className={styles.navButton}
              onClick={handleNextWeek}
              aria-label="Settimana successiva"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </header>

        <div className={styles.dayTabs} role="tablist" aria-label="Giorni della settimana">
          {weekDays.map(day => {
            const dateStr = toLocalDateStr(day);
            const isSelected = selectedDayStr === dateStr;
            const isToday = new Date().toDateString() === day.toDateString();
            const hasShows = (screeningsByDay[dateStr] || []).length > 0;

            return (
              <button
                key={dateStr}
                role="tab"
                aria-selected={isSelected}
                className={`${styles.dayTab} ${isSelected ? styles.dayTabActive : ''} ${isToday ? styles.dayTabToday : ''}`}
                onClick={() => setSelectedDayStr(dateStr)}
              >
                <span className={styles.dayTabName}>
                  {day.toLocaleDateString('it-IT', { weekday: 'short' })}
                </span>
                <span className={styles.dayTabNumber}>{day.getDate()}</span>
                <span className={`${styles.dayTabDot} ${hasShows ? styles.dayTabDotOn : ''}`} aria-hidden="true" />
              </button>
            );
          })}
        </div>

        <div className={styles.dayPanel}>
          <h3 className={styles.dayPanelTitle}>
            {selectedDay?.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h3>
          {selectedScreenings.length > 0 ? (
            <div className={styles.screeningList}>
              {selectedScreenings.map(se => {
                const time = new Date(se.date_from).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
                const title = typeof se.name === 'string' ? se.name : se.name.it;
                const room = se.roomName || 'Sala';
                const isSoldOut = se.isSoldOut;

                return (
                  <button
                    key={se.id}
                    className={`${styles.screeningRow} ${isSoldOut ? styles.screeningSoldOut : ''}`}
                    onClick={() => !isSoldOut && openBooking(se.id, title)}
                    disabled={isSoldOut}
                  >
                    <span className={styles.screeningTime}>{time}</span>
                    <span className={styles.screeningPoster}>
                      {se.posterPath ? (
                        <Image
                          src={getTMDBImageUrl(se.posterPath, 'w185')!}
                          alt=""
                          fill
                          sizes="56px"
                          style={{ objectFit: 'cover' }}
                        />
                      ) : (
                        <Film size={18} aria-hidden="true" />
                      )}
                    </span>
                    <span className={styles.screeningInfo}>
                      <span className={styles.screeningTitle}>{title}</span>
                      <span className={styles.screeningSub}>
                        <span className={styles.screeningRoom}>{room}</span>
                        <RatingBadge rating={se.meta_data?.rating || 'T'} size="xs" />
                        <LanguageBadge
                          language={se.meta_data?.lingua}
                          subtitles={se.meta_data?.sottotitoli}
                          version={se.meta_data?.format}
                          size="xs"
                          showLabel={false}
                        />
                      </span>
                    </span>
                    {isSoldOut ? (
                      <span className={styles.esauritoBadge}>Esaurito</span>
                    ) : (
                      <span className={styles.buyHint}>
                        <Ticket size={15} />
                        Prenota
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyState}>Nessuno spettacolo in programma</div>
          )}
        </div>
      </div>

      <BookingDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        subeventId={selectedSubevent?.id || null}
        movieTitle={selectedSubevent?.title}
      />
    </section>
  );
}
```

Nota: spariscono gli import inutilizzati (`Calendar as CalendarIcon`, `getMovieTags`, `TagInfo`) e la vecchia griglia a 7 colonne; il tooltip "Esaurito" è sostituito dal badge (il `title`/stato disabled resta comunicativo).

- [ ] **Step 8.3: Nuovo CSS del calendario**

Sostituire integralmente il contenuto di `WeeklyCinemaCalendar.module.css` con:

```css
/* === Programmazione settimanale: cartellone di sala === */

.calendarContainer {
  width: 100%;
  padding: 2rem 1.5rem 4rem;
  display: flex;
  justify-content: center;
}

.calendarWrapper {
  width: min(880px, 100%);
  display: flex;
  flex-direction: column;
  gap: 1.8rem;
}

/* --- Intestazione --- */
.header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.7rem;
  text-align: center;
}

.kicker {
  color: var(--text-muted);
  font-family: var(--font-apple);
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.28em;
  text-transform: uppercase;
}

.title {
  margin: 0;
  font-family: var(--font-apple);
  font-size: clamp(2rem, 5.5vw, 3.5rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  background: linear-gradient(180deg, #ffffff 0%, rgba(255, 255, 255, 0.55) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.weekNav {
  display: flex;
  align-items: center;
  gap: 0.9rem;
}

.dateRange {
  color: var(--text-muted);
  font-size: 0.9rem;
  letter-spacing: 0.05em;
  font-variant-numeric: tabular-nums;
  min-width: 210px;
}

.navButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--glass-border);
  background: rgba(255, 255, 255, 0.05);
  color: var(--foreground);
  cursor: pointer;
  transition: var(--transition-snappy);
}

.navButton:hover {
  background: rgba(255, 255, 255, 0.12);
}

/* --- Tab dei giorni --- */
.dayTabs {
  display: flex;
  justify-content: center;
  gap: 0.45rem;
  overflow-x: auto;
  padding: 0.25rem;
  scrollbar-width: none;
}

.dayTabs::-webkit-scrollbar {
  display: none;
}

.dayTab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  min-width: 60px;
  padding: 0.55rem 0.7rem 0.5rem;
  border-radius: 16px;
  border: 1px solid transparent;
  background: none;
  cursor: pointer;
  transition: var(--transition-snappy);
}

.dayTab:hover {
  background: rgba(255, 255, 255, 0.05);
}

.dayTabActive {
  border-color: var(--glass-border);
  background: rgba(255, 255, 255, 0.08);
}

.dayTabName {
  color: var(--text-muted);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.dayTabActive .dayTabName {
  color: rgba(255, 255, 255, 0.85);
}

.dayTabNumber {
  font-family: var(--font-apple);
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--foreground);
  font-variant-numeric: tabular-nums;
}

.dayTabToday .dayTabNumber {
  color: #cdbcf8;
}

.dayTabDot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: transparent;
}

.dayTabDotOn {
  background: rgba(255, 255, 255, 0.55);
}

/* --- Pannello del giorno --- */
.dayPanel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 220px;
}

.dayPanelTitle {
  margin: 0;
  font-family: var(--font-apple);
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: capitalize;
  text-align: center;
  letter-spacing: 0.02em;
}

.screeningList {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.screeningRow {
  display: flex;
  align-items: center;
  gap: 1.1rem;
  padding: 0.8rem 1.1rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--surface-border);
  background: var(--surface);
  cursor: pointer;
  text-align: left;
  transition: var(--transition-snappy);
}

.screeningRow:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.07);
  transform: translateX(4px);
}

.screeningTime {
  font-family: var(--font-apple);
  font-size: clamp(1.3rem, 3vw, 1.7rem);
  font-weight: 700;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  color: var(--foreground);
  min-width: 74px;
}

.screeningPoster {
  position: relative;
  flex-shrink: 0;
  width: 46px;
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: rgba(255, 255, 255, 0.04);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.screeningInfo {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
  flex: 1;
}

.screeningTitle {
  font-family: var(--font-apple);
  font-size: 1rem;
  font-weight: 600;
  color: var(--foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.screeningSub {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.screeningRoom {
  color: var(--text-muted);
  font-size: 0.8rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.buyHint {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.85rem;
  border-radius: 999px;
  border: 1px solid var(--glass-border);
  background: rgba(255, 255, 255, 0.05);
  color: var(--foreground);
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
}

.screeningRow:hover:not(:disabled) .buyHint {
  background: rgba(139, 92, 246, 0.22);
  border-color: rgba(139, 92, 246, 0.45);
}

/* --- Sold out --- */
.screeningSoldOut {
  cursor: not-allowed;
  opacity: 0.55;
}

.screeningSoldOut .screeningTime {
  text-decoration: line-through;
  color: var(--text-muted);
}

.esauritoBadge {
  padding: 0.4rem 0.85rem;
  border-radius: 999px;
  border: 1px solid var(--surface-border);
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
}

.emptyState {
  padding: 3rem 1rem;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.9rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

/* --- Mobile --- */
@media (max-width: 768px) {
  .calendarContainer {
    padding: 1.5rem 1rem 3rem;
  }

  .dayTabs {
    justify-content: flex-start;
  }

  .screeningRow {
    gap: 0.8rem;
    padding: 0.7rem 0.85rem;
  }

  .screeningTime {
    min-width: 58px;
  }

  .buyHint {
    font-size: 0;
    gap: 0;
    padding: 0.45rem;
  }

  .buyHint svg {
    width: 15px;
    height: 15px;
  }
}
```

- [ ] **Step 8.4: Typecheck + test + commit**

Run: `npx tsc --noEmit && npm test` — Expected: verdi.

```bash
git add src/app/page.tsx src/components/WeeklyCinemaCalendar
git commit -m "Calendario a cartellone: tab dei giorni, righe con poster, prenotazione invariata"
```

---

### Task 9: Verifica finale

- [ ] **Step 9.1: Suite completa**

Run: `npm test && npx tsc --noEmit`
Expected: tutti i test PASS, zero errori TS.

- [ ] **Step 9.2: Lint**

Run: `npm run lint`
Expected: nessun nuovo errore (warning preesistenti tollerati).

- [ ] **Step 9.3: Verifica visiva — la fa Giovanni**

NON avviare dev server o preview (preferenza utente). Chiedere a Giovanni di controllare in locale:
1. Citazione dopo la hero: serif corsivo, backdrop ben visibile che emerge in dissolvenza.
2. Striscia di un film con logo "alto" (es. Ultimo Tango a Parigi): logo contenuto.
3. Muro loghi: più di 8 loghi se disponibili.
4. Weekend: strisce full-bleed con logo e orari, niente card.
5. Reveal: scrollando, i backdrop si dissolvono e i loghi emergono.
6. Calendario: tab giorni, righe con poster, prenotazione funzionante (drawer).
7. Festival: blocchi per festival con poster sotto; click sul poster → hero.
8. Console browser: nessun errore di hydration.
9. Mobile: tutte le sezioni nel viewport stretto.

- [ ] **Step 9.4: Eventuali fix da feedback + commit finale**
