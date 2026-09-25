# Sito pubblico in cabina — Tappa 3: il racconto

> **Per chi esegue:** si esegue inline, un compito alla volta (Giovanni non vuole subagenti). I passi usano le caselle (`- [ ]`).

**Obiettivo:** il racconto sotto l'hero si veste da Cabina: capitoli, stacchi, calendario, muro di locandine, tabellone e bollini di lingua e di proiezione. Il calendario della settimana sale al secondo posto, subito dopo l'apertura, e l'accento colorato che cambiava col genere lascia il posto all'ambra.

**Architettura:**
- **La sequenza** cambia in un punto solo, `buildStory`: il calendario si costruisce dove sta oggi e poi si sposta dopo l'apertura, così la scelta dei film per strisce, dissolvenze e muro resta identica.
- **La veste** cambia soprattutto nei CSS. `CinematicStory.module.css` (1.098 righe) si converte con uno script di sostituzioni esatte più una decina di regole riscritte per intero. `WeeklyCinemaCalendar`, `LanguageBadge` e `ProjectionSpecs` si riscrivono da zero, perché sono corti.
- **I colori che vivono in JavaScript** (effetti degli stacchi, palette del tabellone, fondo del muro) diventano costanti Cabina.

**Strumenti:** CSS Modules con le variabili `--c-*` (la home è `.cabina pubblico`), framer-motion (non si tocca), vitest.

**Specifica:** `docs/superpowers/specs/2026-09-25-sito-pubblico-cabina-design.md`, sezione 2, "Il racconto" (corretta il 25 settembre: il muro di locandine resta).

---

## Mappa dei file

| File | Cosa cambia |
|---|---|
| `src/components/CinematicStory/storyBuilder.ts` | calendario al secondo posto; via `StoryMood`, `buildMood`, `GENRE_ACCENTS` |
| `src/components/CinematicStory/storyBuilder.test.ts` | sequenze nuove; via i test di `buildMood` |
| `src/components/CinematicStory/CinematicStory.tsx` | via l'accento del genere; costanti `AMBER` e `INK`; fondo del muro |
| `src/components/CinematicStory/CinematicStory.module.css` | convertito a Cabina |
| `src/components/WeeklyCinemaCalendar/WeeklyCinemaCalendar.module.css` | riscritto |
| `src/components/LanguageBadge.module.css`, `src/components/ProjectionSpecs.module.css` | riscritti |
| `src/components/TextFlippingBoard/TextFlippingBoard.tsx` + `.module.css` | palette e fondo |
| `src/components/DriftWall/DriftWall.tsx` + `.module.css` | fondo e anello di selezione |
| `src/components/TextEffects/TextEffects.module.css`, `StrokeText.tsx`, `ParticleText.tsx` | colori di ripiego |

Non si toccano: `RatingBadge`, perché i colori del divieto servono anche a cassa, display e biglietto; `BookingDrawer`, `BookingFlow` e `SeatMap`, che sono della tappa 4.

`LanguageBadge` e `ProjectionSpecs` li usano solo il sito pubblico (calendario, prenotazione) e `MovieCard`, che se ne va nella tappa 5. Ci si assicura prima con:

```bash
grep -rln "LanguageBadge\|ProjectionSpecs" src | grep -v "^src/components/LanguageBadge\|^src/components/ProjectionSpecs"
```

Atteso: `BookingFlow.tsx`, `MovieCard.tsx`, `WeeklyCinemaCalendar.tsx`. Se compare un file di `admin/`, `Cassa/` o `display-esterno/`, ci si ferma: quel bollino va lasciato com'è e si fa una variante.

---

### Compito 1: il calendario sale, l'umore se ne va (test prima)

**File:**
- Modifica: `src/components/CinematicStory/storyBuilder.test.ts`
- Modifica: `src/components/CinematicStory/storyBuilder.ts`

- [ ] **Passo 1: aggiornare i test**

In `storyBuilder.test.ts`:

1. Nell'import della riga 2 si toglie `buildMood`.
2. Si toglie tutto il blocco `describe('buildMood', …)`.
3. In `'con 5 film completi produce la sequenza ricca'`:
   ```ts
       expect(kinds(chapters)).toEqual([
         'quote', 'calendar', 'stripes', 'stats', 'logos',
         'stripes', 'marquee', 'quote',
       ]);

       const opening = chapters[0] as QuoteChapter;
       const stripes = chapters[2] as StripesChapter;
       const logos = chapters[4] as LogosChapter;
   ```
4. Il test del reveal diventa:
   ```ts
     it('il reveal viene subito dopo il muro di loghi e serve almeno 2 film con visual', () => {
       const k = kinds(buildStory(Array.from({ length: 8 }, (_, i) => mk(i + 1))));
       expect(k.indexOf('reveal')).toBe(k.indexOf('logos') + 1);

       // Con 5 film resta un solo candidato → capitolo omesso.
       expect(kinds(buildStory([mk(1), mk(2), mk(3), mk(4), mk(5)]))).not.toContain('reveal');
     });
   ```
5. Nel test del festival, il titolo e la riga dell'indice diventano:
   ```ts
     it('crea il capitolo festival dopo i numeri solo se ci sono premiati', () => {
   ```
   ```ts
       expect(k.indexOf('festival')).toBe(k.indexOf('stats') + 1);
   ```
6. `'con un solo film resta una sequenza minima senza capitoli vuoti'`:
   ```ts
       expect(kinds(chapters)).toEqual(['quote', 'calendar', 'stats']);
   ```
7. Il test del weekend diventa:
   ```ts
     it('inserisce il capitolo weekend subito dopo i numeri', () => {
       const now = new Date('2026-07-15T10:00:00Z');
       const movies = [mk(1, { subevents: [{ date: '2026-07-18T19:00:00.000Z' }] }), mk(2), mk(3)];
       const k = kinds(buildStory(movies, now));
       expect(k).toContain('weekend');
       expect(k.indexOf('weekend')).toBe(k.indexOf('stats') + 1);
   ```
   Il resto del test non cambia.
8. Nel test `'apre con il carosello delle serate…'`, subito dopo `expect(chapters[0].kind).toBe('soirees');`:
   ```ts
       // Il calendario viene subito dopo l'apertura.
       expect(chapters[1].kind).toBe('calendar');
   ```
9. Nel test `'film senza tagline né trama non generano citazioni'`, dopo `expect(kinds(chapters)).not.toContain('quote');`:
   ```ts
       // Senza apertura il calendario apre il racconto.
       expect(chapters[0].kind).toBe('calendar');
   ```

- [ ] **Passo 2: verificare che falliscano**

```bash
npx vitest run src/components/CinematicStory/storyBuilder.test.ts
```

Atteso: FALLISCONO le sequenze (5 film, un film, reveal, festival, weekend, serate, senza tagline). Gli altri test passano.

- [ ] **Passo 3: spostare il calendario in `buildStory`**

In `storyBuilder.ts`, subito prima del `return chapters;` di `buildStory`:

```ts
  // Il calendario si costruisce al suo posto storico, così la scelta dei film
  // degli altri capitoli non cambia, e poi sale subito dopo l'apertura: è
  // l'unico punto della pagina da cui si vede la settimana intera.
  const calendarAt = chapters.findIndex(c => c.kind === 'calendar');
  if (calendarAt !== -1) {
    const [calendar] = chapters.splice(calendarAt, 1);
    const first = chapters[0];
    const hasOpening = first?.kind === 'soirees' || (first?.kind === 'quote' && openingQuoteId !== null);
    chapters.splice(hasOpening ? 1 : 0, 0, calendar);
  }
```

Il commento `// Nastro di poster in scorrimento continuo` sopra il `marquee` diventa `// Il muro di locandine in deriva (DriftWall)`.

- [ ] **Passo 4: togliere l'umore**

In `storyBuilder.ts` si tolgono:
- l'interfaccia `StoryMood` con il suo commento, righe 49–53 circa;
- `GENRE_ACCENTS`, `DEFAULT_ACCENT` e `buildMood` con i loro commenti, dal commento "Ogni genere ha la sua tinta" alla graffa che chiude `buildMood`.

Poi:

```bash
grep -rn "buildMood\|StoryMood\|GENRE_ACCENTS\|DEFAULT_ACCENT" src
```

Atteso: resta solo `CinematicStory.tsx`, che si sistema nel compito 2.

- [ ] **Passo 5: verificare che passino**

```bash
npx vitest run src/components/CinematicStory/storyBuilder.test.ts
```

Atteso: PASSA tutto il file.

Il commit si fa alla fine del compito 2, perché fino ad allora `CinematicStory.tsx` non compila.

---

### Compito 2: `CinematicStory.tsx` senza accento del genere

**File:** Modifica: `src/components/CinematicStory/CinematicStory.tsx`

- [ ] **Passo 1: le modifiche**

1. Riga 12: `import { buildMood, buildStory, …` → `import { buildStory, …` (si toglie solo `buildMood`).
2. Sotto `const easeApple …` si aggiunge:
   ```ts
   // I colori di Cabina per gli effetti che li vogliono in JavaScript e non in
   // CSS (particelle, tratto, onde). Gli stessi di components/cabina/cabina.css.
   const AMBER = '#e8a33d';
   const INK = '#efe6d8';
   ```
3. Il commento di `selectMovie`, "invoca la stessa logica del click sui poster in galleria", diventa "invoca la stessa logica del clic sulla striscia di locandine".
4. `TitleInterstitial` perde la prop `accent`: la firma diventa `function TitleInterstitial({ movie, variant }: { movie: GroupedMovie; variant: InterstitialStyle })`. Nel corpo:
   - `style={{ color: accent }}` → `style={{ color: AMBER }}`;
   - `ParticleText`: `color="#ffffff"` → `color={INK}`, `highlightColor={accent}` → `highlightColor={AMBER}`;
   - `StrokeText`: `strokeColor={accent}` → `strokeColor={AMBER}`, `fillColor="#f8fafc"` → `fillColor={INK}`.
5. In `MarqueeChapter`: `overlayColor="#05050a"` → `overlayColor="#100d0a"`.
6. Nel componente principale si tolgono le tre righe dell'umore (i due commenti e `const mood = buildMood(movies);`). Poi:
   - `<div className={styles.story} style={{ '--story-accent': mood.accent } as CSSProperties}>` → `<div className={styles.story}>`;
   - `<TitleInterstitial movie={pick.movie} variant={pick.variant} accent={mood.accent} />` → `<TitleInterstitial movie={pick.movie} variant={pick.variant} />`.

`CSSProperties` resta importato: lo usa il reveal (`'--reveal-count'`).

- [ ] **Passo 2: tipi e test**

```bash
npx tsc --noEmit && npm test
```

Atteso: nessun errore, tutti i test verdi.

- [ ] **Passo 3: commit**

```bash
git add src/components/CinematicStory/storyBuilder.ts src/components/CinematicStory/storyBuilder.test.ts src/components/CinematicStory/CinematicStory.tsx
git commit -m "Il calendario sale subito dopo l'apertura, e il racconto ha un accento solo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Compito 3: `CinematicStory.module.css` in Cabina

**File:** Modifica: `src/components/CinematicStory/CinematicStory.module.css`

- [ ] **Passo 1: lo script di conversione**

Si salva in `scratchpad/cabina-story.py` (non nel repository) e si lancia dalla radice del progetto. Prima riscrive per intero le regole di primo livello che cambiano carattere, poi sostituisce le variabili vecchie in tutto il file.

```python
import re, sys

PATH = 'src/components/CinematicStory/CinematicStory.module.css'
css = open(PATH).read()

BLOCKS = {
'.story': '''.story {
  position: relative;
  background: var(--c-bg);
  overflow-x: clip;
}''',
'.chapterKicker': '''.chapterKicker {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.85rem;
  color: var(--c-amber);
  font-family: var(--c-font-mono);
  font-size: 0.75rem;
  letter-spacing: 0.24em;
  text-transform: uppercase;
}''',
'.timeChip': '''.timeChip {
  padding: 0.3rem 0.6rem;
  border-radius: 4px;
  border: 1px solid rgba(232, 163, 61, 0.4);
  background: rgba(16, 13, 10, 0.6);
  font-family: var(--c-font-mono);
  font-size: 0.9rem;
  font-variant-numeric: tabular-nums;
  color: var(--c-amber);
  white-space: nowrap;
}''',
'.metaChip': '''.metaChip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.24rem 0.55rem;
  border-radius: 4px;
  border: 1px solid var(--c-line-strong);
  background: rgba(16, 13, 10, 0.5);
  font-family: var(--c-font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--c-ink);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}''',
'.quoteMovie': '''.quoteMovie {
  margin: 0;
  color: var(--c-dim);
  font-family: var(--c-font-mono);
  font-size: 0.8rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}''',
'.stripeDirector': '''.stripeDirector {
  font-family: var(--c-font-serif);
  font-style: italic;
  font-size: 1.05rem;
  color: var(--c-ink);
  text-shadow: 0 1px 12px rgba(0, 0, 0, 0.8);
}''',
'.stripeTitle': '''.stripeTitle {
  font-family: var(--c-font-serif);
  font-size: clamp(1.8rem, 4.5vw, 3.4rem);
  font-weight: 600;
  line-height: 1;
  color: var(--c-ink);
  text-shadow: 0 2px 24px rgba(0, 0, 0, 0.85);
}''',
'.statValue': '''.statValue {
  font-family: var(--c-font-mono);
  font-size: clamp(2.6rem, 6vw, 4.5rem);
  font-weight: 400;
  line-height: 1;
  letter-spacing: -0.02em;
  color: var(--c-amber);
  font-variant-numeric: tabular-nums;
}''',
'.statLabel': '''.statLabel {
  color: var(--c-dim);
  font-family: var(--c-font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}''',
'.festivalName': '''.festivalName {
  margin: 0;
  font-family: var(--c-font-serif);
  font-size: clamp(1.1rem, 2.2vw, 1.6rem);
  font-weight: 600;
  color: var(--c-ink);
}''',
'.festivalAward': '''.festivalAward {
  color: var(--c-amber);
  font-family: var(--c-font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.06em;
  line-height: 1.3;
  text-transform: uppercase;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}''',
'.soireeDayLine': '''.soireeDayLine {
  color: var(--c-amber);
  font-family: var(--c-font-mono);
  font-size: 0.8rem;
  letter-spacing: 0.26em;
  text-transform: uppercase;
  text-shadow: 0 1px 14px rgba(0, 0, 0, 0.8);
}''',
'.soireeTitle': '''.soireeTitle {
  font-family: var(--c-font-serif);
  font-size: clamp(2rem, 4.5vw, 3.6rem);
  font-weight: 600;
  line-height: 1;
  color: var(--c-ink);
  text-shadow: 0 2px 26px rgba(0, 0, 0, 0.85);
}''',
'.soireeByline': '''.soireeByline {
  color: #cbbfae;
  font-family: var(--c-font-mono);
  font-size: 0.75rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  text-shadow: 0 1px 12px rgba(0, 0, 0, 0.8);
}''',
'.weekendTitle': '''.weekendTitle {
  margin: 0;
  font-family: var(--c-font-serif);
  font-size: clamp(2rem, 5.5vw, 4rem);
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.01em;
  text-align: center;
  color: var(--c-ink);
}''',
'.weekendPanelName': '''.weekendPanelName {
  font-family: var(--c-font-serif);
  font-size: clamp(1.7rem, 3.2vw, 2.6rem);
  font-weight: 600;
  color: var(--c-ink);
  text-shadow: 0 2px 24px rgba(0, 0, 0, 0.8);
}''',
'.weekendPanelDate': '''.weekendPanelDate {
  color: #cbbfae;
  font-family: var(--c-font-mono);
  font-size: 0.75rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  text-shadow: 0 1px 10px rgba(0, 0, 0, 0.8);
}''',
'.weekendNowTitle': '''.weekendNowTitle {
  font-family: var(--c-font-serif);
  font-size: clamp(1.4rem, 2.8vw, 2.2rem);
  font-weight: 600;
  color: var(--c-ink);
  text-shadow: 0 2px 20px rgba(0, 0, 0, 0.85);
}''',
'.interstitialWord': '''.interstitialWord {
  display: block;
  font-family: var(--c-font-serif);
  font-size: clamp(2rem, 7vw, 5rem);
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.02em;
  color: var(--c-ink);
  word-break: break-word;
  transition: opacity 0.35s ease;
}''',
}

for selector, block in BLOCKS.items():
    # Solo la regola di primo livello (colonna 0), non quelle nelle media query.
    pattern = re.compile(r'(?ms)^' + re.escape(selector) + r' \{\n.*?^\}')
    css, n = pattern.subn(lambda m: block, css, count=1)
    if n != 1:
        sys.exit(f'regola non trovata: {selector}')

# Il commento sulla tinta della settimana non ha più senso.
css = css.replace('/* Il trattino sopra i kicker prende il colore della settimana. */', '/* Il trattino ambra sopra i kicker. */')
css = css.replace('/* Il giorno prende il colore della settimana. */\n', '')
css = css.replace('/* Il punto accanto al giorno prende il colore della settimana. */', '/* Il punto ambra accanto al giorno. */')
css = css.replace('con il colore della settimana', 'in ambra')

SUBS = [
    ("var(--font-serif-display), Georgia, 'Times New Roman', serif", 'var(--c-font-serif)'),
    ('var(--font-serif-display), Georgia, serif', 'var(--c-font-serif)'),
    ('var(--font-apple)', 'var(--c-font-sans)'),
    ('var(--background)', 'var(--c-bg)'),
    ('var(--foreground)', 'var(--c-ink)'),
    ('var(--text-muted)', 'var(--c-dim)'),
    ('var(--story-accent)', 'var(--c-amber)'),
    ('var(--surface-border)', 'var(--c-line)'),
    ('var(--surface)', 'var(--c-bg-raised)'),
    ('var(--glass-border)', 'var(--c-line-strong)'),
    ('var(--transition-snappy)', 'transform var(--c-fast), opacity var(--c-fast)'),
    ('rgba(5, 5, 7, ', 'rgba(16, 13, 10, '),
    ('#0a0a0d', 'var(--c-bg-sunken)'),
]
for old, new in SUBS:
    css = css.replace(old, new)

# Il bianco freddo diventa l'inchiostro caldo di Cabina.
css = re.sub(r'color: rgba\(255, 255, 255, 0\.[89]\d*\)', 'color: var(--c-ink)', css)
css = re.sub(r'color: rgba\(255, 255, 255, 0\.[4-7]\d*\)', 'color: #cbbfae', css)
css = css.replace('rgba(255, 255, 255, ', 'rgba(239, 230, 216, ')

open(PATH, 'w').write(css)
print('ok')
```

```bash
python3 <scratchpad>/cabina-story.py
```

Atteso: `ok`.

- [ ] **Passo 2: non deve restare niente del sito viola**

```bash
grep -n "font-apple\|text-muted\|story-accent\|--background\|--foreground\|--surface\|--glass\|--transition\|5, 5, 7\|background-clip\|serif-display\|255, 255, 255" src/components/CinematicStory/CinematicStory.module.css
```

Atteso: nessuna riga. Se ne resta qualcuna, si corregge a mano con lo stesso criterio dello script.

- [ ] **Passo 3: tipi**

```bash
npx tsc --noEmit
```

Atteso: nessun errore.

- [ ] **Passo 4: commit**

```bash
git add src/components/CinematicStory/CinematicStory.module.css
git commit -m "Il racconto si veste da cabina: titoli in Fraunces, orari e numeri in mono ambra

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Compito 4: il calendario della settimana

**File:** Riscrive: `src/components/WeeklyCinemaCalendar/WeeklyCinemaCalendar.module.css`

Il TSX non cambia: stesse classi, stesso contenuto. Le righe del calendario diventano come quelle della tabella dell'hero, con l'orario in mono ambra e il titolo in Fraunces, su righe separate da un filo.

- [ ] **Passo 1: il nuovo foglio**

```css
/* === La settimana in sala, in veste Cabina ===
 * Le variabili vengono da components/cabina/cabina.css: la home è una
 * `.cabina`. Le righe sono sorelle della tabella orari dell'hero: orario in
 * mono ambra, titolo in Fraunces, un filo fra una riga e l'altra. */

.calendarContainer {
  display: flex;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  padding: 24px 24px 48px;
}

.calendarWrapper {
  display: flex;
  flex-direction: column;
  gap: 28px;
  width: min(880px, 100%);
}

/* --- Intestazione --- */
.header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}

.kicker {
  font-family: var(--c-font-mono);
  font-size: 11px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--c-amber);
}

.title {
  margin: 0;
  font-family: var(--c-font-serif);
  font-size: clamp(2rem, 5.5vw, 3.5rem);
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.01em;
  color: var(--c-ink);
}

.weekNav {
  display: flex;
  align-items: center;
  gap: 14px;
}

.dateRange {
  min-width: 210px;
  font-family: var(--c-font-mono);
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--c-dim);
  font-variant-numeric: tabular-nums;
}

.navButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--c-line-strong);
  border-radius: var(--c-radius);
  background: none;
  color: var(--c-ink);
  cursor: pointer;
  transition: border-color var(--c-fast), color var(--c-fast);
}

.navButton:hover {
  border-color: var(--c-amber);
  color: var(--c-amber);
}

/* --- Linguette dei giorni --- */
.dayTabs {
  display: flex;
  justify-content: center;
  gap: 6px;
  padding: 4px;
  overflow-x: auto;
  scrollbar-width: none;
}

.dayTabs::-webkit-scrollbar {
  display: none;
}

.dayTab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  min-width: 60px;
  padding: 8px 10px 7px;
  border: 1px solid var(--c-line);
  border-radius: var(--c-radius);
  background: none;
  cursor: pointer;
  transition: border-color var(--c-fast), background var(--c-fast);
}

.dayTab:hover {
  border-color: var(--c-line-strong);
}

.dayTabActive {
  border-color: var(--c-amber);
  background: var(--c-amber-soft);
}

.dayTabName {
  font-family: var(--c-font-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--c-dim);
}

.dayTabNumber {
  font-family: var(--c-font-mono);
  font-size: 18px;
  color: var(--c-ink);
  font-variant-numeric: tabular-nums;
}

.dayTabActive .dayTabName,
.dayTabActive .dayTabNumber {
  color: var(--c-amber);
}

/* Oggi: il numero sottolineato in ambra. */
.dayTabToday .dayTabNumber {
  text-decoration: underline;
  text-decoration-color: var(--c-amber);
  text-underline-offset: 4px;
}

/* Puntino: il giorno ha spettacoli in programma. */
.dayTabDot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: transparent;
}

.dayTabDotOn {
  background: var(--c-dim);
}

.dayTabActive .dayTabDotOn {
  background: var(--c-amber);
}

/* --- Il giorno scelto --- */
.dayPanel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 220px;
}

.dayPanelTitle {
  margin: 0;
  text-align: center;
  font-family: var(--c-font-mono);
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--c-dim);
}

.screeningList {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--c-line);
}

.screeningRow {
  display: flex;
  align-items: center;
  gap: 18px;
  width: 100%;
  padding: 12px 8px;
  border: 0;
  border-bottom: 1px solid var(--c-line);
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background var(--c-fast);
}

.screeningRow:hover:not(:disabled) {
  background: var(--c-bg-raised);
}

.screeningTime {
  min-width: 74px;
  font-family: var(--c-font-mono);
  font-size: clamp(1.2rem, 3vw, 1.5rem);
  color: var(--c-amber);
  font-variant-numeric: tabular-nums;
}

.screeningPoster {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 40px;
  aspect-ratio: 2 / 3;
  border: 1px solid var(--c-line);
  border-radius: 3px;
  overflow: hidden;
  background: var(--c-bg-raised);
  color: var(--c-dim);
}

.screeningInfo {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.screeningTitle {
  overflow: hidden;
  font-family: var(--c-font-serif);
  font-size: 1.1rem;
  color: var(--c-ink);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.screeningSub {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.screeningRoom {
  font-family: var(--c-font-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--c-dim);
}

.buyHint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: 1px solid var(--c-amber);
  border-radius: var(--c-radius);
  font-family: var(--c-font-mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--c-amber);
  white-space: nowrap;
  transition: background var(--c-fast), color var(--c-fast);
}

.screeningRow:hover:not(:disabled) .buyHint {
  background: var(--c-amber);
  color: var(--c-amber-ink);
}

/* --- Esaurito --- */
.screeningSoldOut {
  cursor: not-allowed;
  opacity: 0.55;
}

.screeningSoldOut .screeningTime {
  color: var(--c-dim);
  text-decoration: line-through;
}

.esauritoBadge {
  padding: 7px 12px;
  border: 1px solid var(--c-line);
  border-radius: var(--c-radius);
  font-family: var(--c-font-mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--c-dim);
  white-space: nowrap;
}

.emptyState {
  padding: 48px 16px;
  text-align: center;
  font-family: var(--c-font-mono);
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--c-dim);
}

@media (max-width: 768px) {
  .calendarContainer {
    padding: 24px 16px 48px;
  }

  .dayTabs {
    justify-content: flex-start;
  }

  .screeningRow {
    gap: 12px;
    padding: 10px 4px;
  }

  .screeningTime {
    min-width: 54px;
  }

  .buyHint {
    gap: 0;
    padding: 8px;
    font-size: 0;
  }

  .buyHint svg {
    width: 15px;
    height: 15px;
  }
}
```

- [ ] **Passo 2: controllare che il TSX non usi classi sparite**

```bash
grep -o "styles\.[a-zA-Z]*" src/components/WeeklyCinemaCalendar/WeeklyCinemaCalendar.tsx | sort -u
```

Ogni nome dell'elenco deve esistere nel nuovo foglio. Se ne manca uno, si aggiunge con lo stesso stile.

---

### Compito 5: i bollini di lingua e di proiezione

**File:**
- Riscrive: `src/components/LanguageBadge.module.css`
- Riscrive: `src/components/ProjectionSpecs.module.css`

- [ ] **Passo 1: `LanguageBadge.module.css`**

```css
/*
 * I bollini di lingua, in veste Cabina. Li usa solo il sito pubblico
 * (calendario e prenotazione), che sta dentro una `.cabina`: i valori dopo la
 * virgola servono se un giorno un bollino finisse fuori.
 *
 * La lingua è ambra piena; sottotitoli e versione stanno a contorno, come i
 * bollini di proiezione (ProjectionSpecs.module.css).
 */

.badgeContainer {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--c-font-mono, ui-monospace, monospace);
  letter-spacing: 0.1em;
}

.langBadge {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3px 8px;
  border: 1px solid rgba(232, 163, 61, 0.45);
  border-radius: 3px;
  background: var(--c-amber-soft, rgba(232, 163, 61, 0.12));
  color: var(--c-amber, #e8a33d);
  font-size: 0.68rem;
  text-transform: uppercase;
}

.subBadge,
.versionBadge {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border: 1px solid var(--c-line-strong, #3a3128);
  border-radius: 3px;
  background: none;
  color: var(--c-ink, #efe6d8);
  font-size: 0.66rem;
  text-transform: uppercase;
}

.versionBadge {
  color: var(--c-dim, #8a7d6c);
}

.icon {
  color: currentColor;
  opacity: 0.8;
}

.sm {
  gap: 4px;
}

.sm .langBadge,
.sm .subBadge,
.sm .versionBadge {
  padding: 2px 6px;
  font-size: 0.6rem;
}

.sm .icon {
  width: 10px;
  height: 10px;
}

.xs {
  gap: 3px;
}

.xs .langBadge,
.xs .subBadge,
.xs .versionBadge {
  padding: 1px 4px;
  font-size: 0.55rem;
  letter-spacing: 0.06em;
}

.xs .icon {
  width: 8px;
  height: 8px;
}

.lg .langBadge,
.lg .subBadge,
.lg .versionBadge {
  padding: 5px 12px;
  font-size: 0.85rem;
}

.lg .icon {
  width: 16px;
  height: 16px;
}
```

- [ ] **Passo 2: `ProjectionSpecs.module.css`**

```css
/*
 * I bollini della qualità di proiezione, in veste Cabina.
 *
 * Stessa famiglia dei bollini di lingua (LanguageBadge.module.css), ma a
 * contorno color inchiostro: la lingua è ambra piena, così chi guarda li
 * distingue senza leggerli. Parlano di come si vede, non di che lingua si
 * sente.
 */

.badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-family: var(--c-font-mono, ui-monospace, monospace);
  letter-spacing: 0.1em;
}

.badge {
  padding: 3px 8px;
  border: 1px solid var(--c-line-strong, #3a3128);
  border-radius: 3px;
  color: var(--c-ink, #efe6d8);
  font-size: 0.66rem;
  line-height: 1.25;
  text-transform: uppercase;
  white-space: nowrap;
}

.sm {
  gap: 4px;
}

.sm .badge {
  padding: 2px 6px;
  font-size: 0.6rem;
}

.xs {
  gap: 3px;
}

.xs .badge {
  padding: 1px 4px;
  font-size: 0.55rem;
  letter-spacing: 0.06em;
}

/* ── La riga estesa della scheda film ─────────────────────────────────────── */

.line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  margin-top: 10px;
  font-family: var(--c-font-mono, ui-monospace, monospace);
  font-size: 0.72rem;
  letter-spacing: 0.1em;
}

.lineLabel {
  color: var(--c-dim, #8a7d6c);
}

.lineItem {
  color: var(--c-ink, #efe6d8);
  text-transform: uppercase;
  cursor: help;
}

.lineSep {
  color: var(--c-line-strong, #3a3128);
}

@media (max-width: 768px) {
  .line {
    gap: 5px;
    margin-top: 8px;
    font-size: 0.66rem;
  }
}
```

- [ ] **Passo 3: tipi, poi commit dei compiti 4 e 5**

```bash
npx tsc --noEmit
git add src/components/WeeklyCinemaCalendar/WeeklyCinemaCalendar.module.css src/components/LanguageBadge.module.css src/components/ProjectionSpecs.module.css
git commit -m "Il calendario e i bollini di lingua e proiezione si vestono da cabina

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Compito 6: tabellone, muro di locandine ed effetti

**File:**
- Modifica: `src/components/TextFlippingBoard/TextFlippingBoard.tsx` (righe 20–37 circa)
- Modifica: `src/components/TextFlippingBoard/TextFlippingBoard.module.css`
- Modifica: `src/components/DriftWall/DriftWall.tsx:85`, `src/components/DriftWall/DriftWall.module.css`
- Modifica: `src/components/TextEffects/TextEffects.module.css:3`, `StrokeText.tsx:45-46`, `ParticleText.tsx:105`

- [ ] **Passo 1: le palette del tabellone**

In `TextFlippingBoard.tsx`, `ACCENT_COLORS`, `RESTING` e `FALLING_FLAP` diventano:

```ts
// Mentre gira, una palette passa per i colori di Cabina: ambra, rosso
// allarme, salvia e inchiostro. Ferma, è nero caldo con la lettera chiara.
const ACCENT_COLORS: AccentColor[] = [
  { top: '#e8a33d', bottom: '#d4912f', text: '#1a130b' },
  { top: '#d4553a', bottom: '#bf4a31', text: '#efe6d8' },
  { top: '#9bb07a', bottom: '#8a9f6a', text: '#1a130b' },
  { top: '#efe6d8', bottom: '#e2d8c8', text: '#1a130b' },
];

const RESTING = { top: '#17130f', bottom: '#17130f', text: '#efe6d8' };
const FALLING_FLAP = { top: '#221c16', text: '#efe6d8' };
```

- [ ] **Passo 2: il fondo e il carattere del tabellone**

```bash
grep -n "#171717\|255, 255, 255, 0.85\|SFMono-Regular" src/components/TextFlippingBoard/TextFlippingBoard.module.css
```

Nelle righe trovate:
- `background: #171717;` → `background: #0b0907;`;
- `outline: 2px solid rgba(255, 255, 255, 0.85);` → `outline: 2px solid #e8a33d;`;
- `font-family: 'SFMono-Regular', 'Roboto Mono', Menlo, monospace;` → `font-family: var(--c-font-mono, 'SFMono-Regular', 'Roboto Mono', Menlo, monospace);`.

I neri puri (`#000`) delle cerniere e delle ombre restano: sono ombre, non colori.

- [ ] **Passo 3: il muro di locandine**

- `DriftWall.tsx:85`: `overlayColor = '#060010',` → `overlayColor = '#100d0a',`.
- `DriftWall.module.css`:
  - `--dw-overlay: #060010;` → `--dw-overlay: #100d0a;`;
  - `background: #0b0b12;` → `background: #17130f;`;
  - `0 0 0 2px rgba(255, 255, 255, 0.9);` → `0 0 0 2px #e8a33d;`.

- [ ] **Passo 4: i ripieghi degli effetti**

- `TextEffects.module.css:3`: `color: var(--text-muted);` → `color: var(--c-dim, #8a7d6c);`.
- `StrokeText.tsx`: `strokeColor = '#A78BFA',` → `strokeColor = '#E8A33D',` e `fillColor = '#F8FAFC',` → `fillColor = '#EFE6D8',`.
- `ParticleText.tsx:105`: `highlightColor = '#8b5cf6',` → `highlightColor = '#e8a33d',`.

- [ ] **Passo 5: niente viola nel racconto**

```bash
grep -rn -i "8b5cf6\|a78bfa\|7c3aed\|168, 85, 247\|139, 92, 246\|060010\|05050a" src/components/CinematicStory src/components/WeeklyCinemaCalendar src/components/TextFlippingBoard src/components/DriftWall src/components/TextEffects src/components/LanguageBadge.module.css src/components/ProjectionSpecs.module.css
```

Atteso: nessuna riga.

- [ ] **Passo 6: tipi, test, commit**

```bash
npx tsc --noEmit && npm test
git add src/components/TextFlippingBoard src/components/DriftWall src/components/TextEffects
git commit -m "Il tabellone, il muro di locandine e gli stacchi prendono i colori della cabina

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Compito 7: resoconto per Giovanni

**File:** nessuno. Il dev server **non** si avvia.

- [ ] **Passo 1: ultimo controllo**

```bash
npx tsc --noEmit && npm test && git status --short
```

- [ ] **Passo 2: cosa provare**
- **Ordine:** sotto l'hero, le prossime serate, poi subito il calendario della settimana. "Tutti gli orari ↓" dell'hero porta lì.
- **Calendario:** linguette dei giorni con il giorno scelto in ambra e oggi sottolineato; righe con orario ambra e titolo in Fraunces; "Prenota" a contorno che si riempie passandoci sopra; esauriti barrati; frecce della settimana.
- **Bollini:** la lingua in ambra, i sottotitoli e le specifiche (4K, Atmos…) a contorno. Il divieto ha ancora i suoi colori.
- **Capitoli:**
  - serate: giorno in mono ambra, gancio in Fraunces corsivo, orari ambra;
  - strisce con i loghi;
  - numeri in mono ambra;
  - muro di loghi;
  - weekend: nomi dei giorni in Fraunces, punto ambra;
  - dissolvenze;
  - festival: nome in Fraunces, premio in ambra;
  - muro di locandine su nero caldo;
  - citazione in Fraunces corsivo.
- **Stacchi:** i titoli in grande, con gli effetti in ambra e inchiostro, non più viola.
- **Tabellone** in fondo: palette nere calde; mentre girano passano per ambra, rosso, salvia e crema.
- **Telefono:** tutto sopra, e lo scorrimento è fluido come prima: lo script non tocca `content-visibility` né le animazioni.
- **La prenotazione** (cassetto) è ancora viola: tocca alla tappa 4.
