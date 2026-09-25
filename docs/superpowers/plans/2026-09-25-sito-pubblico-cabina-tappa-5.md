# Sito pubblico in cabina — Tappa 5: il biglietto in pagina e la pulizia

> **Per chi esegue:** si esegue inline, un compito alla volta (Giovanni non vuole subagenti). I passi usano le caselle (`- [ ]`).

**Obiettivo:**
- **La conferma mostra il biglietto** (C2): subito nel cassetto dopo "Conferma" e su `/success`, con lo stesso componente, `TicketCard`. Contiene logo o titolo, quando, posto, sala e QR, e si sfoglia se i posti sono più di uno.
- **I vecchi link a `/movie/:id`** aprono la home su quel film. Con `?subevent=` aprono anche la prenotazione su quello spettacolo, se è ancora in vendita.
- **Si tolgono i file che nessuno usa più**, e con loro gli ultimi resti di viola del sito pubblico.

**Architettura:**
- **`TicketCard`** è un componente di sola vista: riceve i dati del biglietto e tiene solo l'indice del biglietto mostrato. Il PDF resta `TicketPDF`, generato come oggi da un'area nascosta: è del progetto 4.
- **`CheckoutButton`** perde l'anteprima (finestra e carosello) e al suo posto mostra `TicketCard`. Il suo foglio di stile si riscrive con le sole classi rimaste.
- **Il reindirizzamento** sta in `next.config.ts` accanto a quelli del gestionale. La scelta dello spettacolo da aprire è una funzione pura in `heroData.ts`.

**Strumenti:** Next.js 16, `qrcode.react` (c'è già), CSS Modules con `--c-*`, vitest.

**Specifica:** sezioni 4 e 5 di `docs/superpowers/specs/2026-09-25-sito-pubblico-cabina-design.md`.

**Attenzione:** una sessione a parte sta spostando sul server le chiamate a TMDB di `CheckoutButton.handleCheckout`. Questa tappa **non tocca `handleCheckout`**, così l'unione dei due lavori resta semplice.

---

## Mappa dei file

| File | Cosa cambia |
|---|---|
| `src/components/MovieShowcase/heroData.ts` + test | `pickInitialSubeventId` |
| `src/components/MovieShowcase/MovieShowcase.tsx`, `src/app/page.tsx` | la prenotazione si apre da sola con `?subevent=` |
| `next.config.ts`, `src/config/adminRedirects.test.ts`, `src/config/publicRedirects.test.ts` (nuovo) | `/movie/:id` → `/?film=:id` |
| `src/components/TicketCard/TicketCard.tsx` + `.module.css` (nuovi) | il biglietto in pagina |
| `src/components/CheckoutButton.tsx` + `.module.css` | conferma con `TicketCard`, via l'anteprima; foglio riscritto |
| `src/app/success/page.tsx` + `success.module.css` | riscritti |
| `src/components/BookingFlow.tsx`, `src/components/BookingFlow.module.css` | via l'elenco di tutte le proiezioni |
| eliminati | `src/app/movie/`, `src/components/MovieCard.*`, `src/components/MovieGallery/`, `src/components/AdminSearch.*` |

---

### Compito 1: quale spettacolo aprire da un vecchio link (test prima)

**File:** `src/components/MovieShowcase/heroData.test.ts`, `src/components/MovieShowcase/heroData.ts`

- [ ] **Passo 1: i test**, in fondo a `heroData.test.ts` (e `pickInitialSubeventId` nell'import):

```ts
describe('pickInitialSubeventId', () => {
  const movies = [
    { id: 10, subevents: [{ id: 1, isSoldOut: false }, { id: 2, isSoldOut: true }] },
    { id: 20, subevents: [{ id: 3, isSoldOut: false }] },
  ];
  it('apre lo spettacolo chiesto se è del film e si può ancora prenotare', () => {
    expect(pickInitialSubeventId(movies, 10, '1')).toBe(1);
  });
  it('ignora uno spettacolo esaurito, di un altro film o sconosciuto', () => {
    expect(pickInitialSubeventId(movies, 10, '2')).toBeNull();
    expect(pickInitialSubeventId(movies, 10, '3')).toBeNull();
    expect(pickInitialSubeventId(movies, 10, '99')).toBeNull();
    expect(pickInitialSubeventId(movies, 10, 'abc')).toBeNull();
  });
  it('senza film o senza spettacolo non apre niente', () => {
    expect(pickInitialSubeventId(movies, null, '1')).toBeNull();
    expect(pickInitialSubeventId(movies, 10, undefined)).toBeNull();
  });
});
```

- [ ] **Passo 2:** `npx vitest run src/components/MovieShowcase/heroData.test.ts`. Atteso: FALLISCE (`pickInitialSubeventId` non esiste).

- [ ] **Passo 3: la funzione**, in fondo a `heroData.ts`:

```ts
/**
 * `?subevent=`: i vecchi link della pagina film potevano portare dritti a uno
 * spettacolo. Si apre la prenotazione solo se lo spettacolo è del film scelto
 * e si può ancora prenotare; altrimenti basta la home su quel film.
 */
export function pickInitialSubeventId(
  movies: { id: number; subevents: { id: number; isSoldOut?: boolean }[] }[],
  movieId: number | null,
  subevent?: string | string[] | null
): number | null {
  const raw = Array.isArray(subevent) ? subevent[0] : subevent;
  if (movieId == null || !raw || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  const movie = movies.find(m => m.id === movieId);
  const show = movie?.subevents.find(s => s.id === id);
  return show && !show.isSoldOut ? id : null;
}
```

- [ ] **Passo 4:** di nuovo il test. Atteso: PASSA.

- [ ] **Passo 5: la home apre la prenotazione**

`src/app/page.tsx`: `const { film } = await searchParams;` diventa `const { film, subevent } = await searchParams;`. Sotto `initialMovieId`:

```ts
  const initialSubeventId = pickInitialSubeventId(movies, initialMovieId, subevent);
```

`pickInitialSubeventId` si aggiunge all'import da `heroData`, e `MovieShowcase` riceve `initialSubeventId={initialSubeventId}`.

`src/components/MovieShowcase/MovieShowcase.tsx`:
- nelle props, sotto `initialMovieId`:
  ```ts
  /** Da `?subevent=`: la prenotazione parte già aperta su questo spettacolo. */
  initialSubeventId?: number | null;
  ```
- la firma riceve `initialSubeventId`;
- i due stati diventano:
  ```ts
  const [drawerOpen, setDrawerOpen] = useState(initialSubeventId != null);
  const [checkoutSubeventId, setCheckoutSubeventId] = useState<number | null>(initialSubeventId ?? null);
  ```

- [ ] **Passo 6:** `npx tsc --noEmit && npm test`, poi commit:

```bash
git add src/components/MovieShowcase/heroData.ts src/components/MovieShowcase/heroData.test.ts src/components/MovieShowcase/MovieShowcase.tsx src/app/page.tsx
git commit -m "Un vecchio link a uno spettacolo apre la home già in sala

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Compito 2: `/movie/:id` porta alla home (test prima)

**File:** `src/config/publicRedirects.test.ts` (nuovo), `src/config/adminRedirects.test.ts`, `next.config.ts`

- [ ] **Passo 1: il test nuovo**

```ts
import { describe, it, expect } from 'vitest';
import nextConfig from '../../next.config';

describe('redirects del sito pubblico', () => {
  it('la vecchia pagina del film apre la home su quel film', async () => {
    const list = await nextConfig.redirects!();
    const movie = list.find((r) => r.source === '/movie/:id');
    // `?subevent=` passa da solo: Next porta avanti la query della richiesta.
    expect(movie).toMatchObject({ destination: '/?film=:id', permanent: false });
  });
});
```

- [ ] **Passo 2: il test del gestionale guarda solo i suoi**

In `adminRedirects.test.ts`, il terzo test controlla che ogni destinazione sia una stanza: con `/movie/:id` fallirebbe. Diventa:

```ts
  it('puntano solo a stanze che esistono', async () => {
    const list = await nextConfig.redirects!();
    const hrefs = new Set(ROOMS.map((r) => r.href));
    for (const r of list.filter((r) => r.source.startsWith('/admin'))) {
      expect(hrefs.has(r.destination)).toBe(true);
    }
  });
```

- [ ] **Passo 3:** `npx vitest run src/config`. Atteso: FALLISCE solo il test nuovo.

- [ ] **Passo 4: il reindirizzamento**

In `next.config.ts`, in fondo all'elenco di `redirects()`:

```ts
      // La pagina del film non c'è più: i link vecchi (post, messaggi, app)
      // aprono la home su quel film. `?subevent=` passa da solo, e la home
      // apre la prenotazione se lo spettacolo è ancora in vendita.
      { source: '/movie/:id', destination: '/?film=:id', permanent: false },
```

- [ ] **Passo 5:** `npx vitest run src/config`. Atteso: PASSA.

- [ ] **Passo 6: via la pagina e i pezzi che la servivano**

```bash
grep -rn "MovieCard\|MovieGallery\|AdminSearch" src | grep -v "^src/components/MovieCard\|^src/components/MovieGallery/\|^src/components/AdminSearch"
```

Atteso: nessuna riga. Poi:

```bash
git rm -r src/app/movie src/components/MovieGallery src/components/MovieCard.tsx src/components/MovieCard.module.css src/components/AdminSearch.tsx src/components/AdminSearch.module.css
npx tsc --noEmit && npm test
```

Atteso: nessun errore, test verdi.

- [ ] **Passo 7:** commit:

```bash
git add next.config.ts src/config
git commit -m "La pagina del film se ne va, e i suoi link portano alla home su quel film

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Compito 3: senza pagina film, niente elenco di tutte le proiezioni

**File:** `src/components/BookingFlow.tsx`, `src/components/BookingFlow.module.css`

La prenotazione ora si apre sempre su uno spettacolo, dall'hero o dal calendario. L'elenco di tutte le proiezioni lo usava solo la pagina film.

- [ ] **Passo 1: `BookingFlow.tsx`**
1. Si toglie `handleSubeventSelect`, usata solo dall'elenco.
2. Nell'esaurito, `action={!subeventId ? ( … ) : undefined}` si toglie del tutto: "Scegli un altro orario" valeva solo senza spettacolo, e ora c'è "Cambia orario" nella colonna.
3. Subito prima di `// ── La sala e la colonna`:
   ```tsx
   // La prenotazione si apre sempre su uno spettacolo; se manca, lo diciamo.
   if (!selectedSubeventId) {
     return (
       <Notice
         icon={<AlertTriangle size={32} />}
         title="Nessuno spettacolo scelto"
         text="Torna al programma e scegli un orario."
         onClose={onClose}
       />
     );
   }
   ```
4. Il ternario `{selectedSubeventId ? ( <BookingRoom … /> ) : ( <section … picker> … )}` diventa solo `<BookingRoom … />`, con `subeventId={selectedSubeventId}`. `legal` diventa `ageNotice(meta?.rating)`.

La lettura dei dati in `fetchSchedules` non cambia.

- [ ] **Passo 2: `BookingFlow.module.css`**: si tolgono le regole `.picker`, `.pick`, `.pick:hover:not(:disabled)`, `.pickTime`, `.pickDay`, `.pickOff`, `.pickOff .pickTime`, `.empty` e il commento "Tutte le proiezioni (senza spettacolo)".

- [ ] **Passo 3:** `npx tsc --noEmit && npm test`, poi:

```bash
grep -n "picker\|pickTime\|handleSubeventSelect" src/components/BookingFlow.tsx src/components/BookingFlow.module.css
```

Atteso: nessuna riga. Commit:

```bash
git add src/components/BookingFlow.tsx src/components/BookingFlow.module.css
git commit -m "La prenotazione parte sempre da uno spettacolo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Compito 4: il biglietto in pagina

**File:** `src/components/TicketCard/TicketCard.tsx`, `src/components/TicketCard/TicketCard.module.css`

- [ ] **Passo 1: il componente**

```tsx
'use client';

import { useState } from 'react';
import Image from 'next/image';
import { QRCodeSVG } from 'qrcode.react';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import { formatShowDayLong, formatShowTime } from '@/utils/cinemaDate';
import { shortSeat } from '../bookingText';
import styles from './TicketCard.module.css';

export interface TicketCardTicket {
  secret: string;
  seat_name?: string;
}

interface TicketCardProps {
  title: string;
  logoPath?: string;
  /** Inizio dello spettacolo, ISO. */
  date: string;
  /** "SALA 1" come la scrive CheckoutButton. */
  roomName?: string;
  duration?: number;
  orderCode: string;
  tickets: TicketCardTicket[];
}

/**
 * Il biglietto disegnato in pagina: lo stesso nel cassetto, subito dopo la
 * conferma, e su /success. Serve a vederlo e a mostrare il QR all'ingresso.
 * Il PDF resta quello di TicketPDF, del progetto 4.
 */
export default function TicketCard({ title, logoPath, date, roomName, duration, orderCode, tickets }: TicketCardProps) {
  const [index, setIndex] = useState(0);
  if (tickets.length === 0) return null;

  const ticket = tickets[Math.min(index, tickets.length - 1)];
  const seat = ticket.seat_name ? shortSeat(ticket.seat_name) : 'Posto unico';
  const room = (roomName || '').replace(/^sala\s*/i, '') || '—';
  const small = [duration ? `${duration} min` : '', `Ordine ${orderCode}`].filter(Boolean).join(' · ');

  return (
    <article className={styles.card} aria-label={`Biglietto ${index + 1} di ${tickets.length}: ${title}`}>
      <div className={styles.main}>
        {logoPath ? (
          <Image src={getTMDBImageUrl(logoPath, 'w500')!} alt={title} width={320} height={96} className={styles.logo} />
        ) : (
          <h2 className={styles.title}>{title}</h2>
        )}
        <dl className={styles.facts}>
          <div className={styles.fact}>
            <dt className={styles.label}>Quando</dt>
            <dd className={`${styles.value} ${styles.when}`}>{formatShowDayLong(date)} · {formatShowTime(date)}</dd>
          </div>
          <div className={styles.fact}>
            <dt className={styles.label}>Posto</dt>
            <dd className={styles.value}>{seat}</dd>
          </div>
          <div className={styles.fact}>
            <dt className={styles.label}>Sala</dt>
            <dd className={styles.value}>{room}</dd>
          </div>
        </dl>
        <p className={styles.small}>{small}</p>
      </div>

      <div className={styles.stub}>
        <div className={styles.qr}>
          <QRCodeSVG value={ticket.secret} size={88} bgColor="#efe6d8" fgColor="#100d0a" />
        </div>
        {tickets.length > 1 && (
          <div className={styles.pager}>
            <button type="button" className={styles.pageBtn} onClick={() => setIndex(i => i - 1)} disabled={index === 0} aria-label="Biglietto precedente">‹</button>
            <span>{index + 1} / {tickets.length}</span>
            <button type="button" className={styles.pageBtn} onClick={() => setIndex(i => i + 1)} disabled={index === tickets.length - 1} aria-label="Biglietto successivo">›</button>
          </div>
        )}
      </div>
    </article>
  );
}
```

- [ ] **Passo 2: lo stile**

```css
/* Il biglietto: a sinistra il film e i dati, a destra la matrice con il QR,
 * dopo la linea tratteggiata e le mezzelune dello strappo. Il QR resta scuro
 * su chiaro: così lo leggono tutti i lettori. */

.card {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 128px;
  width: 100%;
  max-width: 520px;
  border: 1px solid var(--c-line);
  border-radius: var(--c-radius-lg);
  background: var(--c-bg-raised);
}

.card::before,
.card::after {
  content: '';
  position: absolute;
  right: 120px;
  width: 16px;
  height: 16px;
  border: 1px solid var(--c-line);
  border-radius: 50%;
  background: var(--c-bg);
}

.card::before {
  top: -9px;
}

.card::after {
  bottom: -9px;
}

.main {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  padding: 18px 20px;
}

.logo {
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 64px;
  object-fit: contain;
  object-position: left;
}

.title {
  margin: 0;
  font-family: var(--c-font-serif);
  font-size: 1.6rem;
  font-weight: 600;
  line-height: 1;
  color: var(--c-ink);
}

.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 22px;
  margin: 0;
}

.fact {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.label {
  font-family: var(--c-font-mono);
  font-size: 9px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--c-dim);
}

.value {
  margin: 0;
  font-family: var(--c-font-mono);
  font-size: 15px;
  color: var(--c-ink);
}

.when {
  color: var(--c-amber);
  text-transform: uppercase;
}

.small {
  margin: 0;
  font-family: var(--c-font-mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--c-dim);
}

.stub {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px 12px;
  border-left: 1px dashed var(--c-line-strong);
}

.qr {
  padding: 6px;
  border-radius: 4px;
  background: #efe6d8;
  line-height: 0;
}

.qr svg {
  width: 88px;
  height: 88px;
}

.pager {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--c-font-mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--c-dim);
}

.pageBtn {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--c-line-strong);
  border-radius: 4px;
  background: none;
  color: var(--c-ink);
  cursor: pointer;
}

.pageBtn:disabled {
  opacity: 0.3;
  cursor: default;
}

@media (max-width: 480px) {
  .card {
    grid-template-columns: minmax(0, 1fr) 100px;
  }

  .card::before,
  .card::after {
    right: 92px;
  }

  .main {
    padding: 16px;
  }

  .value {
    font-size: 13px;
  }

  .qr svg {
    width: 72px;
    height: 72px;
  }
}
```

- [ ] **Passo 3:** `npx tsc --noEmit`. Atteso: nessun errore.

---

### Compito 5: nel cassetto, dopo la conferma

**File:** `src/components/CheckoutButton.tsx`, riscrive `src/components/CheckoutButton.module.css`

- [ ] **Passo 1: `CheckoutButton.tsx`** (senza toccare `handleCheckout`)
1. Import: `import { Download, CheckCircle2, Eye, X, ChevronLeft, ChevronRight } from 'lucide-react';` si toglie; si aggiunge `import TicketCard from './TicketCard/TicketCard';`.
2. Si tolgono lo stato dell'anteprima (`isPreviewOpen`, `currentPreviewIndex`) e `handleNextPreview` / `handlePrevPreview`.
3. Il ramo `if (success) { return ( … ); }` diventa:

```tsx
  if (success) {
    return (
      <div className={styles.successContainer}>
        <p className={styles.successKicker}>✓ Prenotato · ordine <span>{orderCode}</span></p>
        <h3 className={styles.successTitle}>Ci vediamo in sala.</h3>

        {subeventData && (
          <TicketCard
            title={subeventData.movieTitle}
            logoPath={subeventData.logoPath}
            date={subeventData.date}
            roomName={subeventData.roomName}
            duration={subeventData.duration}
            orderCode={orderCode}
            tickets={tickets}
          />
        )}

        {/* Area nascosta per il PDF, a grandezza vera, fuori dalla pagina. */}
        <div style={{ position: 'fixed', top: 0, left: '-9999px', display: 'block', pointerEvents: 'none', zIndex: -999 }}>
          {/* …invariato: il map di TicketPDF di oggi, riga per riga… */}
        </div>

        <div className={styles.successActions}>
          <button type="button" className={styles.button} onClick={() => handleDownloadPDF(true)} disabled={loading}>
            {loading ? 'Generazione PDF…' : 'Scarica PDF'}
          </button>
          <Link href={`/success?subeventId=${subeventId}`} className={styles.secondaryActionBtn}>
            Apri il riepilogo
          </Link>
        </div>

        <p className={styles.successNote}>
          {isAnonymous ? 'Niente email: scarica il biglietto adesso.' : 'Ti arriva anche una copia via email.'} All&apos;ingresso mostra il QR.
        </p>
      </div>
    );
  }
```

Il blocco dell'area nascosta si copia **identico** da oggi (`subeventData && tickets.map(... <TicketPDF preview={false} … />)`): è quello da cui nasce il PDF.

- [ ] **Passo 2: `CheckoutButton.module.css`, riscritto con le sole classi usate**

```bash
grep -o "styles\.[a-zA-Z]*" src/components/CheckoutButton.tsx | sort -u
```

L'elenco atteso è: `anonymousBtn`, `button`, `container`, `divider`, `emailInput`, `error`, `inputWrapper`, `secondaryActionBtn`, `successActions`, `successContainer`, `successKicker`, `successNote`, `successTitle`. Il foglio diventa:

```css
/* La conferma, nella colonna della prenotazione: prima l'email (o niente),
 * poi il biglietto. Dentro una `.cabina`; i valori dopo la virgola servono se
 * il componente finisse fuori. */

/* --- Il modulo --- */
.container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.inputWrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.emailInput {
  box-sizing: border-box;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--c-line-strong, #3a3128);
  border-radius: var(--c-radius, 6px);
  outline: none;
  background: var(--c-bg, #100d0a);
  color: var(--c-ink, #efe6d8);
  font-family: var(--c-font-sans, sans-serif);
  font-size: 16px;
  transition: border-color var(--c-fast, 150ms);
}

.emailInput::placeholder {
  color: var(--c-dim, #8a7d6c);
}

.emailInput:focus {
  border-color: var(--c-amber, #e8a33d);
}

.button {
  width: 100%;
  padding: 13px 16px;
  border: 1px solid var(--c-amber, #e8a33d);
  border-radius: var(--c-radius, 6px);
  background: var(--c-amber, #e8a33d);
  color: var(--c-amber-ink, #1a130b);
  font-family: var(--c-font-mono, monospace);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
}

.button:hover:not(:disabled) {
  background: #f0b458;
}

.button:disabled {
  border-color: var(--c-line-strong, #3a3128);
  background: none;
  color: var(--c-dim, #8a7d6c);
  cursor: not-allowed;
}

.divider {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--c-font-mono, monospace);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--c-dim, #8a7d6c);
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--c-line, #2a231c);
}

.anonymousBtn {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid var(--c-line-strong, #3a3128);
  border-radius: var(--c-radius, 6px);
  background: none;
  color: var(--c-ink, #efe6d8);
  font-family: var(--c-font-mono, monospace);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
  transition: border-color var(--c-fast, 150ms);
}

.anonymousBtn:hover:not(:disabled) {
  border-color: var(--c-dim, #8a7d6c);
}

.error {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid rgba(212, 85, 58, 0.5);
  border-radius: var(--c-radius, 6px);
  background: var(--c-alarm-soft, rgba(212, 85, 58, 0.1));
  color: var(--c-ink, #efe6d8);
  font-size: 13px;
  line-height: 1.4;
}

/* --- Il biglietto --- */
.successContainer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  padding: 8px 0 24px;
  text-align: center;
}

.successKicker {
  margin: 0;
  font-family: var(--c-font-mono, monospace);
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--c-ok, #9bb07a);
}

.successKicker span {
  color: var(--c-amber, #e8a33d);
}

.successTitle {
  margin: 0;
  font-family: var(--c-font-serif, Georgia, serif);
  font-size: 1.9rem;
  font-weight: 600;
  line-height: 1.05;
  color: var(--c-ink, #efe6d8);
}

.successActions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  width: 100%;
  max-width: 520px;
}

.secondaryActionBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 13px 16px;
  border: 1px solid var(--c-line-strong, #3a3128);
  border-radius: var(--c-radius, 6px);
  color: var(--c-ink, #efe6d8);
  font-family: var(--c-font-mono, monospace);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-decoration: none;
  text-transform: uppercase;
}

.secondaryActionBtn:hover {
  border-color: var(--c-dim, #8a7d6c);
}

.successNote {
  margin: 0;
  font-family: var(--c-font-mono, monospace);
  font-size: 11px;
  letter-spacing: 0.06em;
  line-height: 1.5;
  color: var(--c-dim, #8a7d6c);
}
```

- [ ] **Passo 3:** `npx tsc --noEmit && npm test`, poi commit dei compiti 4 e 5:

```bash
git add src/components/TicketCard src/components/CheckoutButton.tsx src/components/CheckoutButton.module.css
git commit -m "Dopo la conferma si vede subito il biglietto, con il QR

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Compito 6: `/success`

**File:** riscrive `src/app/success/page.tsx` e `src/app/success/success.module.css`

- [ ] **Passo 1: la pagina**

La lettura da `sessionStorage` e la generazione del PDF restano quelle di oggi. Sparisce l'anteprima che si apriva da sola, e ci sono due novità:
- `checked` distingue "sto leggendo" da "non c'è niente". Oggi la pagina restava su "Caricamento dati ordine..." per sempre, se la si apriva in un'altra finestra;
- il fondale del film fa da sfondo.

```tsx
'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import TicketPDF, { generateTicketPDF } from '@/components/TicketPDF';
import TicketCard from '@/components/TicketCard/TicketCard';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import styles from './success.module.css';

function SuccessContent() {
  const searchParams = useSearchParams();
  const subeventId = searchParams.get('subeventId');
  const [orderData, setOrderData] = useState<any>(null);
  // Il riepilogo vive in sessionStorage: letto, sappiamo se c'è o no.
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (subeventId) {
      const saved = sessionStorage.getItem(`order_${subeventId}`);
      if (saved) setOrderData(JSON.parse(saved));
    }
    setChecked(true);
  }, [subeventId]);

  const handleDownloadPDF = async () => {
    if (!orderData) return;
    setLoading(true);
    try {
      const ticketIds = orderData.tickets.map((t: any) => `full-ticket-${t.secret}`);
      await generateTicketPDF(ticketIds, `biglietti_${orderData.orderCode}`, null, true);
    } catch (err) {
      console.error('Failed to generate PDF', err);
    } finally {
      setLoading(false);
    }
  };

  if (!orderData) {
    return (
      <div className={`cabina pubblico ${styles.page}`}>
        <div className={styles.content}>
          <h1 className={styles.title}>{checked ? 'Riepilogo non trovato' : 'Un attimo'}</h1>
          <p className={styles.note}>
            {checked
              ? 'Il riepilogo si apre nella finestra in cui hai prenotato. Se hai lasciato l’email, il biglietto è anche lì.'
              : 'Caricamento dati ordine…'}
          </p>
          <Link href="/" className={styles.ghost}>‹ Home</Link>
        </div>
      </div>
    );
  }

  const { tickets, orderCode, subeventData, isAnonymous } = orderData;
  const backdrop = subeventData?.backdropPath ? getTMDBImageUrl(subeventData.backdropPath, 'w1280') : null;

  return (
    <div className={`cabina pubblico ${styles.page}`}>
      {backdrop && (
        <div className={styles.backdrop} aria-hidden="true">
          <Image src={backdrop} alt="" fill sizes="100vw" style={{ objectFit: 'cover' }} priority />
        </div>
      )}
      <div className={styles.shade} aria-hidden="true" />

      <div className={styles.content}>
        <p className={styles.kicker}>✓ Prenotato · ordine <span>{orderCode}</span></p>
        <h1 className={styles.title}>Ci vediamo in sala.</h1>

        <TicketCard
          title={subeventData?.movieTitle || 'Film'}
          logoPath={subeventData?.logoPath}
          date={subeventData?.date}
          roomName={subeventData?.roomName}
          duration={subeventData?.duration}
          orderCode={orderCode}
          tickets={tickets}
        />

        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={handleDownloadPDF} disabled={loading}>
            {loading ? 'Generazione PDF…' : 'Scarica PDF'}
          </button>
          <Link href="/" className={styles.ghost}>‹ Home</Link>
        </div>

        <p className={styles.note}>
          {isAnonymous ? 'Niente email: scarica il biglietto adesso.' : 'Ti arriva anche una copia via email.'} All&apos;ingresso mostra il QR.
        </p>
      </div>

      {/* Area nascosta per il PDF, a grandezza vera, fuori dalla pagina. */}
      <div style={{ position: 'fixed', top: 0, left: '-9999px', pointerEvents: 'none' }}>
        {tickets.map((ticket: any, idx: number) => (
          <TicketPDF
            key={`full-${ticket.id}`}
            preview={false}
            id={`full-ticket-${ticket.secret}`}
            backdropIndex={idx}
            data={{
              ...subeventData,
              seatName: ticket.seat_name || 'Posto Unico',
              orderCode: orderCode,
              qrSecret: ticket.secret,
              purchaseDate: new Date().toLocaleDateString('it-IT'),
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<div className="cabina pubblico" />}>
      <SuccessContent />
    </Suspense>
  );
}
```

Prima di sostituire, si confronta l'area nascosta con quella di oggi: le props di `TicketPDF` devono essere le stesse.

- [ ] **Passo 2: lo stile**

```css
/* Il riepilogo della prenotazione: il biglietto sul fondale del film. */

.page {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.backdrop {
  position: absolute;
  inset: 0;
  opacity: 0.35;
}

.shade {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(16, 13, 10, 0.6) 0%, var(--c-bg) 85%),
    radial-gradient(ellipse at 50% 30%, transparent 0%, rgba(16, 13, 10, 0.7) 80%);
}

.content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  box-sizing: border-box;
  width: 100%;
  max-width: 560px;
  padding: 56px 16px;
  text-align: center;
}

.kicker {
  margin: 0;
  font-family: var(--c-font-mono);
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--c-ok);
}

.kicker span {
  color: var(--c-amber);
}

.title {
  margin: 0;
  font-family: var(--c-font-serif);
  font-size: clamp(2rem, 6vw, 2.8rem);
  font-weight: 600;
  line-height: 1;
  color: var(--c-ink);
}

.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  width: 100%;
  max-width: 520px;
}

.primary,
.ghost {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 13px 16px;
  border-radius: var(--c-radius);
  font-family: var(--c-font-mono);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-decoration: none;
  text-transform: uppercase;
  cursor: pointer;
}

.primary {
  border: 1px solid var(--c-amber);
  background: var(--c-amber);
  color: var(--c-amber-ink);
  font-weight: 600;
}

.primary:hover:not(:disabled) {
  background: #f0b458;
}

.primary:disabled {
  opacity: 0.6;
  cursor: wait;
}

.ghost {
  border: 1px solid var(--c-line-strong);
  background: rgba(16, 13, 10, 0.4);
  color: var(--c-ink);
}

.ghost:hover {
  border-color: var(--c-dim);
}

.note {
  max-width: 440px;
  margin: 0;
  font-family: var(--c-font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  line-height: 1.5;
  color: var(--c-dim);
}
```

- [ ] **Passo 3:** `npx tsc --noEmit && npm test`, poi commit:

```bash
git add src/app/success
git commit -m "Il riepilogo della prenotazione è il biglietto, sul fondale del film

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Compito 7: niente viola sul sito pubblico

- [ ] **Passo 1: cercare**

```bash
grep -rln -i "var(--primary\|var(--accent\|8b5cf6\|a78bfa\|f43f5e\|139, *92, *246\|168, *85, *247\|btn-primary\|font-serif-display\|var(--font-apple)" src/app src/components | grep -v "src/app/admin\|src/app/display-esterno\|src/components/Cassa\|src/components/Admin/\|src/components/cabina\|TicketPDF\|src/app/globals.css\|src/app/layout.tsx"
```

- [ ] **Passo 2:** ogni file dell'elenco si guarda:
  - se lo usa il sito pubblico (home, prenotazione, conferma), il viola si porta in Cabina con lo stesso criterio delle tappe prima;
  - se lo usano il display, la cassa, il gestionale o il biglietto, resta al progetto 4 o è già suo.

  Nel resoconto va l'elenco dei file lasciati, con il motivo.

- [ ] **Passo 3:** `npx tsc --noEmit && npm test`, e commit se c'è stato da correggere.

---

### Compito 8: la specifica racconta com'è andata, e il resoconto

- [ ] **Passo 1:** in fondo alla specifica, una sezione "Com'è andata" come quella del gestionale, con le deviazioni:
  - la conferma avveniva nel cassetto e non su Pretix;
  - il muro di locandine è rimasto;
  - il limite di 5 giorni sul computer;
  - "cambia orario" fra gli spettacoli dello stesso film;
  - "‹ Cambia posti";
  - `logoPath` sul server;
  - `/success` che dice quando il riepilogo non c'è;
  - via `AdminSearch`.

  Più le cose scoperte e da fare a parte: la chiave TMDB nel browser, già in una sessione separata; il ramo di `fetchSchedules` senza spettacolo, ormai morto; la variante `line` di `ProjectionSpecs`, senza più utenti.

- [ ] **Passo 2:**

```bash
npx tsc --noEmit && npm test && git status --short
git add docs/superpowers/specs/2026-09-25-sito-pubblico-cabina-design.md
git commit -m "La specifica del sito pubblico racconta com'è andata

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Passo 3: cosa provare**
- **`/movie/<tmdbId>`** di un film in programmazione: si apre la home su quel film. Con `?subevent=<id>` di uno spettacolo in vendita si apre anche la prenotazione.
- **Dopo una conferma** (su uno spettacolo di prova):
  - nel cassetto "✓ Prenotato · ordine …", "Ci vediamo in sala." e il biglietto con il QR, sfogliabile con più posti;
  - "Scarica PDF" scarica lo stesso PDF di sempre;
  - "Apri il riepilogo" apre `/success`, con il biglietto sul fondale del film.
- **`/success` aperta in un'altra finestra:** "Riepilogo non trovato", non più un caricamento infinito.
- **Il QR del biglietto in pagina** si legge con il lettore della cassa.
- **Telefono:** biglietto stretto e QR più piccolo, ancora leggibile.
