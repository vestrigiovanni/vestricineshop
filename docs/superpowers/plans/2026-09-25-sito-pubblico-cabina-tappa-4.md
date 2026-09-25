# Sito pubblico in cabina — Tappa 4: la sala a tutto schermo

> **Per chi esegue:** si esegue inline, un compito alla volta (Giovanni non vuole subagenti). I passi usano le caselle (`- [ ]`).

**Obiettivo:** la prenotazione copre tutta la pagina.
- **A sinistra la sala:** lo schermo che fa luce e le poltrone, con quelle scelte in ambra.
- **A destra una colonna:** logo o titolo, "Quando" con "cambia orario" fra gli spettacoli dello stesso film, i posti, "Gratuito", "Prenota N posti →" e l'avviso dei 2 minuti.
- **Sul telefono:** testata in alto, sala al centro, barra in basso.
- **La conferma resta nella colonna:** email oppure "Continua senza email", con "‹ Cambia posti" per tornare indietro, che oggi manca.
- **La verifica dell'età** diventa una finestra Cabina.

**Architettura:**
- **`BookingDrawer`** resta il contenitore, uno nell'hero e uno nel calendario. Diventa uno schermo pieno, e tiene lo spettacolo corrente: "cambia orario" rimonta `BookingFlow` sul nuovo spettacolo (`key`), così la logica di disponibilità, età e posti riparte pulita, senza aggiungere un solo stato.
- **`BookingFlow`** tiene lo stato e compone tre pezzi in una griglia a aree: `TicketHead` e `TicketFoot` (in `BookingTicket.tsx`) e `BookingRoom`. Sul telefono la griglia diventa una colonna sola.
- **I testi calcolati** (avviso d'età, posti in forma breve, avviso dei posti presi) e **gli spettacoli fra cui scegliere** stanno in due moduli puri coperti da vitest.

**Strumenti:** React 19, CSS Modules con le variabili `--c-*` (il cassetto sta dentro `<main className="cabina pubblico">`), vitest.

**Specifica:** sezione 3 di `docs/superpowers/specs/2026-09-25-sito-pubblico-cabina-design.md`, corretta il 25 settembre: la conferma avviene nella colonna, non su Pretix.

**Scelte prese qui:**
- **`BookingTicket.tsx` esporta due componenti**, `TicketHead` e `TicketFoot`, invece di una colonna sola: sul telefono testata e barra stanno una sopra e una sotto la sala, e la griglia CSS lo fa senza duplicare niente.
- **La conferma riuscita** (`CheckoutButton` in stato "prenotato") resta montata dov'è: la classe `.booked` nasconde la sala e allarga la colonna. Spostarla in un altro punto dell'albero la smonterebbe, e con lei il biglietto appena emesso. **La veste di quella schermata è della tappa 5** (`TicketCard`): fino ad allora resta com'è oggi, dentro il contenitore nuovo.
- **L'elenco di tutte le proiezioni**, cioè il ramo senza `subeventId` che oggi usa solo la pagina film, resta funzionante e si riveste in modo semplice. Sparisce con la pagina film nella tappa 5.
- **`getTrustedSubeventMetadata` restituisce anche `logoPath`**: è una riga in più nella lettura dal database, segnalata nella specifica.

---

## Mappa dei file

| File | Cosa cambia |
|---|---|
| `src/components/BookingDrawer/showChoices.ts` + `.test.ts` (nuovi) | gli spettacoli dello stesso film fra cui scegliere |
| `src/components/bookingText.ts` + `.test.ts` (nuovi) | avviso d'età, posto in forma breve, avviso posti presi |
| `src/actions/bookingActions.ts` | `logoPath` in `getTrustedSubeventMetadata` |
| `src/components/BookingDrawer/BookingDrawer.tsx` + `.module.css` | schermo pieno, spettacolo corrente, `choices` |
| `src/components/BookingFlow.tsx` | riscritto: stato e composizione |
| `src/components/BookingTicket.tsx` (nuovo) | `TicketHead`, `TicketFoot` |
| `src/components/BookingRoom.tsx` (nuovo) | avviso posti presi e `SeatMap` |
| `src/components/BookingFlow.module.css` | riscritto |
| `src/components/SeatMap.module.css` | poltrone e schermo in Cabina |
| `src/components/AgeVerificationModal.tsx` + `.module.css` | testo e veste nuovi |
| `src/components/CheckoutButton.tsx` + `.module.css` | solo il modulo dell'email |
| `src/components/MovieShowcase/MovieShowcase.tsx`, `src/components/WeeklyCinemaCalendar/WeeklyCinemaCalendar.tsx` | passano `choices` al cassetto |

---

### Compito 1: gli spettacoli fra cui scegliere (test prima)

**File:**
- Crea: `src/components/BookingDrawer/showChoices.test.ts`
- Crea: `src/components/BookingDrawer/showChoices.ts`

- [ ] **Passo 1: i test**

```ts
import { describe, expect, it } from 'vitest';
import { formatShowDayLabel } from '@/utils/cinemaDate';
import { choicesFromCalendar, choicesFromShowcase } from './showChoices';

const NOW = new Date('2026-09-25T10:00:00.000Z');

describe('choicesFromShowcase', () => {
  it('usa le etichette già scritte dal server', () => {
    expect(choicesFromShowcase([
      { id: 1, date: '2026-09-25T19:15:00.000Z', dayLabel: 'Oggi', timeLabel: '21:15', isSoldOut: false },
      { id: 2, date: '2026-09-26T16:30:00.000Z', dayLabel: 'sab 26 set', timeLabel: '18:30', isSoldOut: true },
    ])).toEqual([
      { id: 1, day: 'Oggi', time: '21:15', isSoldOut: false },
      { id: 2, day: 'sab 26 set', time: '18:30', isSoldOut: true },
    ]);
  });
});

describe('choicesFromCalendar', () => {
  const all = [
    { id: 3, date_from: '2026-09-26T16:30:00.000Z', isSoldOut: false, tmdbId: '100' },
    { id: 1, date_from: '2026-09-25T19:15:00.000Z', isSoldOut: false, tmdbId: '100' },
    { id: 2, date_from: '2026-09-25T17:00:00.000Z', isSoldOut: false, tmdbId: '200' },
    { id: 4, date_from: '2026-09-27T19:00:00.000Z', isSoldOut: true, tmdbId: '100' },
  ];

  it('tiene solo gli spettacoli dello stesso film, in ordine di data', () => {
    const choices = choicesFromCalendar(all, 1, NOW);
    expect(choices.map(c => c.id)).toEqual([1, 3, 4]);
    expect(choices[0]).toEqual({ id: 1, day: 'Oggi', time: '21:15', isSoldOut: false });
    expect(choices[1].day).toBe(formatShowDayLabel('2026-09-26T16:30:00.000Z', NOW));
    expect(choices[2].isSoldOut).toBe(true);
  });

  it('senza film o con uno spettacolo sconosciuto non propone niente', () => {
    expect(choicesFromCalendar(all, 99, NOW)).toEqual([]);
    expect(choicesFromCalendar([{ id: 5, date_from: '2026-09-25T19:15:00.000Z', tmdbId: null }], 5, NOW)).toEqual([]);
  });
});
```

- [ ] **Passo 2: verificare che falliscano**

```bash
npx vitest run src/components/BookingDrawer/showChoices.test.ts
```

Atteso: FALLISCE, perché `./showChoices` non esiste.

- [ ] **Passo 3: il modulo**

```ts
import { formatShowDayLabel, formatShowTime } from '@/utils/cinemaDate';

/** Uno spettacolo fra cui scegliere in "cambia orario". */
export interface ShowChoice {
  id: number;
  day: string;
  time: string;
  isSoldOut: boolean;
}

/** Dall'hero: gli spettacoli del film attivo, con le etichette del server. */
export function choicesFromShowcase(
  subevents: { id: number; date: string; dayLabel?: string; timeLabel?: string; isSoldOut?: boolean }[]
): ShowChoice[] {
  return subevents.map(s => ({
    id: s.id,
    day: s.dayLabel || formatShowDayLabel(s.date),
    time: s.timeLabel || formatShowTime(s.date),
    isSoldOut: !!s.isSoldOut,
  }));
}

/**
 * Dal calendario: gli spettacoli dello stesso film (stesso tmdbId) di quello
 * aperto, in ordine di data. Il calendario ha tutta la settimana in memoria,
 * quindi non serve chiedere niente al server.
 */
export function choicesFromCalendar(
  subEvents: { id: number; date_from: string; isSoldOut?: boolean; tmdbId?: string | number | null }[],
  subeventId: number,
  now: Date = new Date()
): ShowChoice[] {
  const current = subEvents.find(s => s.id === subeventId);
  if (!current || current.tmdbId == null) return [];
  return subEvents
    .filter(s => s.tmdbId != null && String(s.tmdbId) === String(current.tmdbId))
    .sort((a, b) => new Date(a.date_from).getTime() - new Date(b.date_from).getTime())
    .map(s => ({
      id: s.id,
      day: formatShowDayLabel(s.date_from, now),
      time: formatShowTime(s.date_from),
      isSoldOut: !!s.isSoldOut,
    }));
}
```

- [ ] **Passo 4: verificare che passino**

```bash
npx vitest run src/components/BookingDrawer/showChoices.test.ts
```

Atteso: PASSA.

---

### Compito 2: i testi della prenotazione (test prima)

**File:**
- Crea: `src/components/bookingText.test.ts`
- Crea: `src/components/bookingText.ts`

- [ ] **Passo 1: i test**

```ts
import { describe, expect, it } from 'vitest';
import { ageNotice, seatsTakenNotice, shortSeat } from './bookingText';

describe('ageNotice', () => {
  it('18+ è un divieto, in rosso', () => {
    expect(ageNotice('VM18')).toEqual({ alarm: true, text: "L'accesso a questa proiezione è limitato ai maggiori di 18 anni." });
  });
  it('14+ è un limite, non un allarme', () => {
    expect(ageNotice('14')).toEqual({ alarm: false, text: "L'accesso a questa proiezione è limitato ai maggiori di 14 anni." });
  });
  it('6+ e 10+ sono consigli', () => {
    expect(ageNotice('6+')).toEqual({ alarm: false, text: 'La visione di questo film è consigliata dai 6 anni in su.' });
    expect(ageNotice('10')).toEqual({ alarm: false, text: 'La visione di questo film è consigliata dai 10 anni in su.' });
  });
  it('per tutti: niente avviso', () => {
    expect(ageNotice('T')).toBeNull();
    expect(ageNotice(undefined)).toBeNull();
  });
});

describe('shortSeat', () => {
  it('"Fila B - Posto 5" diventa B5', () => {
    expect(shortSeat('Fila B - Posto 5')).toBe('B5');
    expect(shortSeat('Fila 12 - Posto 3')).toBe('12·3');
  });
  it('un nome libero resta com\'è', () => {
    expect(shortSeat('Poltrona 7')).toBe('Poltrona 7');
  });
});

describe('seatsTakenNotice', () => {
  it('un posto solo', () => {
    expect(seatsTakenNotice(['Fila B - Posto 5'])).toBe('Il posto Fila B - Posto 5 è stato appena prenotato da qualcun altro. Scegline un altro.');
  });
  it('più posti', () => {
    expect(seatsTakenNotice(['Fila B - Posto 5', 'Fila B - Posto 6'])).toBe('Questi posti sono stati appena prenotati da altri: Fila B - Posto 5, Fila B - Posto 6. Scegline altri.');
  });
});
```

- [ ] **Passo 2: verificare che falliscano**

```bash
npx vitest run src/components/bookingText.test.ts
```

Atteso: FALLISCE, perché il modulo non esiste.

- [ ] **Passo 3: il modulo**

```ts
import { normalizeRating } from '@/utils/ratingUtils';

/**
 * I testi della prenotazione che dipendono dai dati: stanno qui, e non nel
 * JSX, perché le parole restino le stesse di oggi e si possano provare.
 */

/** L'avviso sotto la sala. Solo il 18+ è un divieto, e si colora di rosso. */
export function ageNotice(rating?: string | null): { alarm: boolean; text: string } | null {
  const norm = normalizeRating(rating);
  if (norm === '18+') return { alarm: true, text: "L'accesso a questa proiezione è limitato ai maggiori di 18 anni." };
  if (norm === '14+') return { alarm: false, text: "L'accesso a questa proiezione è limitato ai maggiori di 14 anni." };
  if (norm === '10+' || norm === '6+') {
    return { alarm: false, text: `La visione di questo film è consigliata dai ${norm.replace('+', '')} anni in su.` };
  }
  return null;
}

/**
 * "Fila B - Posto 5" → "B5", per la colonna. Con una fila numerica il punto
 * separa i due numeri ("12·3"), altrimenti "123" non si leggerebbe.
 */
export function shortSeat(label: string): string {
  const m = label.match(/^Fila (\S+) - Posto (\S+)$/);
  if (!m) return label;
  return /^\d+$/.test(m[1]) ? `${m[1]}·${m[2]}` : `${m[1]}${m[2]}`;
}

/** Quando la mappa scopre che un posto scelto è stato preso da qualcun altro. */
export function seatsTakenNotice(labels: string[]): string {
  return labels.length === 1
    ? `Il posto ${labels[0]} è stato appena prenotato da qualcun altro. Scegline un altro.`
    : `Questi posti sono stati appena prenotati da altri: ${labels.join(', ')}. Scegline altri.`;
}
```

- [ ] **Passo 4: verificare che passino, poi commit dei compiti 1 e 2**

```bash
npx vitest run src/components/bookingText.test.ts src/components/BookingDrawer/showChoices.test.ts
git add src/components/bookingText.ts src/components/bookingText.test.ts src/components/BookingDrawer/showChoices.ts src/components/BookingDrawer/showChoices.test.ts
git commit -m "La prenotazione sa quali altri orari proporre e come dire età e posti

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Compito 3: il logo del film arriva alla colonna

**File:** Modifica: `src/actions/bookingActions.ts`, `getTrustedSubeventMetadata`

- [ ] **Passo 1:** nell'oggetto restituito, dopo `backdropPath`:

```ts
      // Il logo per la colonna della prenotazione; 'none' vuol dire "niente logo".
      logoPath: (override as any).customLogoPath && (override as any).customLogoPath !== 'none'
        ? (override as any).customLogoPath
        : '',
```

- [ ] **Passo 2:** `npx tsc --noEmit`. Atteso: nessun errore.

---

### Compito 4: il contenitore a schermo pieno

**File:**
- Modifica: `src/components/BookingDrawer/BookingDrawer.tsx`
- Riscrive: `src/components/BookingDrawer/BookingDrawer.module.css`

- [ ] **Passo 1: `BookingDrawer.tsx`**

Restano identici il blocco dello scorrimento di fondo e la gestione di Esc, del focus e del Tab. Cambiano:
- le props, con `choices?: ShowChoice[]`;
- lo spettacolo corrente;
- il markup, senza sfondo separato: il contenitore copre tutto.

```tsx
import { useEffect, useRef, useState } from 'react';
import styles from './BookingDrawer.module.css';
import BookingFlow from '../BookingFlow';
import type { ShowChoice } from './showChoices';

interface BookingDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  subeventId: number | null;
  movieTitle?: string;
  /** Gli altri spettacoli dello stesso film, per "cambia orario". */
  choices?: ShowChoice[];
}
```

Dentro il componente, prima degli effetti esistenti:

```tsx
  // Lo spettacolo aperto adesso. "Cambia orario" lo sostituisce, e il `key`
  // su BookingFlow fa ripartire da capo disponibilità, età e posti.
  const [currentId, setCurrentId] = useState<number | null>(null);
  useEffect(() => {
    if (!isOpen) setCurrentId(null);
  }, [isOpen]);
  const activeId = currentId ?? subeventId;
```

Il `return` diventa:

```tsx
  return (
    <div
      className={`${styles.drawerContainer} ${isOpen ? styles.open : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={movieTitle ? `Prenotazione — ${movieTitle}` : 'Prenotazione'}
      aria-hidden={!isOpen}
    >
      <div className={styles.drawerContent} ref={contentRef} tabIndex={-1}>
        {isOpen && (
          <BookingFlow
            key={activeId ?? 'scelta'}
            subeventId={activeId || undefined}
            choices={choices}
            onChangeShow={setCurrentId}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
```

- [ ] **Passo 2: `BookingDrawer.module.css`**

```css
/* La prenotazione copre tutta la pagina: la sala a sinistra, la colonna a
 * destra (BookingFlow.module.css). Qui c'è solo il contenitore, che entra in
 * dissolvenza. Lo scorrimento di fondo lo blocca BookingDrawer.tsx. */

.drawerContainer {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 1001;
  display: flex;
  flex-direction: column;
  width: 100%;
  /* Su iPhone `100vh` è l'altezza con la barra di Safari nascosta: il fondo,
     dove sta il bottone di conferma, finirebbe sotto la barra. `dvh` segue il
     viewport davvero visibile; `vh` resta come ripiego. */
  height: 100vh;
  height: 100dvh;
  background: var(--c-bg);
  color: var(--c-ink);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity var(--c-slow), visibility var(--c-slow);
}

.drawerContainer.open {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
}

.drawerContent {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  outline: none;
}

@media (prefers-reduced-motion: reduce) {
  .drawerContainer {
    transition: none;
  }
}
```

---

### Compito 5: sala, testata e barra

**File:**
- Crea: `src/components/BookingRoom.tsx`
- Crea: `src/components/BookingTicket.tsx`

- [ ] **Passo 1: `BookingRoom.tsx`**

```tsx
import { AlertTriangle } from 'lucide-react';
import SeatMap from './SeatMap';
import styles from './BookingFlow.module.css';

interface BookingRoomProps {
  subeventId: number;
  /** Cambia per forzare una nuova lettura della mappa. */
  refreshKey: number;
  selected: Set<string>;
  onToggle: (seatId: string, label: string) => void;
  onTaken: (seats: { id: string; label: string }[]) => void;
  notice: string | null;
  /** Durante la conferma i posti restano visibili ma non si toccano. */
  locked: boolean;
}

/** La sala: lo schermo, le poltrone e l'avviso quando qualcuno ci ruba un posto. */
export default function BookingRoom({ subeventId, refreshKey, selected, onToggle, onTaken, notice, locked }: BookingRoomProps) {
  return (
    <section className={locked ? `${styles.room} ${styles.roomLocked}` : styles.room} aria-label="La sala">
      {notice && (
        <p className={styles.seatNotice} role="status">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>{notice}</span>
        </p>
      )}
      <div className={styles.map} inert={locked}>
        <SeatMap
          key={`${subeventId}-${refreshKey}`}
          selectedSeats={selected}
          onSeatToggle={onToggle}
          onSeatsTaken={onTaken}
          subeventId={subeventId}
        />
      </div>
    </section>
  );
}
```

- [ ] **Passo 2: `BookingTicket.tsx`**

```tsx
'use client';

import { useState, type ReactNode } from 'react';
import Image from 'next/image';
import { ChevronLeft, X } from 'lucide-react';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import type { ShowChoice } from './BookingDrawer/showChoices';
import { shortSeat } from './bookingText';
import styles from './BookingFlow.module.css';

interface TicketHeadProps {
  title: string;
  logoPath?: string;
  /** "Sala 1 · V.O. · SOTT. ITA" */
  facts: string;
  /** "14+", "18+"; niente se è per tutti. */
  rating: string | null;
  day: string | null;
  time: string | null;
  choices?: ShowChoice[];
  currentId: number | null;
  onChangeShow?: (id: number) => void;
  onBack?: () => void;
  onClose?: () => void;
}

/** In cima alla colonna: il film, quando, e il modo di cambiare orario. */
export function TicketHead({
  title, logoPath, facts, rating, day, time, choices, currentId, onChangeShow, onBack, onClose,
}: TicketHeadProps) {
  const [picking, setPicking] = useState(false);
  const canChange = !!onChangeShow && !!choices && choices.length > 1;

  return (
    <header className={styles.head}>
      <div className={styles.headBar}>
        {onBack ? (
          <button type="button" className={styles.barBtn} onClick={onBack}>
            <ChevronLeft size={14} aria-hidden="true" /> Cambia posti
          </button>
        ) : <span />}
        {onClose && (
          <button type="button" className={styles.barBtn} onClick={onClose} aria-label="Chiudi">
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className={styles.film}>
        {logoPath ? (
          <Image
            src={getTMDBImageUrl(logoPath, 'w500')!}
            alt={title}
            width={320}
            height={120}
            className={styles.logo}
          />
        ) : (
          <h2 className={styles.title}>{title}</h2>
        )}
        {(facts || rating) && (
          <p className={styles.facts}>
            {facts}
            {rating && <span className={rating === '18+' ? styles.alarm : undefined}>{facts ? ' · ' : ''}{rating}</span>}
          </p>
        )}
      </div>

      {time && (
        <div className={styles.when}>
          <span className={styles.label}>Quando</span>
          <span className={styles.whenDay}>{day}</span>
          <span className={styles.whenTime}>{time}</span>
          {canChange && (
            <button type="button" className={styles.change} onClick={() => setPicking(p => !p)} aria-expanded={picking}>
              {picking ? 'Chiudi' : 'Cambia orario'}
            </button>
          )}
        </div>
      )}

      {picking && canChange && (
        <ul className={styles.choices}>
          {choices!.map(c => (
            <li key={c.id}>
              <button
                type="button"
                className={[
                  styles.choice,
                  c.id === currentId ? styles.choiceOn : '',
                  c.isSoldOut ? styles.choiceOff : '',
                ].filter(Boolean).join(' ')}
                disabled={c.isSoldOut || c.id === currentId}
                onClick={() => onChangeShow!(c.id)}
              >
                <span>{c.day}</span>
                <span className={styles.choiceTime}>{c.isSoldOut ? 'esaurito' : c.time}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}

interface TicketFootProps {
  seatLabels: string[];
  legal: { alarm: boolean; text: string } | null;
  onProceed: () => void;
  /** Il modulo della conferma (CheckoutButton), quando è partita. */
  checkout?: ReactNode;
}

/** In fondo alla colonna: posti, costo e bottone, oppure la conferma. */
export function TicketFoot({ seatLabels, legal, onProceed, checkout }: TicketFootProps) {
  const count = seatLabels.length;

  return (
    <footer className={styles.foot}>
      {legal && (
        <p className={legal.alarm ? `${styles.legal} ${styles.legalAlarm}` : styles.legal}>{legal.text}</p>
      )}

      {checkout ? (
        <div className={styles.checkoutBox}>
          <span className={styles.label}>Quasi fatto</span>
          <p className={styles.seatsBig}>{seatLabels.map(shortSeat).join(' · ')}</p>
          {checkout}
        </div>
      ) : (
        <>
          <dl className={styles.summary}>
            <div>
              <dt className={styles.label}>Posti</dt>
              <dd className={count > 0 ? styles.seatsValue : undefined}>
                {count > 0 ? seatLabels.map(shortSeat).join(' · ') : '—'}
              </dd>
            </div>
            <div>
              {/* I biglietti sono gratuiti: parlare di "totale" in euro
                  faceva aspettare all'utente una richiesta di pagamento. */}
              <dt className={styles.label}>Costo</dt>
              <dd>Gratuito</dd>
            </div>
          </dl>
          <button type="button" className={styles.proceed} disabled={count === 0} onClick={onProceed}>
            {count === 0 ? 'Scegli i posti' : `Prenota ${count} ${count === 1 ? 'posto' : 'posti'} →`}
          </button>
          {count === 0 && <p className={styles.hint}>Seleziona almeno un posto per continuare</p>}
          <p className={styles.cutoff}>La vendita chiude 2 minuti prima dell&apos;inizio.</p>
        </>
      )}
    </footer>
  );
}
```

- [ ] **Passo 3:** `npx tsc --noEmit`. Atteso: nessun errore; se `inert` non è accettato dai tipi di React, si usa `inert={locked ? true : undefined}` e si riprova.

---

### Compito 6: `BookingFlow` tiene lo stato e compone

**File:** Riscrive: `src/components/BookingFlow.tsx`

La logica resta identica: `fetchSchedules`, la segnalazione dell'esaurito, i metadati fidati, la verifica dell'età, lo sblocco dei posti presi e il controllo della disponibilità prima della conferma. Cambiano il rendering, due props (`choices`, `onChangeShow`), lo stato `booked` e il ritorno dalla conferma.

- [ ] **Passo 1: il file**

Si parte dal file di oggi e:

1. **Import:** via `Link`, `CheckoutButton` resta, via `RatingBadge`, `LanguageBadge`, `listSubEvents`… no: gli import di `@/services/pretix` restano quelli usati (`listSubEvents`, `getSubEvent`, `listQuotas`, `getSubEventSeats`); si tolgono quelli inutilizzati (`getItemAvailability`, `finalizeBooking`) e le icone non più usate. Si aggiungono:
   ```ts
   import BookingRoom from './BookingRoom';
   import { TicketFoot, TicketHead } from './BookingTicket';
   import { ageNotice, seatsTakenNotice } from './bookingText';
   import { languageLabel } from './MovieShowcase/heroData';
   import type { ShowChoice } from './BookingDrawer/showChoices';
   import { Loader2, AlertTriangle, RefreshCw, X } from 'lucide-react';
   ```
2. **Props:**
   ```ts
   interface BookingFlowProps {
     subeventId?: number;
     onClose?: () => void;
     /** Gli spettacoli dello stesso film, per "cambia orario". */
     choices?: ShowChoice[];
     onChangeShow?: (id: number) => void;
   }
   ```
3. **Stato nuovo:** `const [booked, setBooked] = useState(false);`, e `handleBookingSuccess` chiama `setBooked(true)` prima delle pulizie di `sessionStorage` e `localStorage`, che restano.
4. **`handleSeatsTaken`** usa `seatsTakenNotice(taken.map(t => t.label))` al posto del testo scritto lì.
5. **In testa al modulo**, fuori dal componente:
   ```tsx
   /** I metadati scritti da Pretix nel commento dello spettacolo, se ci sono. */
   function parseComment(comment?: string | null): any {
     if (!comment) return null;
     try { return JSON.parse(comment); } catch { return null; }
   }

   /** Caricamento, errore, esaurito: una schermata sola, al centro. */
   function Notice({ icon, title, text, action, onClose }: {
     icon: React.ReactNode;
     title: string;
     text: string;
     action?: React.ReactNode;
     onClose?: () => void;
   }) {
     return (
       <div className={styles.notice}>
         {onClose && (
           <button type="button" className={`${styles.barBtn} ${styles.noticeClose}`} onClick={onClose} aria-label="Chiudi">
             <X size={18} aria-hidden="true" />
           </button>
         )}
         <span className={styles.noticeIcon}>{icon}</span>
         <h2 className={styles.noticeTitle}>{title}</h2>
         {text && <p className={styles.noticeText}>{text}</p>}
         {action}
       </div>
     );
   }
   ```
6. **I tre stati a schermata piena** diventano:
   ```tsx
   if (loading) {
     return <Notice icon={<Loader2 size={32} className={styles.spinner} />} title="Un attimo" text="Caricamento orari…" onClose={onClose} />;
   }

   if (loadError) {
     return (
       <Notice
         icon={<AlertTriangle size={32} />}
         title="Orari non disponibili"
         text="Non riusciamo a contattare il sistema di prenotazione. Controlla la connessione e riprova fra qualche istante."
         onClose={onClose}
         action={
           <button type="button" className={styles.noticeAction} onClick={() => fetchSchedules()}>
             <RefreshCw size={14} aria-hidden="true" /> Riprova
           </button>
         }
       />
     );
   }

   if (isSoldOut) {
     return (
       <Notice
         icon={<AlertTriangle size={32} />}
         title="Posti esauriti"
         text="Siamo spiacenti, ma i posti per questa proiezione sono terminati."
         onClose={onClose}
         action={!subeventId ? (
           <button
             type="button"
             className={styles.noticeAction}
             onClick={() => { setSelectedSubeventId(null); setSelectedSubEvent(null); setIsSoldOut(false); }}
           >
             Scegli un altro orario
           </button>
         ) : undefined}
       />
     );
   }
   ```
   Il blocco `if (checkoutStarted) { … }` di oggi **si toglie**: la conferma ora vive nella colonna.
7. **Il rendering principale** sostituisce tutto il `return` finale:
   ```tsx
   const meta = trustedMetadata || parseComment(selectedSubEvent?.comment);
   const seatLabels = Array.from(selectedSeats.values());
   const title = meta?.title
     || (selectedSubEvent ? (typeof selectedSubEvent.name === 'object' ? selectedSubEvent.name.it : selectedSubEvent.name) : '')
     || 'Prenotazione';
   const rating = normalizeRating(meta?.rating);
   const facts = [
     meta?.roomName || '',
     meta ? languageLabel(meta.versionLanguage, meta.subtitles) : '',
   ].filter(Boolean).join(' · ');

   const stageClass = [
     styles.stage,
     checkoutStarted ? styles.checkingOut : '',
     booked ? styles.booked : '',
   ].filter(Boolean).join(' ');

   return (
     <div className={stageClass}>
       {showAgeVerification && <AgeVerificationModal onConfirm={handleAgeVerified} />}

       <TicketHead
         title={title}
         logoPath={meta?.logoPath || ''}
         facts={facts}
         rating={rating === 'T' ? null : rating}
         day={selectedSubEvent ? formatShowDayLong(selectedSubEvent.date_from) : null}
         time={selectedSubEvent ? formatShowTime(selectedSubEvent.date_from) : null}
         choices={choices}
         currentId={selectedSubeventId}
         onChangeShow={checkoutStarted ? undefined : onChangeShow}
         onBack={checkoutStarted && !booked ? () => setCheckoutStarted(false) : undefined}
         onClose={onClose}
       />

       {selectedSubeventId ? (
         <BookingRoom
           subeventId={selectedSubeventId}
           refreshKey={refreshCounter}
           selected={new Set(selectedSeats.keys())}
           onToggle={handleSeatToggle}
           onTaken={handleSeatsTaken}
           notice={seatNotice}
           locked={checkoutStarted}
         />
       ) : (
         // Senza spettacolo (oggi solo dalla pagina film): tutte le proiezioni.
         <section className={styles.room} aria-label="Scegli la proiezione">
           {subevents.length > 0 ? (
             <ul className={styles.picker}>
               {subevents.map(se => (
                 <li key={se.id}>
                   <button
                     type="button"
                     className={se.isSoldOut ? `${styles.pick} ${styles.pickOff}` : styles.pick}
                     onClick={() => handleSubeventSelect(se)}
                     disabled={se.isSoldOut}
                   >
                     <span className={styles.pickTime}>{formatShowTime(se.date_from)}</span>
                     <span className={styles.pickDay}>{formatShowDayLong(se.date_from)}</span>
                     {se.isSoldOut && <span className={styles.pickDay}>esaurito</span>}
                   </button>
                 </li>
               ))}
             </ul>
           ) : (
             <p className={styles.empty}>Nessuna proiezione disponibile al momento.</p>
           )}
         </section>
       )}

       <TicketFoot
         seatLabels={seatLabels}
         legal={selectedSubeventId ? ageNotice(meta?.rating) : null}
         onProceed={startCheckout}
         checkout={checkoutStarted ? (
           <CheckoutButton
             subeventId={selectedSubeventId!}
             selectedSeats={Array.from(selectedSeats.keys())}
             onSuccess={handleBookingSuccess}
             movieRating={meta?.rating}
           />
         ) : undefined}
       />
     </div>
   );
   ```

`movieRating` prima era calcolato con una funzione anonima sul commento: `meta?.rating` è la stessa cosa, perché `meta` prende prima i metadati fidati e poi il commento.

- [ ] **Passo 2:** `npx tsc --noEmit && npm test`. Atteso: nessun errore, test verdi.

---

### Compito 7: la veste della sala e della colonna

**File:**
- Riscrive: `src/components/BookingFlow.module.css`
- Modifica: `src/components/SeatMap.module.css`

- [ ] **Passo 1: `BookingFlow.module.css`**

```css
/* === La prenotazione: la sala a sinistra, la colonna a destra ===
 * Una griglia a aree. Sul computer la sala occupa la prima colonna per tutta
 * l'altezza; testata e barra stanno nella seconda, sopra e sotto. Sul telefono
 * diventa una colonna sola: testata, sala, barra. Le variabili vengono da
 * components/cabina/cabina.css (il cassetto sta dentro la home). */

.stage {
  position: relative;
  display: grid;
  flex: 1;
  grid-template-columns: minmax(0, 1fr) 360px;
  grid-template-rows: auto minmax(0, 1fr) auto;
  grid-template-areas:
    'room head'
    'room gap'
    'room foot';
  min-height: 0;
  background: var(--c-bg);
}

/* Il tratto di colonna fra testata e barra. */
.stage::before {
  content: '';
  grid-area: gap;
  border-left: 1px solid var(--c-line);
  background: var(--c-bg-raised);
}

.head,
.foot {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 22px;
  border-left: 1px solid var(--c-line);
  background: var(--c-bg-raised);
}

.head {
  grid-area: head;
}

.foot {
  grid-area: foot;
}

/* --- La sala --- */
.room {
  position: relative;
  display: flex;
  flex-direction: column;
  grid-area: room;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  /* La luce dello schermo scende sulla sala. */
  background: radial-gradient(ellipse at 50% 0%, rgba(232, 163, 61, 0.1), transparent 60%);
}

.map {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.roomLocked .map {
  opacity: 0.55;
}

.seatNotice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 16px 24px 0;
  padding: 10px 12px;
  border: 1px solid rgba(212, 85, 58, 0.45);
  border-radius: var(--c-radius);
  background: var(--c-alarm-soft);
  color: var(--c-ink);
  font-size: 13px;
  line-height: 1.4;
}

/* --- Testata --- */
.headBar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 32px;
}

.barBtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px;
  border: 1px solid transparent;
  border-radius: var(--c-radius);
  background: none;
  color: var(--c-dim);
  font-family: var(--c-font-mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  cursor: pointer;
  transition: color var(--c-fast), border-color var(--c-fast);
}

.barBtn:hover {
  border-color: var(--c-line-strong);
  color: var(--c-ink);
}

.film {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.logo {
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 96px;
  object-fit: contain;
  object-position: left;
}

.title {
  margin: 0;
  font-family: var(--c-font-serif);
  font-size: 1.9rem;
  font-weight: 600;
  line-height: 1;
  color: var(--c-ink);
}

.facts {
  margin: 0;
  font-family: var(--c-font-mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--c-dim);
}

.alarm {
  color: var(--c-alarm);
}

.label {
  margin: 0;
  font-family: var(--c-font-mono);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--c-dim);
}

.when {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.whenDay {
  font-family: var(--c-font-mono);
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--c-ink);
}

.whenTime {
  font-family: var(--c-font-mono);
  font-size: 26px;
  line-height: 1.1;
  color: var(--c-amber);
}

.change {
  padding: 2px 0;
  border: 0;
  background: none;
  font-family: var(--c-font-mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--c-amber);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.choices {
  max-height: 220px;
  margin: 0;
  padding: 0;
  overflow: auto;
  border-top: 1px solid var(--c-line);
  list-style: none;
}

.choice {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 9px 4px;
  border: 0;
  border-bottom: 1px solid var(--c-line);
  background: none;
  color: var(--c-ink);
  font-family: var(--c-font-mono);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background var(--c-fast);
}

.choice:hover:not(:disabled) {
  background: var(--c-bg);
}

.choiceTime {
  color: var(--c-amber);
}

.choiceOn {
  color: var(--c-amber);
  cursor: default;
}

.choiceOff {
  opacity: 0.45;
  cursor: not-allowed;
}

.choiceOff .choiceTime {
  color: var(--c-dim);
}

/* --- Barra --- */
.summary {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  margin: 0;
}

.summary div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.summary dd {
  margin: 0;
  font-family: var(--c-font-mono);
  font-size: 15px;
  color: var(--c-ink);
}

.summary .seatsValue {
  color: var(--c-amber);
}

.proceed {
  width: 100%;
  padding: 14px 18px;
  border: 1px solid var(--c-amber);
  border-radius: var(--c-radius);
  background: var(--c-amber);
  color: var(--c-amber-ink);
  font-family: var(--c-font-mono);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background var(--c-fast), color var(--c-fast), border-color var(--c-fast);
}

.proceed:hover:not(:disabled) {
  background: #f0b458;
}

.proceed:disabled {
  border-color: var(--c-line-strong);
  background: none;
  color: var(--c-dim);
  cursor: not-allowed;
}

.hint,
.cutoff {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--c-dim);
}

.legal {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--c-line-strong);
  border-radius: var(--c-radius);
  font-size: 12px;
  line-height: 1.45;
  color: #cbbfae;
}

.legalAlarm {
  border-color: rgba(212, 85, 58, 0.5);
  background: var(--c-alarm-soft);
  color: var(--c-ink);
}

.checkoutBox {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.seatsBig {
  margin: 0;
  font-family: var(--c-font-mono);
  font-size: 16px;
  color: var(--c-amber);
}

/* --- Tutte le proiezioni (senza spettacolo) --- */
.picker {
  box-sizing: border-box;
  width: min(560px, 100%);
  margin: 24px auto;
  padding: 0 24px;
  list-style: none;
}

.pick {
  display: flex;
  align-items: baseline;
  gap: 16px;
  width: 100%;
  padding: 12px 4px;
  border: 0;
  border-bottom: 1px solid var(--c-line);
  background: none;
  color: var(--c-ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.pick:hover:not(:disabled) {
  background: var(--c-bg-raised);
}

.pickTime {
  min-width: 64px;
  font-family: var(--c-font-mono);
  font-size: 18px;
  color: var(--c-amber);
}

.pickDay {
  font-family: var(--c-font-mono);
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--c-dim);
}

.pickOff {
  opacity: 0.45;
  cursor: not-allowed;
}

.pickOff .pickTime {
  color: var(--c-dim);
  text-decoration: line-through;
}

.empty {
  margin: auto;
  padding: 48px 16px;
  text-align: center;
  font-family: var(--c-font-mono);
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--c-dim);
}

/* --- Caricamento, errore, esaurito --- */
.notice {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 48px 24px;
  text-align: center;
  background: var(--c-bg);
}

.noticeClose {
  position: absolute;
  top: 16px;
  right: 16px;
}

.noticeIcon {
  color: var(--c-amber);
}

.noticeTitle {
  margin: 0;
  font-family: var(--c-font-serif);
  font-size: 1.8rem;
  font-weight: 600;
  color: var(--c-ink);
}

.noticeText {
  max-width: 420px;
  margin: 0;
  line-height: 1.5;
  color: #cbbfae;
}

.noticeAction {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 16px;
  border: 1px solid var(--c-amber);
  border-radius: var(--c-radius);
  background: none;
  color: var(--c-amber);
  font-family: var(--c-font-mono);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
}

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* --- Prenotato: resta la colonna, larga, con la conferma --- */
.booked {
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  grid-template-areas:
    'head'
    'foot';
}

.booked::before,
.booked .room,
.booked .when,
.booked .choices {
  display: none;
}

.booked .head,
.booked .foot {
  border-left: 0;
  background: var(--c-bg);
}

.booked .foot {
  overflow: auto;
}

/* --- Telefono: testata, sala, barra --- */
@media (max-width: 768px) {
  .stage {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr) auto;
    grid-template-areas:
      'head'
      'room'
      'foot';
  }

  .stage::before {
    display: none;
  }

  .head,
  .foot {
    gap: 10px;
    padding: 10px 16px;
    border-left: 0;
  }

  .head {
    border-bottom: 1px solid var(--c-line);
  }

  .foot {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    padding-bottom: calc(12px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--c-line);
  }

  .logo {
    max-height: 40px;
  }

  .title {
    font-size: 1.3rem;
  }

  .facts,
  .when .label {
    display: none;
  }

  .when {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 10px;
  }

  .whenTime {
    font-size: 20px;
  }

  .summary {
    flex: 1;
  }

  .summary div:last-child,
  .hint,
  .cutoff {
    display: none;
  }

  .proceed {
    width: auto;
  }

  .legal,
  .checkoutBox {
    flex-basis: 100%;
  }

  .booked {
    grid-template-rows: auto minmax(0, 1fr);
  }
}
```

- [ ] **Passo 2: `SeatMap.module.css`**

Si salva `scratchpad/cabina-seats.py` e lo si lancia dalla radice.

```python
import re, sys

PATH = 'src/components/SeatMap.module.css'
css = open(PATH).read()

BLOCKS = {
'.screenCurve': '''.screenCurve {
  position: relative;
  width: 74%;
  height: 3px;
  border-radius: 50%;
  background: linear-gradient(90deg, transparent 0%, var(--c-amber, #e8a33d) 50%, transparent 100%);
  box-shadow: 0 0 28px rgba(232, 163, 61, 0.45);
}''',
'.screenLabel': '''.screenLabel {
  margin-top: 0.75rem;
  font-family: var(--c-font-mono, monospace);
  font-size: 0.6rem;
  letter-spacing: 0.34em;
  text-transform: uppercase;
  color: var(--c-dim, #8a7d6c);
}''',
'.selected': '''.selected {
  --seat-line: var(--c-amber, #e8a33d);
  --seat-fill: var(--c-amber, #e8a33d);
  color: var(--c-amber-ink, #1a130b);
  transform: translateY(-2px);
}''',
'.selected::before': '''.selected::before {
  box-shadow: 0 6px 18px rgba(232, 163, 61, 0.3);
}''',
'.dotSelected': '''.dotSelected { background: var(--c-amber, #e8a33d); border-color: var(--c-amber, #e8a33d); }''',
'.retryBtn': '''.retryBtn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  padding: 0.6rem 1.1rem;
  border: 1px solid var(--c-amber, #e8a33d);
  border-radius: var(--c-radius, 6px);
  background: none;
  color: var(--c-amber, #e8a33d);
  font-family: var(--c-font-mono, monospace);
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
}''',
'.retryBtn:hover': '''.retryBtn:hover {
  background: var(--c-amber-soft, rgba(232, 163, 61, 0.12));
}''',
'.retryBtn:focus-visible': '''.retryBtn:focus-visible {
  outline: 2px solid var(--c-amber, #e8a33d);
  outline-offset: 2px;
}''',
'.loadErrorIcon': '''.loadErrorIcon {
  color: var(--c-amber, #e8a33d);
}''',
}

for selector, block in BLOCKS.items():
    pattern = re.compile(r'(?m)^' + re.escape(selector) + r' \{[^}]*\}')
    css, n = pattern.subn(lambda m: block, css, count=1)
    if n != 1:
        sys.exit(f'regola non trovata: {selector}')

# Numeri di fila e di posto in mono; il bianco freddo diventa inchiostro caldo.
css = css.replace('font-family: var(--font-outfit), sans-serif;', 'font-family: var(--c-font-mono, monospace);')
css = css.replace('color: #fff;', 'color: var(--c-ink, #efe6d8);')
css = css.replace('rgba(255, 255, 255, ', 'rgba(239, 230, 216, ')

open(PATH, 'w').write(css)
print('ok')
```

```bash
python3 <scratchpad>/cabina-seats.py
grep -n "255, 255, 255\|#fff\b\|font-outfit" src/components/SeatMap.module.css
```

Atteso: `ok`, e il `grep` non trova niente.

- [ ] **Passo 3:** `npx tsc --noEmit`, poi commit dei compiti 3–7:

```bash
git add src/actions/bookingActions.ts src/components/BookingDrawer src/components/BookingFlow.tsx src/components/BookingFlow.module.css src/components/BookingRoom.tsx src/components/BookingTicket.tsx src/components/SeatMap.module.css
git commit -m "La prenotazione diventa la sala a tutto schermo, con la colonna a destra

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Compito 8: la conferma dell'età e il modulo dell'email

**File:**
- Riscrive: `src/components/AgeVerificationModal.tsx`, `src/components/AgeVerificationModal.module.css`
- Modifica: `src/components/CheckoutButton.tsx` (il bottone del modulo), `src/components/CheckoutButton.module.css` (le regole del modulo)

- [ ] **Passo 1: controllare chi usa la finestra dell'età**

```bash
grep -rn "AgeVerificationModal" src
```

Atteso: solo `BookingFlow.tsx`. Se c'è altro, ci si ferma e si guarda.

- [ ] **Passo 2: `AgeVerificationModal.tsx`**

```tsx
'use client';

import styles from './AgeVerificationModal.module.css';

interface AgeVerificationModalProps {
  onConfirm: () => void;
}

/**
 * Per gli spettacoli 18+ o VM18 (vedi `isVM18`): un sì o un no, niente di più.
 * "Annulla" torna alla home, come prima.
 */
export default function AgeVerificationModal({ onConfirm }: AgeVerificationModalProps) {
  return (
    <div className={styles.overlay} role="alertdialog" aria-modal="true" aria-labelledby="age-title" aria-describedby="age-text">
      <div className={styles.modal}>
        <p className={styles.kicker}>Vietato ai minori di 18 anni</p>
        <h2 id="age-title" className={styles.title}>Hai compiuto 18 anni?</h2>
        <p id="age-text" className={styles.message}>Per prenotare questo film serve la maggiore età.</p>
        <div className={styles.actions}>
          <button type="button" className={styles.rejectBtn} onClick={() => { window.location.href = '/'; }}>
            Annulla
          </button>
          <button type="button" className={styles.confirmBtn} onClick={onConfirm}>
            Sì, confermo
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Passo 3: `AgeVerificationModal.module.css`**

```css
/* La conferma dell'età: una finestra Cabina sopra la sala. */

.overlay {
  position: absolute;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(16, 13, 10, 0.92);
  animation: fadeIn var(--c-slow, 250ms) ease-out;
}

.modal {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 380px;
  padding: 28px 24px 24px;
  border: 1px solid var(--c-line, #2a231c);
  border-radius: var(--c-radius-lg, 10px);
  background: var(--c-bg-raised, #17130f);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
}

.kicker {
  margin: 0;
  font-family: var(--c-font-mono, monospace);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--c-alarm, #d4553a);
}

.title {
  margin: 0;
  font-family: var(--c-font-serif, Georgia, serif);
  font-size: 1.6rem;
  font-weight: 600;
  line-height: 1.1;
  color: var(--c-ink, #efe6d8);
}

.message {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: #cbbfae;
}

.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 8px;
}

.rejectBtn,
.confirmBtn {
  padding: 12px 14px;
  border-radius: var(--c-radius, 6px);
  font-family: var(--c-font-mono, monospace);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
}

.rejectBtn {
  border: 1px solid var(--c-line-strong, #3a3128);
  background: none;
  color: var(--c-ink, #efe6d8);
}

.confirmBtn {
  border: 1px solid var(--c-amber, #e8a33d);
  background: var(--c-amber, #e8a33d);
  color: var(--c-amber-ink, #1a130b);
  font-weight: 600;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .overlay {
    animation: none;
  }
}
```

- [ ] **Passo 4: il modulo dell'email in `CheckoutButton`**

In `CheckoutButton.tsx`, il bottone del modulo: `className={\`btn-primary ${styles.button}\`}` → `className={styles.button}`. Il `btn-primary` di `giantDownloadBtn`, nella schermata del biglietto, resta: è della tappa 5.

In `CheckoutButton.module.css` si riscrivono, con lo stesso script a blocchi (`scratchpad/cabina-checkout.py`), solo le regole del modulo:

```python
import re, sys

PATH = 'src/components/CheckoutButton.module.css'
css = open(PATH).read()

BLOCKS = {
'.container': '''.container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}''',
'.button': '''.button {
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

.button:disabled {
  border-color: var(--c-line-strong, #3a3128);
  background: none;
  color: var(--c-dim, #8a7d6c);
  cursor: not-allowed;
}''',
'.button:hover:not(:disabled)': '''.button:hover:not(:disabled) {
  background: #f0b458;
}''',
'.emailInput': '''.emailInput {
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
}''',
'.emailInput:focus': '''.emailInput:focus {
  border-color: var(--c-amber, #e8a33d);
}''',
'.error': '''.error {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid rgba(212, 85, 58, 0.5);
  border-radius: var(--c-radius, 6px);
  background: var(--c-alarm-soft, rgba(212, 85, 58, 0.1));
  color: var(--c-ink, #efe6d8);
  font-size: 13px;
  line-height: 1.4;
}''',
'.inputWrapper': '''.inputWrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
}''',
'.divider': '''.divider {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--c-font-mono, monospace);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--c-dim, #8a7d6c);
}''',
'.divider::before,\n.divider::after': '''.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--c-line, #2a231c);
}''',
'.anonymousBtn': '''.anonymousBtn {
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
}''',
'.anonymousBtn:hover:not(:disabled)': '''.anonymousBtn:hover:not(:disabled) {
  border-color: var(--c-dim, #8a7d6c);
}''',
}

for selector, block in BLOCKS.items():
    pattern = re.compile(r'(?m)^' + re.escape(selector) + r' \{[^}]*\}')
    css, n = pattern.subn(lambda m: block, css, count=1)
    if n != 1:
        sys.exit(f'regola non trovata: {selector}')

open(PATH, 'w').write(css)
print('ok')
```

- [ ] **Passo 5:** `npx tsc --noEmit && npm test`, poi commit:

```bash
git add src/components/AgeVerificationModal.tsx src/components/AgeVerificationModal.module.css src/components/CheckoutButton.tsx src/components/CheckoutButton.module.css
git commit -m "La domanda sull'età è un sì o un no, e l'email si chiede in veste cabina

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Compito 9: hero e calendario passano gli orari al cassetto

**File:**
- Modifica: `src/components/MovieShowcase/MovieShowcase.tsx` (il `<BookingDrawer>`)
- Modifica: `src/components/WeeklyCinemaCalendar/WeeklyCinemaCalendar.tsx` (il `<BookingDrawer>`)

- [ ] **Passo 1: l'hero**

```ts
import { choicesFromShowcase } from '../BookingDrawer/showChoices';
```

Al `<BookingDrawer>` si aggiunge `choices={choicesFromShowcase(activeMovie.subevents)}`. `activeMovie` viene dai film con la disponibilità dal vivo, quindi gli esauriti sono aggiornati.

- [ ] **Passo 2: il calendario**

```ts
import { choicesFromCalendar } from '../BookingDrawer/showChoices';
```

Al `<BookingDrawer>` si aggiunge `choices={selectedSubevent ? choicesFromCalendar(subEvents, selectedSubevent.id) : []}`.

- [ ] **Passo 3:** `npx tsc --noEmit && npm test`, poi commit:

```bash
git add src/components/MovieShowcase/MovieShowcase.tsx src/components/WeeklyCinemaCalendar/WeeklyCinemaCalendar.tsx
git commit -m "Dall'hero e dal calendario si può cambiare orario senza uscire dalla sala

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Compito 10: resoconto per Giovanni

**File:** nessuno. Il dev server **non** si avvia, e **nessuna prenotazione vera**: la prova della conferma la fa Giovanni, se vuole, su uno spettacolo di prova.

- [ ] **Passo 1:**

```bash
npx tsc --noEmit && npm test && git status --short
grep -rn "btn-primary" src/components/BookingFlow.tsx src/components/BookingTicket.tsx src/components/BookingRoom.tsx
```

Atteso: nessun errore, test verdi, nessun `btn-primary` nei file nuovi.

- [ ] **Passo 2: cosa provare**
- **Computer:** un clic su un orario dell'hero apre la prenotazione a schermo pieno.
  - A sinistra: lo schermo ambra e le poltrone; quelle scelte si riempiono d'ambra.
  - A destra: il logo, "Sala · lingua", il divieto, "Quando" con giorno e ora, i posti in forma breve (B5 · B6), "Gratuito", "Prenota 2 posti →".
- **Cambia orario:** l'elenco mostra solo gli orari di quel film. Scegliendone un altro la sala si ricarica, la selezione riparte da zero e la verifica dell'età si ripete se serve. Dal calendario è lo stesso.
- **Conferma:** dopo "Prenota", la colonna chiede l'email oppure "Continua senza email"; la sala resta visibile e spenta; "‹ Cambia posti" torna alla scelta.
- **Dopo la conferma** compare il biglietto di oggi, ancora nella vecchia veste (tappa 5), a colonna larga, con la ✕ in alto.
- **Film 18+:** la finestra "Hai compiuto 18 anni?"; "Annulla" torna alla home.
- **Un posto preso da un altro** mentre si sceglie: l'avviso rosso in cima alla sala.
- **Stati:** caricamento; Pretix irraggiungibile ("Orari non disponibili" con "Riprova"); spettacolo esaurito.
- **Telefono:** testata con logo piccolo, giorno e ora; la sala scorre al centro; la barra in basso ha i posti e "Prenota"; il bottone non finisce sotto la barra di Safari.
- **Esc** chiude, e il Tab resta dentro la prenotazione.
