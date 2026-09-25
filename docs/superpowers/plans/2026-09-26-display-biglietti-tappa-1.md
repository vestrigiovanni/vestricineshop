# Display e biglietti — Tappa 1: il display, sipario

> **Per chi esegue:** inline, un compito alla volta (niente subagenti). Caselle `- [ ]`.

**Obiettivo:** `/display-esterno` diventa il sipario scelto sui mockup.
- **Il palco:** il fondale a tutto schermo e, al centro, l'etichetta, il logo (o il titolo in Fraunces) e "un film di …".
- **La striscia in basso:** il conto alla rovescia, "A seguire" e la barra.
- **Il preroll** scritto sul palco, il conto finale a schermo pieno, il selettore e la finestra del preroll in Cabina.
- **Le regole restano quelle di oggi.**

**Architettura:**
- **Le regole** escono dalla pagina (489 righe) e vanno in `displayState.ts`, puro e coperto da vitest.
- **La pagina** tiene lo stato e compone tre file di disegno:
  - `DisplayStage` (il palco);
  - `DisplayFooter` (la striscia);
  - `DisplayOverlays` (conto finale, selettore, preroll).
- **Un foglio di stile solo**, riscritto. La pagina si avvolge in `.cabina` per avere variabili, caratteri e grana.

**Specifica:** `docs/superpowers/specs/2026-09-26-display-biglietti-cabina-design.md`, sezione 1.

**Differenze volute rispetto a oggi, tutte nella specifica:**
- via la locandina, il cast e il bollino del divieto;
- il selettore diventa un elenco con giorno e ora, senza locandine;
- gli orari si scrivono con `formatShowTime`, sul fuso della sala, al posto di `toZonedTime(...).toLocaleTimeString`;
- i confronti fra orari si fanno sui millisecondi. Prima si convertivano *entrambi* i lati con `toZonedTime`, che sposta i due valori della stessa quantità, quindi il risultato non cambia.

---

### Compito 1: le regole, prima i test

**File:** `src/app/display-esterno/displayState.test.ts`, `src/app/display-esterno/displayState.ts`

- [ ] **Passo 1: i test**

```ts
import { describe, expect, it } from 'vitest';
import { formatDuration, pickShows, sideFor, sideValue, stageFor, stageLabel, timerFor } from './displayState';

// Tre spettacoli: 18:00–20:00, 21:15–23:34, 23:40–01:30 (ora di Roma = UTC+2).
const A = { id: 1, title: 'Vermiglio', date_from: '2026-09-25T16:00:00.000Z', date_to: '2026-09-25T18:00:00.000Z' };
const B = { id: 2, title: 'Anora', date_from: '2026-09-25T19:15:00.000Z', date_to: '2026-09-25T21:34:00.000Z' };
const C = { id: 3, title: 'Perfect Days', date_from: '2026-09-25T21:40:00.000Z', date_to: '2026-09-25T23:30:00.000Z' };
const SHOWS = [A, B, C];
const at = (iso: string) => new Date(iso);
const PREROLL = 600; // 10 minuti

describe('pickShows', () => {
  it('durante un film: quello è in corso, poi i due dopo', () => {
    const r = pickShows(SHOWS, at('2026-09-25T20:00:00.000Z'), PREROLL);
    expect([r.current?.id, r.next?.id, r.following?.id]).toEqual([2, 3, undefined]);
  });
  it('il preroll conta già come "in corso"', () => {
    expect(pickShows(SHOWS, at('2026-09-25T19:06:00.000Z'), PREROLL).current?.id).toBe(2);
  });
  it('fra un film e l\'altro: niente in corso, il prossimo e quello dopo', () => {
    const r = pickShows(SHOWS, at('2026-09-25T18:30:00.000Z'), PREROLL);
    expect([r.current, r.next?.id, r.following?.id]).toEqual([null, 2, 3]);
  });
  it('a fine serata: niente', () => {
    expect(pickShows(SHOWS, at('2026-09-26T00:00:00.000Z'), PREROLL)).toEqual({ current: null, next: null, following: null });
  });
});

describe('formatDuration', () => {
  it('scrive ore e minuti a parole, arrotondando per eccesso', () => {
    expect(formatDuration(72 * 60_000)).toBe('1 ora e 12 minuti');
    expect(formatDuration(2 * 3_600_000)).toBe('2 ore');
    expect(formatDuration(60_000)).toBe('1 minuto');
    expect(formatDuration(90_000)).toBe('2 minuti');
  });
});

describe('timerFor', () => {
  it('senza spettacolo: in attesa', () => {
    expect(timerFor(null, at('2026-09-25T18:30:00.000Z'), PREROLL)).toMatchObject({ type: 'idle', label: 'In attesa di proiezioni' });
  });
  it('prima del preroll: "Inizio tra" fino all\'inizio del preroll', () => {
    // B inizia alle 19:15Z, il preroll alle 19:05Z: alle 18:30Z mancano 35 minuti.
    expect(timerFor(B, at('2026-09-25T18:30:00.000Z'), PREROLL)).toMatchObject({ type: 'preroll-countdown', label: 'Inizio tra', value: '35 minuti' });
  });
  it('l\'ultimo minuto prima del preroll è il conto finale, in secondi', () => {
    expect(timerFor(B, at('2026-09-25T19:04:18.000Z'), PREROLL)).toMatchObject({ type: 'final-countdown', label: 'Inizio fra', value: '42' });
  });
  it('durante il preroll, e "Buona visione" nell\'ultimo minuto', () => {
    expect(timerFor(B, at('2026-09-25T19:08:00.000Z'), PREROLL)).toMatchObject({ type: 'preroll-active', value: 'Il film inizierà a breve' });
    expect(timerFor(B, at('2026-09-25T19:14:30.000Z'), PREROLL)).toMatchObject({ type: 'preroll-active', value: 'Buona visione' });
  });
  it('durante il film: "Fine tra" e l\'avanzamento', () => {
    const t = timerFor(B, at('2026-09-25T20:22:00.000Z'), PREROLL);
    expect(t).toMatchObject({ type: 'playing', label: 'Fine tra', value: '1 ora e 12 minuti' });
    expect(Math.round(t.progress)).toBe(48);
  });
});

describe('stageFor, stageLabel, sideFor, sideValue', () => {
  const now = at('2026-09-25T20:00:00.000Z');
  const { current, next, following } = pickShows(SHOWS, now, PREROLL);

  it('in automatico il palco è il film in corso, e a lato il prossimo', () => {
    const stage = stageFor({ selected: null, current, next, swapped: false });
    expect(stage?.id).toBe(2);
    expect(stageLabel(stage, current)).toBe('In sala adesso');
    expect(sideFor({ selected: null, current, next, following, swapped: false })).toEqual({ show: C, label: 'Prossimo spettacolo' });
    expect(sideValue(C, false, now)).toBe('23:40');
  });

  it('scambiati: il prossimo sul palco, quello in corso a lato con i minuti che mancano', () => {
    const stage = stageFor({ selected: null, current, next, swapped: true });
    expect(stage?.id).toBe(3);
    expect(stageLabel(stage, current)).toBe('Prossimo spettacolo · 23:40');
    expect(sideFor({ selected: null, current, next, following, swapped: true })).toEqual({ show: B, label: 'Proiezione in corso' });
    expect(sideValue(B, true, now)).toBe('Fine tra 94 min');
  });

  it('fra un film e l\'altro, a lato c\'è quello dopo il prossimo', () => {
    const r = pickShows(SHOWS, at('2026-09-25T18:30:00.000Z'), PREROLL);
    expect(sideFor({ selected: null, ...r, swapped: false })).toEqual({ show: C, label: 'A seguire' });
  });

  it('scelto a mano: il palco è quello scelto', () => {
    expect(stageFor({ selected: A, current, next, swapped: false })?.id).toBe(1);
    expect(sideFor({ selected: A, current, next, following, swapped: false })?.show.id).toBe(2);
  });
});
```

- [ ] **Passo 2:** `npx vitest run src/app/display-esterno`. Atteso: FALLISCE (il modulo non esiste).

- [ ] **Passo 3: il modulo**

```ts
import { formatShowTime } from '@/utils/cinemaDate';

/**
 * Le regole del display all'ingresso, fuori dal disegno: quale spettacolo è
 * in sala, quale viene dopo, e cosa dice il conto alla rovescia. Sono quelle
 * della pagina di prima, portate qui per poterle provare.
 *
 * Gli orari si confrontano in millisecondi. Prima entrambi i lati passavano da
 * `toZonedTime`, che li sposta della stessa quantità: il risultato è lo stesso.
 */

export interface DisplayShow {
  id: number;
  date_from: string;
  date_to: string;
}

const MINUTE = 60_000;

/**
 * In corso: dall'inizio del preroll alla fine del film. Poi i due che vengono
 * dopo: dopo quello in corso, oppure, se non c'è, i primi che devono iniziare.
 */
export function pickShows<T extends DisplayShow>(shows: T[], now: Date, prerollSec: number) {
  const t = now.getTime();
  const preroll = prerollSec * 1000;
  const current = shows.find(s => t >= Date.parse(s.date_from) - preroll && t < Date.parse(s.date_to)) || null;
  const currentIdx = current ? shows.indexOf(current) : -1;
  const future = shows.filter((s, i) => (current ? i > currentIdx : Date.parse(s.date_from) > t));
  return { current, next: future[0] || null, following: future[1] || null };
}

export type TimerType = 'idle' | 'preroll-countdown' | 'final-countdown' | 'preroll-active' | 'playing';

export interface TimerState {
  type: TimerType;
  label: string;
  value: string;
  /** Solo durante il film: da 0 a 100. */
  progress: number;
}

/** "1 ora e 12 minuti", arrotondando al minuto per eccesso, come prima. */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.ceil(ms / MINUTE);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const h = hours === 1 ? 'ora' : 'ore';
  const m = mins === 1 ? 'minuto' : 'minuti';
  if (hours > 0) return mins === 0 ? `${hours} ${h}` : `${hours} ${h} e ${mins} ${m}`;
  return `${mins} ${m}`;
}

/**
 * Il conto alla rovescia per uno spettacolo:
 * - prima: "Inizio tra", fino all'inizio del preroll;
 * - l'ultimo minuto prima del preroll: il conto finale, in secondi;
 * - durante il preroll: "Il film inizierà a breve", e "Buona visione"
 *   nell'ultimo minuto;
 * - durante il film: "Fine tra" e l'avanzamento.
 */
export function timerFor(show: DisplayShow | null, now: Date, prerollSec: number): TimerState {
  if (!show) return { type: 'idle', label: 'In attesa di proiezioni', value: '--:--', progress: 0 };

  const t = now.getTime();
  const start = Date.parse(show.date_from);
  const end = Date.parse(show.date_to);
  const prerollStart = start - prerollSec * 1000;

  if (t < start) {
    if (t >= prerollStart) {
      return start - t <= MINUTE
        ? { type: 'preroll-active', label: '', value: 'Buona visione', progress: 0 }
        : { type: 'preroll-active', label: '', value: 'Il film inizierà a breve', progress: 0 };
    }
    const toPreroll = prerollStart - t;
    if (toPreroll <= MINUTE) {
      return { type: 'final-countdown', label: 'Inizio fra', value: String(Math.floor((toPreroll % MINUTE) / 1000)), progress: 0 };
    }
    return { type: 'preroll-countdown', label: 'Inizio tra', value: formatDuration(toPreroll), progress: 0 };
  }

  return {
    type: 'playing',
    label: 'Fine tra',
    value: formatDuration(Math.max(0, end - t)),
    progress: Math.min(100, ((t - start) / (end - start)) * 100),
  };
}

/** Chi sta sul palco: lo scelto a mano, altrimenti in corso o prossimo (scambiabili). */
export function stageFor<T extends DisplayShow>(o: { selected: T | null; current: T | null; next: T | null; swapped: boolean }): T | null {
  return o.selected || (o.swapped && o.next ? o.next : o.current || o.next);
}

/** Chi dà il conto alla rovescia: come il palco, ma scambiato senza prossimo non torna al corrente. */
export function timerShowFor<T extends DisplayShow>(o: { selected: T | null; current: T | null; next: T | null; swapped: boolean }): T | null {
  return o.selected || (o.swapped ? o.next : o.current || o.next);
}

export function stageLabel(stage: DisplayShow | null, current: DisplayShow | null): string {
  if (!stage) return '';
  if (current && stage.id === current.id) return 'In sala adesso';
  return `Prossimo spettacolo · ${formatShowTime(stage.date_from)}`;
}

/** "A seguire": l'altro film, con l'etichetta che dice cos'è. */
export function sideFor<T extends DisplayShow>(o: {
  selected: T | null;
  current: T | null;
  next: T | null;
  following: T | null;
  swapped: boolean;
}): { show: T; label: string } | null {
  const { selected, current, next, following, swapped } = o;
  const show = selected
    ? (current?.id === selected.id ? next : current)
    : (swapped ? current : (current ? next : following));
  if (!show) return null;
  const label = current && show.id === current.id ? 'Proiezione in corso' : current ? 'Prossimo spettacolo' : 'A seguire';
  return { show, label };
}

/** Accanto al titolo: l'ora d'inizio, oppure, se scambiati, quanto manca alla fine. */
export function sideValue(show: DisplayShow, swapped: boolean, now: Date): string {
  if (!swapped) return formatShowTime(show.date_from);
  const mins = Math.floor(Math.max(0, Date.parse(show.date_to) - now.getTime()) / MINUTE);
  return `Fine tra ${mins} min`;
}
```

- [ ] **Passo 4:** `npx vitest run src/app/display-esterno`. Atteso: PASSA. Commit:

```bash
git add src/app/display-esterno/displayState.ts src/app/display-esterno/displayState.test.ts
git commit -m "Le regole del display escono dalla pagina, e si possono provare"
```

(con la riga `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`)

---

### Compito 2: palco, striscia e finestre

**File:** `src/app/display-esterno/DisplayStage.tsx`, `DisplayFooter.tsx`, `DisplayOverlays.tsx`

- [ ] **Passo 1: `DisplayStage.tsx`**

```tsx
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import type { DisplayMovieData } from '@/actions/displayActions';
import styles from './DisplayEsterno.module.css';

interface DisplayStageProps {
  movie: DisplayMovieData | null;
  label: string;
  /** Il film sul palco è quello in sala adesso: l'etichetta prende il punto. */
  live: boolean;
  /** Durante il preroll: "Il film inizierà a breve" / "Buona visione". */
  notice: string | null;
  fading: boolean;
}

/** Il palco: il fondale a tutto schermo e, al centro, il film. */
export default function DisplayStage({ movie, label, live, notice, fading }: DisplayStageProps) {
  if (!movie) {
    return (
      <div className={styles.stage}>
        <div className={styles.center}>
          <h1 className={styles.house}>Vestri Cinema</h1>
          <p className={styles.houseSub}>Prossimamente in sala</p>
        </div>
      </div>
    );
  }

  const fade = fading ? ` ${styles.faded}` : '';

  return (
    <div className={styles.stage}>
      {movie.backdropPath && (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={movie.id} src={getTMDBImageUrl(movie.backdropPath, 'original')!} alt="" className={`${styles.backdrop}${fade}`} />
      )}
      <div className={styles.vignette} />
      <div className={`${styles.center}${fade}`}>
        {label && !notice && <p className={styles.stageLabel}>{live ? '● ' : ''}{label}</p>}
        {movie.logoPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={getTMDBImageUrl(movie.logoPath, 'w500')!} alt={movie.title} className={styles.logo} />
        ) : (
          <h1 className={styles.title}>{movie.title}</h1>
        )}
        {notice
          ? <p className={styles.notice}>{notice}</p>
          : movie.director && <p className={styles.byline}>un film di {movie.director}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Passo 2: `DisplayFooter.tsx`**

```tsx
import type { TimerState } from './displayState';
import styles from './DisplayEsterno.module.css';

interface DisplayFooterProps {
  timer: TimerState;
  side: { label: string; value: string; title: string } | null;
  /** Scambiati o scelto a mano: "A seguire" lo dice. */
  swapped: boolean;
  onSwap: () => void;
  onOpenSelector: () => void;
}

/** La striscia in basso: il conto alla rovescia, "A seguire" e la barra. */
export default function DisplayFooter({ timer, side, swapped, onSwap, onOpenSelector }: DisplayFooterProps) {
  return (
    <div className={styles.footer}>
      <div className={styles.timer}>
        {timer.type !== 'preroll-active' && (
          <>
            {timer.label && <span className={styles.footLabel}>{timer.label}</span>}
            <span className={styles.timerValue}>{timer.value}</span>
          </>
        )}
      </div>

      {side && (
        <button
          type="button"
          className={swapped ? `${styles.side} ${styles.sideSwapped}` : styles.side}
          onClick={onSwap}
          onDoubleClick={onOpenSelector}
          title="Clic per scambiare · doppio clic per scegliere"
        >
          <span className={styles.footLabel}>{side.label}{swapped ? ' · reset' : ''}</span>
          <span className={styles.sideLine}>
            <span className={styles.sideTime}>{side.value}</span> <span className={styles.sideTitle}>{side.title}</span>
          </span>
        </button>
      )}

      {timer.type === 'playing' && (
        <div className={styles.progress}><b style={{ width: `${timer.progress}%` }} /></div>
      )}
    </div>
  );
}
```

- [ ] **Passo 3: `DisplayOverlays.tsx`**

```tsx
import type { DisplayMovieData } from '@/actions/displayActions';
import { formatShowDayLabel, formatShowTime } from '@/utils/cinemaDate';
import styles from './DisplayEsterno.module.css';

/** L'ultimo minuto prima del preroll: solo i secondi, enormi. */
export function FinalCountdown({ seconds, title }: { seconds: string; title: string }) {
  return (
    <div className={styles.final}>
      <span className={styles.footLabel}>Inizio fra</span>
      <span className={styles.finalValue}>{seconds}</span>
      <span className={styles.footLabel}>secondi{title ? ` · ${title}` : ''}</span>
    </div>
  );
}

/** S: per chi sta in cabina, scegliere a mano lo spettacolo sul palco. */
export function ShowSelector({ shows, selectedId, onPick, onAuto }: {
  shows: DisplayMovieData[];
  selectedId: number | null;
  onPick: (id: number) => void;
  onAuto: () => void;
}) {
  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <p className={styles.panelTitle}>Scegli lo spettacolo · S</p>
        <ul className={styles.selList}>
          {shows.map(s => (
            <li key={s.id}>
              <button
                type="button"
                className={s.id === selectedId ? `${styles.selItem} ${styles.selItemOn}` : styles.selItem}
                onClick={() => onPick(s.id)}
              >
                <span className={styles.selTime}>{formatShowDayLabel(s.date_from)} {formatShowTime(s.date_from)}</span>
                <span className={styles.selTitle}>{s.title}</span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className={styles.ghostBtn} onClick={onAuto}>Torna in automatico</button>
      </div>
    </div>
  );
}

/** P: quanto dura la pubblicità prima del film. */
export function PrerollDialog({ mins, secs, onMins, onSecs, onConfirm, onCancel }: {
  mins: string;
  secs: string;
  onMins: (v: string) => void;
  onSecs: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const n = (v: string) => parseInt(v) || 0;
  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <p className={styles.panelTitle}>Durata del preroll · P</p>
        <div className={styles.quick}>
          <button type="button" className={styles.quickBtn} onClick={() => onMins(String(Math.max(0, n(mins) - 1)))}>−1 min</button>
          <button type="button" className={styles.quickBtn} onClick={() => onMins(String(n(mins) + 1))}>+1 min</button>
          <button type="button" className={styles.quickBtn} onClick={() => onSecs(String(Math.max(0, n(secs) - 10)))}>−10 sec</button>
          <button type="button" className={styles.quickBtn} onClick={() => onSecs(String(n(secs) + 10))}>+10 sec</button>
        </div>
        <div className={styles.fields}>
          <label className={styles.field}>
            <span className={styles.footLabel}>Minuti</span>
            <input type="number" value={mins} onChange={e => onMins(e.target.value)} className={styles.input} autoFocus />
          </label>
          <span className={styles.colon}>:</span>
          <label className={styles.field}>
            <span className={styles.footLabel}>Secondi</span>
            <input type="number" value={secs} onChange={e => onSecs(e.target.value)} className={styles.input} />
          </label>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.ghostBtn} onClick={onCancel}>Annulla</button>
          <button type="button" className={styles.primaryBtn} onClick={onConfirm}>Conferma</button>
        </div>
      </div>
    </div>
  );
}
```

---

### Compito 3: la pagina tiene lo stato e compone

**File:** riscrive `src/app/display-esterno/page.tsx`

Restano identici:
- `fetchData` e i due intervalli (dati ogni 30 secondi, orologio ogni secondo);
- il `?preroll=` dall'indirizzo;
- i tasti (F, S, Q, P, Esc);
- `toggleFullscreen` e `handleSwap` (dissolvenza di 400 ms);
- il ritorno automatico al film in corso (`lastMovieId`).

```tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import { getDisplayData, DisplayMovieData } from '@/actions/displayActions';
import { pickShows, sideFor, sideValue, stageFor, stageLabel, timerFor, timerShowFor, type TimerState } from './displayState';
import DisplayStage from './DisplayStage';
import DisplayFooter from './DisplayFooter';
import { FinalCountdown, PrerollDialog, ShowSelector } from './DisplayOverlays';
import styles from './DisplayEsterno.module.css';

const IDLE: TimerState = { type: 'idle', label: '', value: '--:--', progress: 0 };

export default function DisplayEsterno() {
  // …stati, fetchData, effetti dei dati e dei tasti, toggleFullscreen, handleSwap:
  //    copiati identici dalla pagina di prima (righe 14–104)…

  const { current, next, following } = useMemo(
    () => (now ? pickShows(movies, now, preroll) : { current: null, next: null, following: null }),
    [movies, now, preroll]
  );

  const selected = useMemo(
    () => (selectedMovieId ? movies.find(m => m.id === selectedMovieId) || null : null),
    [selectedMovieId, movies]
  );

  const timerShow = timerShowFor({ selected, current, next, swapped: isSwapped });
  const timer = now ? timerFor(timerShow, now, preroll) : IDLE;

  // …effetto del ritorno automatico (lastMovieId), copiato identico, con
  //    `currentMovie` → `current`…

  const stage = stageFor({ selected, current, next, swapped: isSwapped });
  const side = isSideBoxVisible ? sideFor({ selected, current, next, following, swapped: isSwapped }) : null;

  if (loading) {
    return (
      <div className={`cabina ${styles.screen}`}>
        <p className={styles.loading}>Caricamento display…</p>
      </div>
    );
  }

  return (
    <div className={`cabina ${styles.screen}${(showSelector || showPrerollModal) ? ` ${styles.showCursor}` : ''}`}>
      <button type="button" onClick={toggleFullscreen} className={styles.fullscreenBtn} title="Premi F per lo schermo intero" aria-label="Schermo intero">
        {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
      </button>

      {timer.type === 'final-countdown' ? (
        <FinalCountdown seconds={timer.value} title={timerShow?.title || ''} />
      ) : (
        <>
          <DisplayStage
            movie={stage}
            label={stageLabel(stage, current)}
            live={!!stage && !!current && stage.id === current.id}
            notice={timer.type === 'preroll-active' ? timer.value : null}
            fading={transitioning}
          />
          <DisplayFooter
            timer={timer}
            side={side && now ? { label: side.label, value: sideValue(side.show, isSwapped, now), title: side.show.title } : null}
            swapped={isSwapped || !!selectedMovieId}
            onSwap={handleSwap}
            onOpenSelector={() => setShowSelector(true)}
          />
        </>
      )}

      {showSelector && (
        <ShowSelector
          shows={movies}
          selectedId={selectedMovieId}
          onPick={id => { setSelectedMovieId(id); setShowSelector(false); setIsSwapped(false); }}
          onAuto={() => { setSelectedMovieId(null); setShowSelector(false); }}
        />
      )}

      {showPrerollModal && (
        <PrerollDialog
          mins={prerollMins}
          secs={prerollSecs}
          onMins={setPrerollMins}
          onSecs={setPrerollSecs}
          onConfirm={() => {
            setPreroll((parseInt(prerollMins) || 0) * 60 + (parseInt(prerollSecs) || 0));
            setShowPrerollModal(false);
          }}
          onCancel={() => setShowPrerollModal(false)}
        />
      )}
    </div>
  );
}
```

Via gli import non più usati: `getTMDBImageUrl`, `RatingBadge`, `toZonedTime`, `TIMEZONE`.

---

### Compito 4: il foglio di stile

**File:** riscrive `src/app/display-esterno/DisplayEsterno.module.css`

```css
/* Il display all'ingresso: il sipario. Le variabili vengono da `.cabina`
 * (components/cabina/cabina.css), che avvolge la pagina. Le misure seguono lo
 * schermo (vw, vh): è un televisore, si legge da lontano. */

.screen {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--c-bg);
  color: var(--c-ink);
  cursor: none;
}

.showCursor {
  cursor: default;
}

.loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  font-family: var(--c-font-mono);
  font-size: 1.2vw;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--c-dim);
}

.fullscreenBtn {
  position: absolute;
  top: 2vw;
  right: 2vw;
  z-index: 20;
  display: flex;
  padding: 10px;
  border: 1px solid var(--c-line-strong);
  border-radius: var(--c-radius);
  background: rgba(16, 13, 10, 0.6);
  color: var(--c-ink);
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--c-slow);
}

.screen:hover .fullscreenBtn {
  opacity: 1;
}

/* --- Il palco --- */
.stage {
  position: absolute;
  inset: 0;
}

.backdrop {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  animation: drift 40s ease-in-out infinite alternate;
}

@keyframes drift {
  from { transform: scale(1); }
  to { transform: scale(1.08); }
}

.vignette {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at center, rgba(16, 13, 10, 0.1) 25%, rgba(16, 13, 10, 0.88) 100%),
    linear-gradient(0deg, rgba(16, 13, 10, 0.92) 0%, transparent 35%);
}

.center {
  position: absolute;
  inset: 0 0 12vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.8vh;
  padding: 0 8vw;
  text-align: center;
}

.backdrop,
.center {
  transition: opacity 400ms ease;
}

.faded {
  opacity: 0;
}

.stageLabel {
  margin: 0;
  font-family: var(--c-font-mono);
  font-size: 1.1vw;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--c-amber);
}

.logo {
  max-width: 46vw;
  max-height: 26vh;
  object-fit: contain;
  filter: drop-shadow(0 6px 40px rgba(0, 0, 0, 0.7));
}

.title {
  margin: 0;
  font-family: var(--c-font-serif);
  font-size: 7vw;
  font-weight: 600;
  line-height: 0.95;
  letter-spacing: -0.01em;
  text-shadow: 0 4px 40px rgba(0, 0, 0, 0.7);
}

.byline {
  margin: 0;
  font-family: var(--c-font-serif);
  font-size: 1.7vw;
  font-style: italic;
  color: #cbbfae;
}

.notice {
  margin: 1vh 0 0;
  font-family: var(--c-font-mono);
  font-size: 1.7vw;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--c-amber);
  animation: pulse 2.4s ease-in-out infinite;
}

@keyframes pulse {
  50% { opacity: 0.45; }
}

.house {
  margin: 0;
  font-family: var(--c-font-serif);
  font-size: 5vw;
  font-weight: 600;
}

.houseSub {
  margin: 0;
  font-family: var(--c-font-mono);
  font-size: 1vw;
  letter-spacing: 0.4em;
  text-transform: uppercase;
  color: var(--c-dim);
}

/* --- La striscia in basso --- */
.footer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 4vw;
  padding: 0 5vw 6vh;
}

.timer {
  display: flex;
  flex-direction: column;
  gap: 0.6vh;
}

.footLabel {
  font-family: var(--c-font-mono);
  font-size: 0.9vw;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--c-dim);
}

.timerValue {
  font-family: var(--c-font-mono);
  font-size: 2.6vw;
  color: var(--c-amber);
}

.side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.6vh;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  text-align: right;
  cursor: inherit;
}

.sideSwapped .footLabel {
  color: var(--c-amber);
}

.sideLine {
  font-size: 1.6vw;
}

.sideTime {
  font-family: var(--c-font-mono);
  color: var(--c-amber);
}

.sideTitle {
  font-family: var(--c-font-serif);
}

.progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 4px;
  background: var(--c-line);
}

.progress b {
  display: block;
  height: 100%;
  background: var(--c-amber);
  transition: width 1s linear;
}

/* --- Il conto finale --- */
.final {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2vh;
  background: var(--c-bg-sunken);
}

.finalValue {
  font-family: var(--c-font-mono);
  font-size: 30vh;
  line-height: 1;
  color: var(--c-amber);
  font-variant-numeric: tabular-nums;
}

/* --- Le finestre per la cabina (S, P) --- */
.overlay {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(11, 9, 7, 0.92);
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: min(680px, 80vw);
  max-height: 80vh;
  padding: 28px;
  overflow: hidden;
  border: 1px solid var(--c-line);
  border-radius: var(--c-radius-lg);
  background: var(--c-bg-raised);
}

.panelTitle {
  margin: 0;
  font-family: var(--c-font-mono);
  font-size: 12px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--c-amber);
}

.selList {
  margin: 0;
  padding: 0;
  overflow: auto;
  border-top: 1px solid var(--c-line);
  list-style: none;
}

.selItem {
  display: grid;
  grid-template-columns: 200px 1fr;
  align-items: baseline;
  gap: 16px;
  width: 100%;
  padding: 12px 6px;
  border: 0;
  border-bottom: 1px solid var(--c-line);
  background: none;
  color: var(--c-ink);
  text-align: left;
  cursor: pointer;
}

.selItem:hover {
  background: var(--c-bg);
}

.selItemOn {
  background: var(--c-amber-soft);
}

.selTime {
  font-family: var(--c-font-mono);
  font-size: 15px;
  color: var(--c-amber);
  text-transform: uppercase;
}

.selTitle {
  font-family: var(--c-font-serif);
  font-size: 20px;
}

.quick {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.quickBtn {
  padding: 10px;
  border: 1px solid var(--c-line-strong);
  border-radius: var(--c-radius);
  background: none;
  color: var(--c-ink);
  font-family: var(--c-font-mono);
  font-size: 12px;
  cursor: pointer;
}

.quickBtn:hover {
  border-color: var(--c-dim);
}

.fields {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.input {
  width: 110px;
  padding: 10px;
  border: 1px solid var(--c-line-strong);
  border-radius: var(--c-radius);
  outline: none;
  background: var(--c-bg);
  color: var(--c-amber);
  font-family: var(--c-font-mono);
  font-size: 36px;
  text-align: center;
}

.input:focus {
  border-color: var(--c-amber);
}

.colon {
  padding-bottom: 12px;
  font-family: var(--c-font-mono);
  font-size: 36px;
  color: var(--c-dim);
}

.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.ghostBtn,
.primaryBtn {
  padding: 11px 16px;
  border: 1px solid var(--c-amber);
  border-radius: var(--c-radius);
  font-family: var(--c-font-mono);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
}

.ghostBtn {
  align-self: flex-start;
  background: none;
  color: var(--c-amber);
}

.primaryBtn {
  background: var(--c-amber);
  color: var(--c-amber-ink);
  font-weight: 600;
}

.actions .ghostBtn {
  align-self: stretch;
  border-color: var(--c-line-strong);
  color: var(--c-ink);
}

@media (prefers-reduced-motion: reduce) {
  .backdrop,
  .notice {
    animation: none;
  }
}
```

- [ ] **Passo finale:** `npx tsc --noEmit && npm test`. Commit:

```bash
git add src/app/display-esterno
git commit -m "Il display all'ingresso diventa un sipario"
```

(con la riga `Co-Authored-By`)

- [ ] **Cosa provare** (Giovanni, sul suo dev server, `/display-esterno`):
  - con un film in corso: fondale, logo, "un film di …", "Fine tra", "A seguire", la barra;
  - premi P e metti un preroll lungo, per vedere "Il film inizierà a breve", poi "Buona visione", poi il conto finale in secondi;
  - premi S: l'elenco con giorno e ora, la scelta e "Torna in automatico";
  - premi Q: "A seguire" sparisce;
  - clic su "A seguire": scambio; doppio clic: il selettore;
  - F: schermo intero;
  - senza spettacoli: "Vestri Cinema · Prossimamente in sala".
