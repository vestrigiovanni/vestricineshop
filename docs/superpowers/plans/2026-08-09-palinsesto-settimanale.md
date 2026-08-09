# Il palinsesto settimanale — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere a `/admin/programmazione` una vista "Il palinsesto" dove la settimana già programmata si legge a colpo d'occhio e ogni singolo spettacolo si può spostare o eliminare, con avvisi che spiegano cosa comporta.

**Architecture:** Un terzo modo nel wizard esistente, non una pagina nuova: riusa sala/periodo, la griglia a colonne-giorno e le card già stilate del passo 3. La matematica dello spostamento (giorno + orario → minuto globale, con l'esclusione dello spettacolo che si muove) diventa una funzione pura in `services/scheduling/move.ts`, testata; le due azioni server nuove sono guscio sottile sopra `checkSlot`, `planningDeleteShow` e `adminUpdateEventDate`.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, TypeScript, CSS Modules, Vitest, Prisma/Postgres, API Pretix.

**Spec:** `docs/superpowers/specs/2026-08-09-palinsesto-settimanale-design.md`

---

## Struttura dei file

| File | Responsabilità |
|---|---|
| `src/services/scheduling/move.ts` *(nuovo)* | **puro**: giorno+orario → minuto globale, esclusione di sé stesso, verdetto via `checkSlot` |
| `src/services/scheduling/move.test.ts` *(nuovo)* | i casi in cui si sbaglia: la nottata, sé stesso, il conflitto vero |
| `src/actions/planningActions.ts` | `planningCheckMove`, `planningMoveShow`, `MoveCheck`; `tmdbId`/`posterPath` su `ExistingShow` |
| `src/app/admin/programmazione/Palinsesto.tsx` *(nuovo)* | la vista: griglia, card, trascinamento, orario a mano; conduce il flusso |
| `src/app/admin/programmazione/MovePanel.tsx` *(nuovo)* | il pannello di conferma: i quattro esiti, la spunta consapevole, l'eliminazione |
| `src/app/admin/programmazione/types.ts` | `PlanningMode` accoglie `'palinsesto'` |
| `src/app/admin/programmazione/page.tsx` | il terzo modo, il ramo che nasconde passi e footer, il ricarico |
| `src/app/admin/programmazione/Programmazione.module.css` | solo il pannello modale e lo stato "passato": le card si riusano |

Due componenti e non uno: la griglia disegna la settimana, il pannello conduce una decisione irreversibile. Sono due mestieri, e tenerli separati permette di leggere il secondo senza scorrere il primo.

---

## Task 1: La matematica dello spostamento, pura e testata

**Files:**
- Create: `src/services/scheduling/move.ts`
- Test: `src/services/scheduling/move.test.ts`

Perché esiste questo modulo invece di due righe dentro l'azione: la conversione giorno+orario → minuto globale è il punto dove un errore vale **un giorno intero** e non se ne accorge nessuno, e l'esclusione dello spettacolo da sé stesso è la ragione per cui, senza, spostare un film di dieci minuti risulterebbe "occupato… da sé".

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `src/services/scheduling/move.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { planMove } from './move';
import { MINUTES_PER_DAY, MIN_GAP_MINUTES } from './times';

/** Uno spettacolo in sala, con la pausa già inclusa nella fine. */
const inRoom = (pretixId: number, dayIndex: number, clockHour: number, runtime: number) => ({
  pretixId,
  start: dayIndex * MINUTES_PER_DAY + Math.round(clockHour * 60),
  end: dayIndex * MINUTES_PER_DAY + Math.round(clockHour * 60) + runtime + MIN_GAP_MINUTES,
});

const isMoving = (id: number) => (o: { pretixId: number }) => o.pretixId === id;

describe('planMove', () => {
  it('spostare di dieci minuti non è un conflitto con sé stessi', () => {
    const me = inRoom(1, 2, 21, 110);
    const res = planMove({
      runtime: 110, dayIndex: 2, clock: 21 * 60 + 10,
      occupied: [me], isMoving: isMoving(1),
    });

    expect(res.ok).toBe(true);
    expect(res.clashes).toEqual([]);
  });

  it('un altro spettacolo nello stesso posto torna indietro identificato', () => {
    const me = inRoom(1, 2, 15, 110);
    const other = inRoom(2, 2, 21, 130);
    const res = planMove({
      runtime: 110, dayIndex: 2, clock: 21 * 60,
      occupied: [me, other], isMoving: isMoving(1),
    });

    expect(res.ok).toBe(false);
    expect(res.problem).toBe('occupied');
    expect(res.clashes.map((c) => c.pretixId)).toEqual([2]);
  });

  it('le 00:30 scritte nella colonna di sabato sono la nottata di sabato', () => {
    const res = planMove({
      runtime: 30, dayIndex: 5, clock: 30,
      occupied: [], isMoving: isMoving(1),
    });

    // Il minuto cade nella data di calendario successiva…
    expect(res.startMinute).toBe(6 * MINUTES_PER_DAY + 30);
    // …ma la serata a cui appartiene resta quella di sabato.
    expect(res.dayIndex).toBe(5);
    expect(res.ok).toBe(true);
  });

  it('nella nottata la chiusura conta lo stesso: alle 00:30 un film intero non ci sta', () => {
    const res = planMove({
      runtime: 100, dayIndex: 5, clock: 30,
      occupied: [], isMoving: isMoving(1),
    });

    // Partendo alle 00:30 finirebbe alle 02:10, oltre la chiusura dell'01:00.
    expect(res.dayIndex).toBe(5);
    expect(res.problem).toBe('afterClosing');
  });

  it('le 03:00 non sono la nottata: sono la mattina, e il cinema apre alle 10', () => {
    const res = planMove({
      runtime: 100, dayIndex: 5, clock: 3 * 60,
      occupied: [], isMoving: isMoving(1),
    });

    expect(res.ok).toBe(false);
    expect(res.problem).toBe('beforeOpening');
  });

  it('un orario già passato è passato, e viene prima di ogni altra obiezione', () => {
    const res = planMove({
      runtime: 100, dayIndex: 0, clock: 21 * 60,
      occupied: [inRoom(2, 0, 21, 100)], isMoving: isMoving(1),
      notBefore: 3 * MINUTES_PER_DAY,
    });

    expect(res.problem).toBe('past');
  });
});
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

```bash
npx vitest run src/services/scheduling/move.test.ts
```

Atteso: FAIL — `Failed to load url ./move` (il modulo non esiste ancora).

- [ ] **Step 3: Scrivi l'implementazione minima**

Crea `src/services/scheduling/move.ts`:

```ts
/**
 * Spostare uno spettacolo che è già in sala.
 *
 * È `checkSlot` con due differenze, ed entrambe sono la ragione per cui questo
 * modulo esiste invece di due righe dentro l'azione:
 *
 * 1. **Lo spettacolo che si muove non fa conflitto con sé stesso.** Senza
 *    escluderlo, spostare un film dalle 21:00 alle 21:10 risponderebbe
 *    «occupato» — da sé.
 * 2. **L'orario è quello della colonna in cui si scrive.** Scrivere 00:30 nella
 *    colonna di sabato vuol dire la nottata di sabato — data di calendario
 *    successiva, stessa serata — e la conversione la fa `globalMinuteOf`, che
 *    di quella regola è già il padrone. Qui non si rifà: rifarla è esattamente
 *    il modo in cui le due copie prima o poi divergono.
 *
 * Come tutto ciò che sta in `services/scheduling`, è una funzione pura: non
 * conosce Pretix, il database né l'ora corrente. `notBefore` è un parametro.
 */

import type { Interval } from './engine';
import { checkSlot, type SlotCheck } from './freeSlots';
import { globalMinuteOf } from './times';

export interface PlanMoveInput<T extends Interval> {
  /** Durata dello spettacolo che si sposta, in minuti. */
  runtime: number;
  /** Giorno di *programmazione* di destinazione, come indice nella finestra. */
  dayIndex: number;
  /** Orario scelto, in minuti dalla mezzanotte. */
  clock: number;
  /** Tutto ciò che occupa la sala, incluso lo spettacolo che si sta muovendo. */
  occupied: T[];
  /** Quale degli intervalli è lo spettacolo che si sta muovendo. */
  isMoving: (interval: T) => boolean;
  /** Minuto globale prima del quale non si programma. */
  notBefore?: number;
}

/**
 * Dove finisce lo spettacolo e se ci può stare. `startMinute` è il minuto
 * globale risolto: chi chiama non deve rifare la conversione, che è
 * esattamente il punto in cui le due copie divergerebbero.
 */
export function planMove<T extends Interval>(
  input: PlanMoveInput<T>
): SlotCheck<T> & { startMinute: number } {
  const { runtime, dayIndex, clock, occupied, isMoving, notBefore } = input;

  const startMinute = globalMinuteOf(dayIndex, clock);

  const others = occupied.filter((o) => !isMoving(o));

  return { ...checkSlot({ runtime, startMinute, occupied: others, notBefore }), startMinute };
}
```

- [ ] **Step 4: Lancia i test e verifica che passino**

```bash
npx vitest run src/services/scheduling/move.test.ts
```

Atteso: PASS, 5 test.

- [ ] **Step 5: Lancia tutta la suite, per sicurezza**

```bash
npm test
```

Atteso: PASS, nessuna regressione.

- [ ] **Step 6: Commit**

```bash
git add src/services/scheduling/move.ts src/services/scheduling/move.test.ts
git commit -m "Spostare uno spettacolo: la matematica, pura e testata"
```

---

## Task 2: Poster e tmdbId sulle proiezioni esistenti

**Files:**
- Modify: `src/actions/planningActions.ts` (interfaccia `ExistingShow` ~riga 43; `planningGetPeriodOccupancy` ~righe 204-265)

`readRoomOccupancy` calcola già `tmdbId` e lo butta via all'uscita. Lo si conserva, e con esso arriva il poster dalla query su `CatalogFilm` che già si fa per i generi: nessuna chiamata di rete in più.

- [ ] **Step 1: Aggiungi i due campi a `ExistingShow`**

In `src/actions/planningActions.ts`, sostituisci l'interfaccia:

```ts
export interface ExistingShow {
  pretixId: number | null;
  title: string;
  /** 'HH:mm' d'inizio. */
  time: string;
  /** 'HH:mm' di fine film. */
  endTime: string;
  runtime: number;
  startMinute: number;
  endMinute: number;
  /** Il film, quando il sub-evento se lo porta dietro nel commento JSON. */
  tmdbId: string | null;
  /** Poster dal catalogo, se il film c'è. Nessuna chiamata a TMDB per averlo. */
  posterPath: string | null;
}
```

- [ ] **Step 2: Fai uscire i due campi anche da `readRoomOccupancy`**

Sempre in `planningActions.ts`, nella `shows.push({...})` di `readRoomOccupancy`, aggiungi `posterPath: null` accanto a `tmdbId` (il poster lo riempirà chi legge il catalogo; qui si sa solo cosa dice Pretix):

```ts
    shows.push({
      pretixId: Number.isFinite(Number(raw.id)) ? Number(raw.id) : null,
      title,
      time: formatClock(startMinute),
      endTime: formatClock(endMinute),
      runtime,
      startMinute,
      endMinute,
      dayIndex,
      tmdbId,
      posterPath: null,
    });
```

La firma di ritorno diventa quindi `ExistingShow & { dayIndex: number }`: togli `& { tmdbId: string | null }` dal tipo di ritorno della funzione, sia nella dichiarazione sia sulla variabile locale `shows` e su `occupied`. La riga da cambiare:

```ts
): Promise<{ shows: (ExistingShow & { dayIndex: number })[]; occupied: Interval[] }> {
```

e poco sotto:

```ts
  const shows: (ExistingShow & { dayIndex: number })[] = [];
```

- [ ] **Step 3: Leggi catalogo una volta sola, prima del giro sui giorni**

In `planningGetPeriodOccupancy`, sostituisci il blocco che va da `const daysDetail` fino al `return`, con questo. Cambia tre cose: gli id si raccolgono **prima** del giro, la query sul catalogo prende anche il poster, e `shows` non viene più ripulito di `tmdbId`.

```ts
  const daysDetail: DayOccupancy[] = [];

  // Gli spettacoli dentro la finestra si conoscono già tutti: raccogliere qui
  // gli id permette di leggere il catalogo **una volta**, prima del giro sui
  // giorni, e di appoggiare il poster su ogni proiezione mentre la si scrive.
  const inWindow = shows.filter((s) => s.dayIndex >= 0 && s.dayIndex < dayCount);
  const tmdbIdsInPeriod = new Set(
    inWindow.map((s) => s.tmdbId).filter((v): v is string => Boolean(v))
  );

  const catalogRows = tmdbIdsInPeriod.size
    ? await prisma.catalogFilm.findMany({
        where: { tmdbId: { in: [...tmdbIdsInPeriod] } },
        select: { tmdbId: true, genres: true, posterPath: true },
      })
    : [];
  const posterByTmdb = new Map(
    catalogRows.filter((f) => f.tmdbId).map((f) => [f.tmdbId!, f.posterPath ?? null])
  );

  for (let d = 0; d < dayCount; d++) {
    const date = addDaysISO(startDate, d);

    const dayShows = shows
      .filter((s) => s.dayIndex === d)
      .sort((a, b) => a.startMinute - b.startMinute);

    // La saturazione e i buchi li calcola il modulo puro, quello che ha i test.
    const summary = summarizeDay(
      dayShows.map((s) => ({ start: s.startMinute, end: s.endMinute + MIN_GAP_MINUTES })),
      d
    );

    daysDetail.push({
      date,
      weekday: new Date(`${date}T12:00:00Z`).toLocaleDateString('it-IT', { weekday: 'long', timeZone: 'UTC' }),
      isWeekend: isWeekend(date),
      isPast: date < today,
      shows: dayShows.map(({ dayIndex: _d, ...rest }) => ({
        ...rest,
        posterPath: rest.tmdbId ? posterByTmdb.get(rest.tmdbId) ?? null : null,
      })),
      busyMinutes: summary.busyMinutes,
      saturation: summary.saturation,
      gaps: summary.gaps,
    });
  }

  const freeSlotsEstimate = daysDetail.reduce((sum, d) => sum + estimateFreeSlots(d.gaps), 0);
  const genresInSchedule = [...new Set(catalogRows.flatMap((f) => f.genres))];

  return {
    startDate,
    days: dayCount,
    daysDetail,
    totalShows: inWindow.length,
    freeSlotsEstimate,
    genresInSchedule,
    occupied,
  };
```

- [ ] **Step 4: Sistema `planningCheckManualSlot`, che spogliava `tmdbId`**

Nella costruzione dei conflitti (~riga 762) la destrutturazione toglieva `tmdbId`; ora quel campo fa parte di `ExistingShow` e deve restare. Sostituisci:

```ts
  const conflicts: SlotConflict[] = await Promise.all(
    check.clashes.map(async ({ show }) => {
      const { dayIndex: _d, ...rest } = show;
      let soldTickets = 0;
      if (rest.pretixId) {
        try {
          soldTickets = await countSoldTickets(rest.pretixId);
        } catch {
          countFailed = true;
        }
      }
      return { ...rest, soldTickets };
    })
  );
```

- [ ] **Step 5: Verifica che compili**

```bash
npx tsc --noEmit
```

Atteso: nessun errore. Se ne compare uno su `dayIndex: _d, tmdbId: _t`, è un punto rimasto indietro: togli `tmdbId: _t`.

- [ ] **Step 6: Commit**

```bash
git add src/actions/planningActions.ts
git commit -m "Le proiezioni in sala si portano dietro film e poster"
```

---

## Task 3: Il terzo modo, e la vista in sola lettura

Prima si guarda, poi si tocca: questo task porta a schermo la settimana. Alla fine si vede il palinsesto e non si può ancora rompere niente.

**Files:**
- Create: `src/app/admin/programmazione/Palinsesto.tsx`
- Modify: `src/app/admin/programmazione/types.ts:40`
- Modify: `src/app/admin/programmazione/page.tsx`

- [ ] **Step 1: Allarga `PlanningMode`**

In `src/app/admin/programmazione/types.ts`, sostituisci il tipo e il suo commento:

```ts
/**
 * I tre modi della programmazione.
 *
 * `period` — dal periodo al film: scegli dove e quando, il motore riempie.
 * `film` — dal film al periodo: scegli il titolo, e sono gli orari liberi a
 * farsi avanti, dal giorno più vicino.
 * `palinsesto` — né l'uno né l'altro: qui non si crea niente, si guarda cosa
 * c'è già e lo si sposta o si elimina. Non è un wizard, è una vista sola.
 */
export type PlanningMode = 'period' | 'film' | 'palinsesto';
```

- [ ] **Step 2: Scrivi la vista, in sola lettura**

Crea `src/app/admin/programmazione/Palinsesto.tsx`:

```tsx
'use client';

/**
 * IL PALINSESTO — la settimana com'è, non come sarà.
 *
 * Gli altri due modi creano spettacoli; questo tocca quelli che esistono già,
 * e quindi ogni azione qui è **irreversibile e visibile online subito**. È la
 * ragione per cui niente parte da questo file: il trascinamento e l'orario
 * riscritto aprono un pannello che spiega cosa comporta, e la scrittura avviene
 * solo dopo una conferma esplicita.
 */

import React from 'react';
import { CalendarRange, Clapperboard, Loader2 } from 'lucide-react';
import styles from './Programmazione.module.css';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import type { PeriodOccupancy } from '@/actions/planningActions';
import { shortDayLabel } from './types';

interface Props {
  rooms: { id: number; name: string; isFavorite: boolean }[];
  roomId: number | null;
  onRoomChange: (id: number) => void;
  startDate: string;
  onStartDateChange: (d: string) => void;
  days: number;
  onDaysChange: (d: number) => void;
  occupancy: PeriodOccupancy | null;
  loading: boolean;
}

function saturationClass(s: number): string {
  if (s > 0.7) return styles.satHigh;
  if (s > 0.4) return styles.satMid;
  return styles.satLow;
}

export default function Palinsesto({
  rooms, roomId, onRoomChange,
  startDate, onStartDateChange,
  days, onDaysChange,
  occupancy, loading,
}: Props) {
  const total = occupancy?.totalShows ?? 0;

  return (
    <main className={styles.stepBody}>
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>
          <CalendarRange size={18} /> Il palinsesto
          {loading && <Loader2 size={15} className={styles.spin} />}
        </h2>

        <div className={styles.slotControls}>
          <label className={styles.field}>
            <span>Sala</span>
            <select value={roomId ?? ''} onChange={(e) => onRoomChange(Number(e.target.value))}>
              {rooms.length === 0 && <option value="">Nessuna sala disponibile</option>}
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>{r.isFavorite ? '⭐ ' : ''}{r.name}</option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>Dal giorno</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span>Per quanti giorni</span>
            <input
              type="number"
              min={1}
              max={30}
              value={days}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (Number.isFinite(v)) onDaysChange(Math.min(Math.max(v, 1), 30));
              }}
            />
          </label>
        </div>

        <p className={styles.sideHint}>
          Qui non si crea niente: si sposta e si elimina ciò che è già in cartellone.
          Ogni modifica è immediata e si vede online.
        </p>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>
          {total > 0
            ? <>{total} proiezion{total === 1 ? 'e' : 'i'} in questi {occupancy?.days} giorni</>
            : <>Niente in cartellone in questi giorni</>}
        </h2>

        {loading && !occupancy && (
          <div className={styles.emptyState}>
            <Loader2 size={30} className={styles.spin} />
            <p>Leggo la sala…</p>
          </div>
        )}

        {occupancy && (
          <div className={styles.dayStrip}>
            {occupancy.daysDetail.map((d) => {
              const pct = Math.round(d.saturation * 100);
              return (
                <section
                  key={d.date}
                  className={`${styles.dayCol} ${d.isWeekend ? styles.dayWeekend : ''} ${d.isPast ? styles.dayPast : ''}`}
                >
                  <div className={styles.dayColHead}>
                    <span className={styles.dayColName}>{shortDayLabel(d.date)}</span>
                    <span className={`${styles.dayColPct} ${saturationClass(d.saturation)}`}>{pct}%</span>
                  </div>

                  <div className={styles.satTrack}>
                    <div className={`${styles.satFill} ${saturationClass(d.saturation)}`} style={{ width: `${pct}%` }} />
                  </div>

                  <div className={styles.dayColBody}>
                    {d.shows.length === 0 && (
                      <div className={styles.dayColEmpty}>{d.isPast ? 'passata' : 'giornata libera'}</div>
                    )}

                    {d.shows.map((s, i) => {
                      const poster = getTMDBImageUrl(s.posterPath, 'w92');
                      return (
                        <article key={s.pretixId ?? `x-${i}`} className={styles.calShow}>
                          <div className={styles.calShowTop}>
                            <span className={styles.calShowTime}>{s.time}</span>
                          </div>
                          <div className={styles.calShowMain}>
                            <div className={styles.calShowPoster}>
                              {poster ? <img src={poster} alt="" loading="lazy" /> : <Clapperboard size={14} />}
                            </div>
                            <div className={styles.calShowText}>
                              <b title={s.title}>{s.title}</b>
                              <span>{s.runtime}′ · fine {s.endTime}</span>
                            </div>
                          </div>
                        </article>
                      );
                    })}

                    {d.gaps.map((g, i) => (
                      <div key={`gap-${i}`} className={styles.gapChip}>
                        libero {Math.floor(g.minutes / 60)}h{String(g.minutes % 60).padStart(2, '0')}′ · {g.from}
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
```

In questo passaggio il componente non ha stato e non chiama azioni: solo `React`, tre icone e il tipo dell'occupazione. Tutto il resto arriva al Task 6.

- [ ] **Step 3: Aggiungi il modo in `page.tsx`**

In `src/app/admin/programmazione/page.tsx`:

**a)** importa il componente, sotto gli altri Step:

```tsx
import Palinsesto from './Palinsesto';
```

**b)** `STEP_LABELS` non riguarda il palinsesto, che di passi non ne ha. Restringi il tipo della costante (~riga 51):

```tsx
const STEP_LABELS: Record<'period' | 'film', string[]> = {
```

**c)** aggiungi il terzo riquadro in fondo a `MODES` (~riga 56):

```tsx
  {
    key: 'palinsesto',
    label: 'Il palinsesto',
    hint: 'Cosa c\'è già in cartellone: spostalo, eliminalo, riordina la settimana.',
    icon: <CalendarRange size={16} />,
  },
```

e aggiungi `CalendarRange` agli import di `lucide-react` in cima al file.

**d)** l'occupazione va letta anche in questo modo. Sostituisci la prima riga dell'effetto (~riga 176):

```tsx
    if (mode === 'film') return;
```

**e)** aggiungi, accanto agli altri stati del passo 1 (~riga 90), il contatore che forza il ricarico dopo una modifica:

```tsx
  const [occupancyTick, setOccupancyTick] = useState(0);
```

e aggiungilo alle dipendenze dell'effetto:

```tsx
  }, [mode, roomId, startDate, days, occupancyTick]);
```

**f)** la barra dei passi non si mostra nel palinsesto. Avvolgi il `<nav className={styles.steps}>` (~riga 651):

```tsx
        {mode !== 'palinsesto' && (
          <nav className={styles.steps}>
            {STEP_LABELS[mode].map((label, i) => (
              <React.Fragment key={label}>
                {i > 0 && <ChevronRight size={13} className={styles.stepArrow} />}
                <button
                  type="button"
                  className={`${styles.step} ${i + 1 === step ? styles.stepActive : ''} ${i + 1 < step ? styles.stepDone : ''}`}
                  onClick={() => { if (i + 1 < step && !running) setStep((i + 1) as WizardStep); }}
                  disabled={i + 1 >= step || running}
                >
                  <b>{i + 1 < step ? '✓' : i + 1}</b> {label}
                </button>
              </React.Fragment>
            ))}
          </nav>
        )}
```

**g)** rendi la vista, subito dopo il blocco `{step === 1 && mode === 'film' && (<StepFilm … />)}`:

```tsx
      {mode === 'palinsesto' && (
        <Palinsesto
          rooms={rooms}
          roomId={roomId}
          onRoomChange={(id) => { setRoomId(id); localStorage.setItem('defaultSalaId', String(id)); }}
          startDate={startDate}
          onStartDateChange={setStartDate}
          days={days}
          onDaysChange={setDays}
          occupancy={occupancy}
          loading={loadingOccupancy}
        />
      )}
```

**h)** il footer del wizard non c'entra niente qui. Cambia la sua condizione (~riga 762):

```tsx
      {step < 4 && mode !== 'palinsesto' && (
```

- [ ] **Step 4: Verifica che compili e passi il lint**

```bash
npx tsc --noEmit && npm run lint
```

Atteso: nessun errore, nessun `unused variable`.

- [ ] **Step 5: Guardala**

Chiedi a Giovanni di aprire `/admin/programmazione`, scegliere **Il palinsesto** e confermare che la settimana si vede: giorni, saturazione, proiezioni con poster e orari, buchi liberi. Non procedere se i poster non compaiono su nessun film — vorrebbe dire che il Task 2 non sta arrivando fino a qui.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/programmazione/Palinsesto.tsx src/app/admin/programmazione/page.tsx src/app/admin/programmazione/types.ts
git commit -m "Il palinsesto: vedere la settimana com'è"
```

---

## Task 4: Le due azioni che spostano

**Files:**
- Modify: `src/actions/planningActions.ts` (in fondo, dopo `planningDeleteShow`)

- [ ] **Step 1: Aggiungi il tipo e il controllo**

In fondo a `src/actions/planningActions.ts`, prima di `planningDefaultStartDate`, incolla:

```ts
// ═══════════════════════════════════════════════════════════════════════════
// SPOSTARE CIÒ CHE È GIÀ IN CARTELLONE
// Un'altra cosa dal creare: qui il pubblico c'è già, e ogni scrittura si vede
// online nell'istante dopo. Perciò il controllo e l'azione sono separati — si
// guarda, si decide, e solo allora si scrive.
// ═══════════════════════════════════════════════════════════════════════════

export interface MoveCheck extends ManualSlotCheck {
  /**
   * Biglietti già venduti sullo spettacolo **che si sta spostando**.
   * `null` quando il conteggio non è riuscito: non è zero, ed è importante che
   * la differenza si veda: chi ha pagato si presenterà all'orario vecchio, e
   * Pretix non lo avvisa da solo.
   */
  movingShowSoldTickets: number | null;
}

/**
 * Si può portare questo spettacolo a quel giorno, a quell'ora?
 *
 * Non sposta niente. Risponde con la stessa forma di `planningCheckManualSlot`
 * — che la UI sa già leggere — più i biglietti venduti su ciò che si muove.
 *
 * La durata non si chiede a TMDB: il film è già in sala, e `runtimeOfSubEvent`
 * l'ha già ricavata dal commento JSON, dagli override o dalla distanza fra
 * `date_from` e `date_to`.
 */
export async function planningCheckMove(input: {
  seatingPlanId: number;
  pretixId: number;
  /** Giorno di programmazione di destinazione, 'YYYY-MM-DD'. */
  day: string;
  /** Orario di destinazione, 'HH:mm'. */
  time: string;
  /** Origine dei minuti globali, come nel resto del wizard. */
  fromDate: string;
}): Promise<MoveCheck> {
  const { planMove } = await import('@/services/scheduling/move');

  const nothing = (message: string): MoveCheck => ({
    free: false, usable: false, slot: null, conflicts: [], soldTickets: 0, message,
    outsideHours: false, warning: null, movingShowSoldTickets: null,
  });

  const clock = /^(\d{1,2}):(\d{2})$/.exec(input.time.trim());
  if (!clock) return nothing('Orario non valido: scrivilo come 21:00.');
  const hh = Number(clock[1]);
  const mm = Number(clock[2]);
  if (hh > 23 || mm > 59) return nothing('Quest\'ora non esiste.');

  const dayIndex = daysBetweenISO(input.fromDate, input.day);
  // La finestra deve contenere il giorno scelto, e la nottata dopo.
  const span = Math.min(Math.max(dayIndex + 2, 1), 60);
  const { shows } = await readRoomOccupancy(input.seatingPlanId, input.fromDate, span);

  const moving = shows.find((s) => s.pretixId === input.pretixId);
  if (!moving) {
    return nothing('Questo spettacolo non è più in sala: ricarica il palinsesto.');
  }

  const occupied = shows.map((s) => ({
    start: s.startMinute,
    end: s.endMinute + MIN_GAP_MINUTES,
    show: s,
  }));
  const notBefore = msToGlobalMinute(Date.now() + 30 * 60000, input.fromDate);

  const check = planMove({
    runtime: moving.runtime,
    dayIndex,
    clock: hh * 60 + mm,
    occupied,
    isMoving: (o) => o.show.pretixId === input.pretixId,
    notBefore,
  });

  // Quanti hanno già un biglietto per l'orario vecchio. Se non si riesce a
  // contarli non si tira a indovinare: `null` vuol dire «non lo so», e il
  // pannello lo dice invece di rassicurare a vuoto.
  let movingShowSoldTickets: number | null = null;
  try {
    movingShowSoldTickets = await countSoldTickets(input.pretixId);
  } catch {
    movingShowSoldTickets = null;
  }

  const slot: SlotProposal = {
    day: input.day,
    date: addDaysISO(input.fromDate, Math.floor(check.startMinute / MINUTES_PER_DAY)),
    time: formatClock(check.startMinute),
    endTime: formatClock(check.endMinute),
    startMinute: check.startMinute,
    endMinute: check.endMinute,
    band: check.band,
  };

  const no = (message: string): MoveCheck => ({
    free: false, usable: false, slot, conflicts: [], soldTickets: 0, message,
    outsideHours: false, warning: null, movingShowSoldTickets,
  });

  if (check.problem === 'past') return no('Quest\'orario è già passato, o sta per esserlo.');

  // Fuori orario si avverte, non si vieta: apertura e chiusura sono una
  // decisione di chi il cinema lo gestisce. Le 21:00 di ieri no.
  const warning =
    check.problem === 'afterClosing'
      ? `«${moving.title}» dura ${moving.runtime}′: partendo alle ${slot.time} finisce alle ` +
        `${slot.endTime}, oltre la chiusura dell'${formatClock(CLOSING_MINUTE)}.`
      : check.problem === 'beforeOpening'
        ? `Il cinema apre alle ${formatClock(OPENING_MINUTE)}: le ${slot.time} vengono prima ` +
          'dell\'apertura.'
        : null;
  const outsideHours = warning !== null;

  if (check.ok || (outsideHours && check.clashes.length === 0)) {
    return {
      free: true, usable: true, slot, conflicts: [], soldTickets: 0,
      outsideHours, warning, movingShowSoldTickets,
      message: warning
        ? `${warning} Non c'è altro in sala: se vuoi farlo lo stesso, si può.`
        : `Libero: ${slot.time}–${slot.endTime}.`,
    };
  }

  let countFailed = false;
  const conflicts: SlotConflict[] = await Promise.all(
    check.clashes.map(async ({ show }) => {
      const { dayIndex: _d, ...rest } = show;
      let soldTickets = 0;
      if (rest.pretixId) {
        try {
          soldTickets = await countSoldTickets(rest.pretixId);
        } catch {
          countFailed = true;
        }
      }
      return { ...rest, soldTickets };
    })
  );

  // Senza il conteggio la sostituzione non si propone. Un «nessuno resta a
  // piedi» falso, detto a chi sta per cancellare uno spettacolo, è la bugia
  // peggiore possibile.
  if (countFailed) {
    return {
      free: false, usable: false, slot, conflicts, soldTickets: 0, outsideHours, warning,
      movingShowSoldTickets,
      message: 'Non sono riuscito a controllare i biglietti venduti su ciò che occupa '
        + "quest'orario. Riprova: non ti propongo una sostituzione senza sapere chi ha già pagato.",
    };
  }

  const unremovable = conflicts.filter((c) => c.pretixId == null);
  if (conflicts.length === 0 || unremovable.length > 0) {
    return {
      free: false, usable: false, slot, conflicts, soldTickets: 0, outsideHours, warning,
      movingShowSoldTickets,
      message: 'Quest\'orario è occupato da qualcosa che non posso rimuovere da qui.',
    };
  }

  const soldTickets = conflicts.reduce((sum, c) => sum + c.soldTickets, 0);
  const titles = conflicts.map((c) => `«${c.title}» delle ${c.time}`).join(' e ');

  return {
    free: false,
    usable: true,
    slot,
    conflicts,
    soldTickets,
    outsideHours,
    warning,
    movingShowSoldTickets,
    message: soldTickets > 0
      ? `Qui c'è ${titles}, con ${soldTickets} bigliett${soldTickets === 1 ? 'o venduto' : 'i venduti'}. ` +
        'Sostituirlo lascia orfani ordini di gente che ha pagato: andranno rimborsati a mano da Pretix.'
      : `Qui c'è ${titles}. Nessun biglietto venduto: sostituirlo non lascia nessuno a piedi.`,
  };
}
```

- [ ] **Step 2: Aggiungi l'azione che scrive**

Subito sotto, sempre in `planningActions.ts`:

```ts
/**
 * Sposta lo spettacolo, eliminando se serve ciò che occupa la destinazione.
 *
 * **Ricontrolla prima di agire.** Fra il momento in cui l'utente ha letto il
 * pannello e quello in cui ha premuto possono essere passati minuti, e in quei
 * minuti si vendono biglietti: il pannello serve a far decidere, non è ciò su
 * cui il server si fida.
 *
 * **Prima elimina, poi sposta.** All'inverso, un errore a metà strada
 * lascerebbe due film sovrapposti entrambi in vendita sulla stessa sala. Così
 * il peggio che resta è un buco in palinsesto: un buco si riempie, un doppio
 * incasso sugli stessi posti no. È anche l'ordine che tiene `commitRunner`.
 */
export async function planningMoveShow(input: {
  seatingPlanId: number;
  pretixId: number;
  day: string;
  time: string;
  fromDate: string;
  /** Consenso a eliminare ciò che occupa la destinazione. */
  replaces?: number[];
  /** Consenso a eliminarlo anche con biglietti venduti sopra. */
  force?: boolean;
  /** Consenso a uscire dagli orari di apertura. */
  allowOutsideHours?: boolean;
}): Promise<{ moved: boolean; deleted: number[]; error?: string }> {
  const { adminUpdateEventDate } = await import('@/actions/adminActions');

  const check = await planningCheckMove(input);
  if (!check.slot) return { moved: false, deleted: [], error: check.message };

  if (check.outsideHours && !input.allowOutsideHours) {
    return { moved: false, deleted: [], error: check.warning ?? check.message };
  }

  const conflictIds = check.conflicts
    .map((c) => c.pretixId)
    .filter((v): v is number => v != null);

  if (conflictIds.length !== check.conflicts.length) {
    return { moved: false, deleted: [], error: check.message };
  }

  // Si elimina solo ciò che l'utente ha visto e accettato di eliminare. Un
  // conflitto comparso nel frattempo ferma tutto: non era nella decisione.
  const consented = new Set(input.replaces ?? []);
  const unexpected = conflictIds.filter((id) => !consented.has(id));
  if (unexpected.length > 0) {
    return {
      moved: false,
      deleted: [],
      error: 'Nel frattempo quest\'orario è cambiato. Ricontrolla il palinsesto e riprova.',
    };
  }

  if (check.soldTickets > 0 && !input.force) {
    return { moved: false, deleted: [], error: check.message };
  }

  const deleted: number[] = [];
  for (const id of conflictIds) {
    const removal = await planningDeleteShow(id, input.force ?? false);
    if (!removal.deleted) {
      return { moved: false, deleted, error: removal.error };
    }
    deleted.push(id);
  }

  await adminUpdateEventDate(input.pretixId, `${check.slot.date}T${check.slot.time}`);
  return { moved: true, deleted };
}
```

- [ ] **Step 3: Verifica che compili**

```bash
npx tsc --noEmit
```

Atteso: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add src/actions/planningActions.ts
git commit -m "Spostare uno spettacolo: il controllo e l'azione"
```

---

## Task 5: Il pannello che conduce la decisione

**Files:**
- Create: `src/app/admin/programmazione/MovePanel.tsx`
- Modify: `src/app/admin/programmazione/Programmazione.module.css` (in fondo)

- [ ] **Step 1: Scrivi il componente**

Crea `src/app/admin/programmazione/MovePanel.tsx`:

```tsx
'use client';

/**
 * IL PANNELLO — dove una decisione irreversibile si prende sapendo cosa fa.
 *
 * È presentazionale: non chiama niente, non sa cosa sia Pretix. Riceve l'esito
 * del controllo e restituisce la decisione. La regola che lo governa: la
 * spunta di consenso compare **solo quando c'è qualcuno che ha pagato**.
 * Chiederla anche a sala vuota insegnerebbe a premere sì senza leggere, e
 * quando poi conta davvero non la leggerebbe più nessuno.
 */

import React, { useState } from 'react';
import { Loader2, TriangleAlert, X } from 'lucide-react';
import styles from './Programmazione.module.css';
import type { ExistingShow, MoveCheck } from '@/actions/planningActions';
import { dayLabel } from './types';

export type Pending =
  | { kind: 'move'; show: ExistingShow; fromDay: string; toDay: string; time: string; check: MoveCheck | null }
  | { kind: 'delete'; show: ExistingShow; day: string; refusal: { message: string; soldTickets: number } | null };

interface Props {
  pending: Pending;
  working: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirmMove: (opts: { replaces: number[]; force: boolean; allowOutsideHours: boolean }) => void;
  onConfirmDelete: (force: boolean) => void;
}

export default function MovePanel({
  pending, working, error, onCancel, onConfirmMove, onConfirmDelete,
}: Props) {
  const [consent, setConsent] = useState(false);

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  // ── Eliminare ────────────────────────────────────────────────────────────
  if (pending.kind === 'delete') {
    const refusal = pending.refusal;
    return (
      <div className={styles.modalBack} onClick={onCancel}>
        <div className={styles.modalCard} onClick={stop}>
          <div className={styles.modalHead}>
            <h3>Eliminare «{pending.show.title}»?</h3>
            <button onClick={onCancel} aria-label="Chiudi"><X size={17} /></button>
          </div>

          <p className={styles.modalBody}>
            {dayLabel(pending.day)}, ore {pending.show.time}. Sparisce da Pretix, dal sito e
            dalla home: non si torna indietro.
          </p>

          {refusal && (
            <p className={styles.modalDanger}>
              <TriangleAlert size={14} /> {refusal.message} Eliminarlo lascia orfani quegli
              ordini: vanno rimborsati a mano dal pannello Pretix.
            </p>
          )}

          {error && <p className={styles.modalDanger}><TriangleAlert size={14} /> {error}</p>}

          {refusal && (
            <label className={styles.modalConsent}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              Ho capito: elimino uno spettacolo con {refusal.soldTickets} bigliett
              {refusal.soldTickets === 1 ? 'o venduto' : 'i venduti'}.
            </label>
          )}

          <div className={styles.modalActions}>
            <button className={styles.ghostBtn} onClick={onCancel} disabled={working}>Annulla</button>
            <button
              className={styles.dangerBtn}
              disabled={working || (refusal !== null && !consent)}
              onClick={() => onConfirmDelete(refusal !== null)}
            >
              {working ? <Loader2 size={16} className={styles.spin} /> : null}
              {refusal ? 'Elimina lo stesso' : 'Elimina'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Spostare ─────────────────────────────────────────────────────────────
  const check = pending.check;
  const conflicts = check?.conflicts ?? [];
  const replaces = conflicts.map((c) => c.pretixId).filter((v): v is number => v != null);
  const needsConsent = (check?.soldTickets ?? 0) > 0;
  const canGo = Boolean(check?.usable) && (!needsConsent || consent);
  const moved = pending.show;

  return (
    <div className={styles.modalBack} onClick={onCancel}>
      <div className={styles.modalCard} onClick={stop}>
        <div className={styles.modalHead}>
          <h3>Spostare «{moved.title}»</h3>
          <button onClick={onCancel} aria-label="Chiudi"><X size={17} /></button>
        </div>

        <p className={styles.modalBody}>
          Da {dayLabel(pending.fromDay).toLowerCase()} alle {moved.time} →{' '}
          <b>{dayLabel(pending.toDay).toLowerCase()} alle {check?.slot?.time ?? pending.time}</b>
        </p>

        {!check && (
          <p className={styles.modalBody}><Loader2 size={14} className={styles.spin} /> Guardo la sala…</p>
        )}

        {check && <p className={styles.modalBody}>{check.message}</p>}

        {check && check.movingShowSoldTickets === null && (
          <p className={styles.modalWarn}>
            <TriangleAlert size={14} /> Non sono riuscito a controllare quanti biglietti sono
            già stati venduti per questo spettacolo.
          </p>
        )}

        {check && (check.movingShowSoldTickets ?? 0) > 0 && (
          <p className={styles.modalWarn}>
            <TriangleAlert size={14} /> {check.movingShowSoldTickets} person
            {check.movingShowSoldTickets === 1 ? 'a ha' : 'e hanno'} già un biglietto per le{' '}
            {moved.time}. Spostandolo si presenteranno all'orario vecchio: Pretix non le avvisa,
            devi farlo tu.
          </p>
        )}

        {error && <p className={styles.modalDanger}><TriangleAlert size={14} /> {error}</p>}

        {check && needsConsent && (
          <label className={styles.modalConsent}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            Ho capito: elimino {conflicts.length === 1 ? 'uno spettacolo' : `${conflicts.length} spettacoli`} con{' '}
            {check.soldTickets} bigliett{check.soldTickets === 1 ? 'o venduto' : 'i venduti'}, e gli
            ordini vanno rimborsati a mano.
          </label>
        )}

        <div className={styles.modalActions}>
          <button className={styles.ghostBtn} onClick={onCancel} disabled={working}>Annulla</button>
          <button
            className={conflicts.length > 0 ? styles.dangerBtn : styles.ctaBtnSmall}
            disabled={!canGo || working}
            onClick={() => onConfirmMove({
              replaces,
              force: needsConsent,
              allowOutsideHours: Boolean(check?.outsideHours),
            })}
          >
            {working ? <Loader2 size={16} className={styles.spin} /> : null}
            {conflicts.length > 0
              ? `Sposta ed elimina ${conflicts.map((c) => `«${c.title}»`).join(' e ')}`
              : check?.outsideHours ? 'Sposta lo stesso' : 'Sposta'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Aggiungi il CSS del pannello**

In fondo a `src/app/admin/programmazione/Programmazione.module.css`:

```css
/* ── Il pannello del palinsesto ─────────────────────────────────────────── */
.modalBack {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(9, 9, 14, 0.72);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.2rem;
}

.modalCard {
  width: min(520px, 100%);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.1rem 1.2rem 1.2rem;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: #16161d;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
}

.modalHead { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; }
.modalHead h3 { margin: 0; font-size: 1rem; font-weight: 650; }
.modalHead button {
  background: none;
  border: 0;
  color: inherit;
  opacity: 0.6;
  cursor: pointer;
  padding: 0.2rem;
}
.modalHead button:hover { opacity: 1; }

.modalBody { margin: 0; font-size: 0.85rem; line-height: 1.5; opacity: 0.85; }
.modalBody b { color: #c4b5fd; }

.modalWarn, .modalDanger {
  margin: 0;
  display: flex;
  gap: 0.45rem;
  align-items: flex-start;
  font-size: 0.8rem;
  line-height: 1.45;
  padding: 0.6rem 0.7rem;
  border-radius: 9px;
}
.modalWarn { background: rgba(217, 119, 6, 0.16); border: 1px solid rgba(251, 191, 36, 0.35); }
.modalDanger { background: rgba(220, 38, 38, 0.16); border: 1px solid rgba(248, 113, 113, 0.4); }
.modalWarn svg, .modalDanger svg { flex-shrink: 0; margin-top: 2px; }

.modalConsent {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  font-size: 0.8rem;
  line-height: 1.45;
  cursor: pointer;
}
.modalConsent input { margin-top: 3px; flex-shrink: 0; }

.modalActions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.2rem; }

.dangerBtn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 0.95rem;
  border-radius: 9px;
  border: 1px solid rgba(248, 113, 113, 0.45);
  background: rgba(220, 38, 38, 0.85);
  color: #fff;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}
.dangerBtn:disabled { opacity: 0.4; cursor: not-allowed; }

/* Una giornata passata si legge, non si tocca. */
.palLocked { cursor: default; }
```

- [ ] **Step 3: Verifica che compili**

```bash
npx tsc --noEmit
```

Atteso: nessun errore. Il componente non è ancora usato da nessuno: è normale.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/programmazione/MovePanel.tsx src/app/admin/programmazione/Programmazione.module.css
git commit -m "Il pannello che spiega cosa comporta prima di farlo"
```

---

## Task 6: Cablare trascinamento, orario e cestino

**Files:**
- Modify: `src/app/admin/programmazione/Palinsesto.tsx`
- Modify: `src/app/admin/programmazione/page.tsx`

- [ ] **Step 1: Porta lo stato e le azioni dentro `Palinsesto.tsx`**

Sostituisci gli import in cima al file con:

```tsx
import React, { useState } from 'react';
import { CalendarRange, Clapperboard, GripVertical, Loader2, Pencil, Trash2 } from 'lucide-react';
import styles from './Programmazione.module.css';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import {
  planningCheckMove,
  planningDeleteShow,
  planningMoveShow,
  type ExistingShow,
  type PeriodOccupancy,
} from '@/actions/planningActions';
import MovePanel, { type Pending } from './MovePanel';
import { shortDayLabel } from './types';
```

Aggiungi alle props il ricarico:

```tsx
  /** Da chiamare dopo ogni modifica: la sala non è più quella che avevamo letto. */
  onReload: () => void;
```

e alla destrutturazione `onReload,`.

- [ ] **Step 2: Aggiungi lo stato e il flusso, subito dopo `const total = …`**

```tsx
  const [dragging, setDragging] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Chiede al server cosa comporta, e apre il pannello mentre lo chiede. */
  const askMove = async (show: ExistingShow, fromDay: string, toDay: string, time: string) => {
    if (!show.pretixId || !roomId) return;
    setError(null);
    setPending({ kind: 'move', show, fromDay, toDay, time, check: null });
    try {
      const check = await planningCheckMove({
        seatingPlanId: roomId,
        pretixId: show.pretixId,
        day: toDay,
        time,
        fromDate: startDate,
      });
      // Se nel frattempo il pannello è stato chiuso o riaperto su un altro
      // spettacolo, questa risposta non riguarda più ciò che si sta guardando.
      setPending((p) =>
        p && p.kind === 'move' && p.show.pretixId === show.pretixId && p.time === time
          ? { ...p, check }
          : p
      );
    } catch (e) {
      console.error('[Palinsesto] controllo spostamento', e);
      setError('Non sono riuscito a leggere la sala. Riprova.');
    }
  };

  const confirmMove = async (opts: { replaces: number[]; force: boolean; allowOutsideHours: boolean }) => {
    if (!pending || pending.kind !== 'move' || !pending.show.pretixId || !roomId) return;
    setWorking(true);
    setError(null);
    try {
      const res = await planningMoveShow({
        seatingPlanId: roomId,
        pretixId: pending.show.pretixId,
        day: pending.toDay,
        time: pending.time,
        fromDate: startDate,
        replaces: opts.replaces,
        force: opts.force,
        allowOutsideHours: opts.allowOutsideHours,
      });
      if (!res.moved) {
        setError(res.error ?? 'Lo spostamento non è riuscito.');
        // Qualcosa può essere già stato eliminato: la vista va comunque riletta.
        if (res.deleted.length > 0) onReload();
        return;
      }
      setPending(null);
      onReload();
    } catch (e) {
      console.error('[Palinsesto] spostamento', e);
      setError('Lo spostamento non è riuscito. Ricarica il palinsesto e controlla.');
    } finally {
      setWorking(false);
    }
  };

  const confirmDelete = async (force: boolean) => {
    if (!pending || pending.kind !== 'delete' || !pending.show.pretixId) return;
    setWorking(true);
    setError(null);
    try {
      const res = await planningDeleteShow(pending.show.pretixId, force);
      if (!res.deleted) {
        // Non è un errore: è la rete di sicurezza. Il pannello ora sa quanti
        // biglietti ci sono sopra e può chiedere il consenso.
        setPending({ ...pending, refusal: { message: res.error ?? '', soldTickets: res.soldTickets } });
        return;
      }
      setPending(null);
      onReload();
    } catch (e) {
      console.error('[Palinsesto] eliminazione', e);
      setError("L'eliminazione non è riuscita. Ricarica il palinsesto e controlla.");
    } finally {
      setWorking(false);
    }
  };

  /** 'HH:mm' → minuti dalla mezzanotte, o null se non è un orario. */
  const parseClock = (v: string): number | null => {
    const m = v.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  };

  const commitTime = (show: ExistingShow, day: string) => {
    const value = editValue.trim();
    setEditing(null);
    if (parseClock(value) == null || value === show.time) return;
    askMove(show, day, day, value);
  };

  const dropOnDay = (targetDay: string) => {
    const id = dragging;
    setDragging(null);
    if (id == null) return;
    for (const d of occupancy?.daysDetail ?? []) {
      const show = d.shows.find((s) => s.pretixId === id);
      if (show) {
        if (d.date === targetDay) return;
        askMove(show, d.date, targetDay, show.time);
        return;
      }
    }
  };
```

- [ ] **Step 3: Rendi le card manovrabili**

Sostituisci la `<section>` di ogni giornata (il blocco che comincia con `<section key={d.date}`) con questa versione, che aggiunge il rilascio sulla colonna e le tre azioni sulla card:

```tsx
                <section
                  key={d.date}
                  className={`${styles.dayCol} ${d.isWeekend ? styles.dayWeekend : ''} ${d.isPast ? styles.dayPast : ''} ${dragging && !d.isPast ? styles.calDayDroppable : ''}`}
                  onDragOver={(e) => { if (dragging && !d.isPast) e.preventDefault(); }}
                  onDrop={() => { if (!d.isPast) dropOnDay(d.date); }}
                >
                  <div className={styles.dayColHead}>
                    <span className={styles.dayColName}>{shortDayLabel(d.date)}</span>
                    <span className={`${styles.dayColPct} ${saturationClass(d.saturation)}`}>{pct}%</span>
                  </div>

                  <div className={styles.satTrack}>
                    <div className={`${styles.satFill} ${saturationClass(d.saturation)}`} style={{ width: `${pct}%` }} />
                  </div>

                  <div className={styles.dayColBody}>
                    {d.shows.length === 0 && (
                      <div className={styles.dayColEmpty}>{d.isPast ? 'passata' : 'giornata libera'}</div>
                    )}

                    {d.shows.map((s, i) => {
                      const poster = getTMDBImageUrl(s.posterPath, 'w92');
                      // Senza id Pretix non è nostro: si vede, non si tocca.
                      const touchable = Boolean(s.pretixId) && !d.isPast;
                      return (
                        <article
                          key={s.pretixId ?? `x-${i}`}
                          className={`${styles.calShow} ${touchable ? '' : styles.palLocked} ${dragging === s.pretixId ? styles.calShowDragging : ''}`}
                          draggable={touchable}
                          onDragStart={() => { if (touchable) setDragging(s.pretixId!); }}
                          onDragEnd={() => setDragging(null)}
                        >
                          <div className={styles.calShowTop}>
                            {editing === s.pretixId ? (
                              <input
                                className={styles.timeInput}
                                autoFocus
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => commitTime(s, d.date)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commitTime(s, d.date);
                                  if (e.key === 'Escape') setEditing(null);
                                }}
                              />
                            ) : (
                              <button
                                className={styles.calShowTime}
                                disabled={!touchable}
                                title={touchable ? 'Cambia orario' : undefined}
                                onClick={() => { setEditing(s.pretixId!); setEditValue(s.time); }}
                              >
                                {s.time}
                              </button>
                            )}
                            {touchable && <GripVertical size={13} opacity={0.4} />}
                          </div>

                          <div className={styles.calShowMain}>
                            <div className={styles.calShowPoster}>
                              {poster ? <img src={poster} alt="" loading="lazy" /> : <Clapperboard size={14} />}
                            </div>
                            <div className={styles.calShowText}>
                              <b title={s.title}>{s.title}</b>
                              <span>{s.runtime}′ · fine {s.endTime}</span>
                            </div>
                          </div>

                          {touchable && (
                            <div className={styles.calShowActions}>
                              <button
                                onClick={() => { setEditing(s.pretixId!); setEditValue(s.time); }}
                                title="Cambia orario"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                className={styles.actionDanger}
                                title="Elimina questo spettacolo"
                                onClick={() => { setError(null); setPending({ kind: 'delete', show: s, day: d.date, refusal: null }); }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                        </article>
                      );
                    })}

                    {d.gaps.map((g, i) => (
                      <div key={`gap-${i}`} className={styles.gapChip}>
                        libero {Math.floor(g.minutes / 60)}h{String(g.minutes % 60).padStart(2, '0')}′ · {g.from}
                      </div>
                    ))}
                  </div>
                </section>
```

- [ ] **Step 4: Rendi il pannello, in fondo al `<main>`**

Subito prima della chiusura `</main>`:

```tsx
      {pending && (
        <MovePanel
          pending={pending}
          working={working}
          error={error}
          onCancel={() => { setPending(null); setError(null); }}
          onConfirmMove={confirmMove}
          onConfirmDelete={confirmDelete}
        />
      )}
```

Il pannello va rimontato da zero a ogni apertura, altrimenti la spunta di consenso resterebbe segnata da una decisione precedente. Dagli una chiave che cambia con lo spettacolo:

```tsx
      {pending && (
        <MovePanel
          key={`${pending.kind}-${pending.show.pretixId}`}
          pending={pending}
          …
```

- [ ] **Step 5: Passa `onReload` da `page.tsx`**

Nella resa di `<Palinsesto …>` aggiungi:

```tsx
          onReload={() => setOccupancyTick((t) => t + 1)}
```

- [ ] **Step 6: Verifica che compili e passi il lint**

```bash
npx tsc --noEmit && npm run lint
```

Atteso: nessun errore, nessun import inutilizzato.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/programmazione/Palinsesto.tsx src/app/admin/programmazione/page.tsx
git commit -m "Il palinsesto si tocca: trascina, riscrivi l'orario, elimina"
```

---

## Task 7: La verifica in sala

Non c'è modo di provare questo con dei test: tocca Pretix vero, biglietti veri, la home vera. Va fatto a mano, e va fatto **su una sala di prova**, non su quella in vendita.

- [ ] **Step 1: Chiedi a Giovanni di provare, in quest'ordine**

1. `/admin/programmazione` → **Il palinsesto**: la settimana si vede, con poster, orari, durate e buchi liberi
2. trascina uno spettacolo su un giorno vuoto → il pannello dice "Libero" → *Sposta* → la card è nel giorno nuovo, e ricaricando la pagina ci resta
3. clicca l'orario e scrivi `00:30` → finisce nella **serata del giorno prima** rispetto alla data di calendario, cioè resta nella colonna da cui l'hai scritto
4. scrivi `03:00` → il pannello avverte che il cinema apre alle 10:00 e offre *Sposta lo stesso*
5. trascina uno spettacolo sopra un altro **senza biglietti venduti** → il pannello elenca cosa c'è, **niente spunta**, il bottone dice *Sposta ed elimina «…»* → conferma → il vecchio è sparito, il nuovo è al suo posto
6. stessa cosa **con biglietti venduti** → il bottone è spento finché non spunti la riga
7. cestino su uno spettacolo con biglietti venduti → rifiuta e dice quanti → spunta → *Elimina lo stesso* → sparisce
8. apri la home: spostamenti ed eliminazioni si vedono senza aspettare un sync
9. una giornata passata non si trascina e non ha il cestino

- [ ] **Step 2: Se qualcosa non torna, correggi e ripeti dal punto che è fallito**

- [ ] **Step 3: Commit finale, se le correzioni ci sono state**

```bash
git add -A src/app/admin/programmazione src/actions/planningActions.ts src/services/scheduling
git commit -m "Palinsesto: correzioni dopo la prova in sala"
```
