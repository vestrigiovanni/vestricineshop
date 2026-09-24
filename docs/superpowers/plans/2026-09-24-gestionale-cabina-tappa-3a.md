# Gestionale Cabina — Tappa 3a: il tavolo che vede e tocca

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **In questo progetto si esegue inline** (Giovanni non vuole agenti delegati).

**Goal:** `/admin/programma` diventa il **tavolo di montaggio** per quello che è già in sala.
- Si vede la settimana (o il giorno, le due settimane, il mese) come una timeline, con i buchi tratteggiati.
- Si clicca uno spettacolo e il cassetto a destra mostra:
  - posti e quote Pretix;
  - **Sposta**, con controllo dal vivo;
  - **Replica**;
  - **Elimina**, con la rete di sicurezza dei biglietti venduti.
- Trascinare un blocco apre lo stesso cassetto, con la destinazione già scritta.
- "Solo vuote" fa la pulizia delle proiezioni senza biglietti.

Il wizard di oggi resta vivo in `/admin/programma/wizard`, finché la 3b non lo sostituisce.

**Architecture:**
- **Server Component `page.tsx`.** Legge i parametri dell'indirizzo (`room`, `from`, `days`, `vuote`), carica sale, occupazione e posti (`loadTavolo`) e passa tutto a un unico componente client, `Tavolo`.
- **Le modifiche usano le azioni che esistono già:** `planningCheckMove`, `planningMoveShow`, `planningDeleteShow`, `adminListQuotas`. Dopo ogni modifica si fa `router.refresh()` e il server rilegge la sala.
- **La geometria della timeline, la lettura dei parametri e la settimana sono moduli puri e testati.**

**Tech Stack:** Next 16.2 (App Router, `searchParams` come Promise), React 19, CSS Modules Cabina, drag and drop HTML5 nativo, vitest.

**Spec:** `docs/superpowers/specs/2026-09-24-gestionale-cabina-design.md` §3. Divisione in 3a/3b approvata da Giovanni il 24 settembre.

## Scelte e scoperte

- **Il pannello è il cassetto a destra (scelta A).** Sul telefono diventa un foglio dal basso.
- **"Scambia" non c'è nella 3a.** Nel wizard di oggi esiste solo per gli spettacoli **in bozza**, cioè cambia il film di un orario non ancora creato. Per uno spettacolo già in vendita non esiste un'azione così. Arriva nella 3b, sui blocchi in bozza.
- **Disponibilità** diventa "Quote Pretix" nel cassetto: stessa chiamata di prima (`adminListQuotas`), letta a richiesta.
- **Pulizia proiezioni vuote** diventa il filtro "Solo vuote" sul periodo che si sta guardando. I posti vengono dal database, come in Oggi. Per guardare più lontano si sceglie "Mese".
- **Replica** apre il wizard con film e sala già scelti, come faceva il vecchio pannello.
- **Il trascinamento aggancia il quarto d'ora sotto il punto di rilascio.** Poi il controllo del server dice se l'orario regge, cosa occupa e se esce dall'orario d'apertura. Niente si scrive senza il clic su "Sposta".
- **Gli indirizzi vecchi continuano a funzionare.** `/admin/programma?tmdb=…` (così "Replica" del vecchio pannello e `/admin/programmazione?tmdb=…`) finisce nel wizard con gli stessi parametri.

## Mappa dei file

| File | Azione | Responsabilità |
|---|---|---|
| `src/app/admin/(casa)/programma/*` → `programma/wizard/*` | sposta | il wizard di oggi, intatto |
| `programma/wizard/page.tsx`, `wizard/StepCommit.tsx` | modifica | l'uscita porta al tavolo |
| `programma/_tavolo/query.ts` + test | crea | parametri dell'indirizzo ↔ stato del tavolo |
| `programma/_tavolo/geometry.ts` + test | crea | minuti ↔ posizione sulla timeline |
| `programma/_tavolo/week.ts` + test | crea | occupazione + posti → giorni, blocchi, buchi |
| `programma/_tavolo/labels.ts` + test | crea | etichette dei giorni e del periodo |
| `programma/_tavolo/load.ts` | crea | lettura dal server |
| `programma/_tavolo/Tavolo.tsx` + `.module.css` | crea | la stanza |
| `programma/_tavolo/BlockPanel.tsx` + `.module.css` | crea | il cassetto dello spettacolo |
| `programma/_tavolo/DeleteDialog.tsx` | crea | eliminazione con rete di sicurezza |
| `programma/page.tsx` | crea | il tavolo |
| `src/components/cabina/Button.tsx` | modifica | link esterni in nuova scheda |
| `src/components/cabina/rooms.ts` | modifica | parole chiave "pulizia" spostate su Programma |
| `(casa)/_oggi/buildOggi.ts` | modifica | l'avviso "vuoti" porta a `/admin/programma?vuote=1` |

(`programma/` sta per `src/app/admin/(casa)/programma/`.)

---

### Task 1: Il wizard trasloca in `/admin/programma/wizard`

- [ ] **Step 1: Sposta tutti i file**

```bash
cd "src/app/admin/(casa)/programma" && mkdir wizard && for f in *; do [ "$f" = wizard ] || git mv "$f" wizard/; done; cd -
```

- [ ] **Step 2: L'uscita del wizard porta al tavolo**

```bash
sed -i '' 's#href="/admin" title="Torna all'"'"'admin"#href="/admin/programma" title="Torna al tavolo"#' "src/app/admin/(casa)/programma/wizard/page.tsx"
sed -i '' 's#href="/admin">#href="/admin/programma">#' "src/app/admin/(casa)/programma/wizard/StepCommit.tsx"
grep -n 'href="/admin' "src/app/admin/(casa)/programma/wizard/"*.tsx
```

Expected: solo `href="/admin/programma"`.

- [ ] **Step 3: Tipi e test**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 257 passed, `tsc` muto. `/admin/programma` resta senza pagina fino al Task 8.

- [ ] **Step 4: Commit** — `Il wizard trasloca in /admin/programma/wizard`

---

### Task 2: I parametri del tavolo

- [ ] **Step 1: Test**

<!-- file: src/app/admin/(casa)/programma/_tavolo/query.test.ts -->
```ts
import { describe, it, expect } from 'vitest';
import { parseQuery, shiftFrom, toSearch, wizardRedirect } from './query';

describe('parseQuery', () => {
  it('legge sala, inizio, durata e filtro', () => {
    expect(parseQuery({ room: '12', from: '2026-09-28', days: '14', vuote: '1' })).toEqual({
      room: 12,
      from: '2026-09-28',
      days: 14,
      onlyEmpty: true,
    });
  });

  it('senza parametri: nessuna sala, nessuna data, una settimana', () => {
    expect(parseQuery({})).toEqual({ room: null, from: null, days: 7, onlyEmpty: false });
  });

  it('scarta i valori che non hanno senso', () => {
    expect(parseQuery({ room: 'abc', from: '28/09/2026', days: '5' })).toEqual({
      room: null,
      from: null,
      days: 7,
      onlyEmpty: false,
    });
  });

  it('se un parametro è ripetuto, vale il primo', () => {
    expect(parseQuery({ room: ['3', '4'] }).room).toBe(3);
  });
});

describe('toSearch', () => {
  it('scrive i parametri, e il filtro solo quando è acceso', () => {
    expect(toSearch({ room: 12, from: '2026-09-28', days: 7, onlyEmpty: false })).toBe('?room=12&from=2026-09-28&days=7');
    expect(toSearch({ room: 12, from: '2026-09-28', days: 1, onlyEmpty: true })).toBe('?room=12&from=2026-09-28&days=1&vuote=1');
  });
});

describe('shiftFrom', () => {
  it('va avanti e indietro di un periodo intero', () => {
    expect(shiftFrom('2026-09-28', 7, 1)).toBe('2026-10-05');
    expect(shiftFrom('2026-09-28', 1, -1)).toBe('2026-09-27');
  });
});

describe('wizardRedirect', () => {
  it('manda al wizard chi arriva con un film, con tutti i parametri', () => {
    expect(wizardRedirect({ tmdb: '550', room: '12' })).toBe('/admin/programma/wizard?tmdb=550&room=12');
  });

  it('senza film resta sul tavolo', () => {
    expect(wizardRedirect({ room: '12' })).toBeNull();
  });
});
```

- [ ] **Step 2:** `npx vitest run "src/app/admin/(casa)/programma/_tavolo"`. Expected: FAIL, modulo mancante.

- [ ] **Step 3: Implementazione**

<!-- file: src/app/admin/(casa)/programma/_tavolo/query.ts -->
```ts
import { addDaysISO } from '@/services/scheduling/times';

/** Le ampiezze del tavolo: un giorno, una settimana, due, un mese. */
export type Span = 1 | 7 | 14 | 30;

export const SPANS: { value: Span; label: string }[] = [
  { value: 1, label: 'Giorno' },
  { value: 7, label: 'Settimana' },
  { value: 14, label: '2 settimane' },
  { value: 30, label: 'Mese' },
];

export interface TavoloQuery {
  room: number | null;
  from: string | null;
  days: Span;
  onlyEmpty: boolean;
}

export type SearchParams = Record<string, string | string[] | undefined>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function first(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export function parseQuery(sp: SearchParams): TavoloQuery {
  const room = Number(first(sp, 'room'));
  const from = first(sp, 'from');
  const days = Number(first(sp, 'days'));
  return {
    room: Number.isInteger(room) && room > 0 ? room : null,
    from: from && ISO_DATE.test(from) ? from : null,
    days: SPANS.some((s) => s.value === days) ? (days as Span) : 7,
    onlyEmpty: first(sp, 'vuote') === '1',
  };
}

export function toSearch(q: { room: number; from: string; days: Span; onlyEmpty: boolean }): string {
  const p = new URLSearchParams({ room: String(q.room), from: q.from, days: String(q.days) });
  if (q.onlyEmpty) p.set('vuote', '1');
  return `?${p.toString()}`;
}

export function shiftFrom(from: string, days: Span, direction: 1 | -1): string {
  return addDaysISO(from, direction * days);
}

/**
 * Chi arriva con un film in mano (`?tmdb=`) vuole programmarlo: è la "Replica"
 * del vecchio pannello e dei segnalibri. Fino alla tappa 3b lo fa il wizard.
 */
export function wizardRedirect(sp: SearchParams): string | null {
  if (!first(sp, 'tmdb')) return null;
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const value = Array.isArray(v) ? v[0] : v;
    if (value !== undefined) p.set(k, value);
  }
  return `/admin/programma/wizard?${p.toString()}`;
}
```

- [ ] **Step 4:** stessi test. Expected: PASS (9).
- [ ] **Step 5: Commit** — `Il tavolo legge sala, periodo e filtro dall'indirizzo`

---

### Task 3: La geometria della timeline

- [ ] **Step 1: Test**

<!-- file: src/app/admin/(casa)/programma/_tavolo/geometry.test.ts -->
```ts
import { describe, it, expect } from 'vitest';
import { axisFor, minuteAt, place, ticks } from './geometry';

const DEFAULT = { start: 600, end: 1500 };

describe('axisFor', () => {
  it('senza spettacoli fuori orario, va dall’apertura (10:00) alla chiusura (01:00)', () => {
    expect(axisFor([{ start: 600, end: 700 }])).toEqual(DEFAULT);
  });

  it('si allarga all’ora intera per chi sfora', () => {
    expect(axisFor([{ start: 570, end: 700 }, { start: 1400, end: 1506 }])).toEqual({ start: 540, end: 1560 });
  });
});

describe('place', () => {
  it('trasforma minuti in percentuali', () => {
    expect(place(600, 690, DEFAULT)).toEqual({ left: 0, width: 10 });
    expect(place(1050, 1140, DEFAULT)).toEqual({ left: 50, width: 10 });
  });

  it('taglia ciò che esce dall’asse', () => {
    expect(place(1440, 1560, DEFAULT)).toEqual({ left: 93.33333333333333, width: 6.666666666666667 });
  });
});

describe('minuteAt', () => {
  it('aggancia il quarto d’ora', () => {
    expect(minuteAt(0, DEFAULT)).toBe(600);
    expect(minuteAt(0.5, DEFAULT)).toBe(1050);
    expect(minuteAt(0.505, DEFAULT)).toBe(1050);
    expect(minuteAt(0.52, DEFAULT)).toBe(1065);
  });

  it('non esce dall’asse', () => {
    expect(minuteAt(-1, DEFAULT)).toBe(600);
    expect(minuteAt(2, DEFAULT)).toBe(1485);
  });
});

describe('ticks', () => {
  it('segna un’ora sì e una no, e dopo mezzanotte riparte da 00', () => {
    expect(ticks(DEFAULT).map((t) => t.label)).toEqual(['10', '12', '14', '16', '18', '20', '22', '00']);
    expect(ticks(DEFAULT)[0].left).toBe(0);
  });
});
```

- [ ] **Step 2:** FAIL, modulo mancante.

- [ ] **Step 3: Implementazione**

<!-- file: src/app/admin/(casa)/programma/_tavolo/geometry.ts -->
```ts
import { CLOSING_MINUTE, OPENING_MINUTE } from '@/services/scheduling/times';

/**
 * L'asse orizzontale della timeline, in minuti del giorno di programmazione.
 * Oltre le 24:00 è la coda dopo mezzanotte: 1500 sono le 01:00.
 */
export interface Axis {
  start: number;
  end: number;
}

/** Dall'apertura alla chiusura, allargato all'ora intera per chi ne esce. */
export function axisFor(spans: { start: number; end: number }[]): Axis {
  let start = OPENING_MINUTE;
  let end = CLOSING_MINUTE;
  for (const s of spans) {
    if (s.start < start) start = s.start;
    if (s.end > end) end = s.end;
  }
  return { start: Math.floor(start / 60) * 60, end: Math.ceil(end / 60) * 60 };
}

/** Posizione e larghezza in percentuale, tagliate ai bordi dell'asse. */
export function place(start: number, end: number, axis: Axis): { left: number; width: number } {
  const length = axis.end - axis.start;
  const a = Math.max(start, axis.start);
  const b = Math.min(end, axis.end);
  return { left: ((a - axis.start) / length) * 100, width: (Math.max(b - a, 0) / length) * 100 };
}

/**
 * Il minuto sotto un punto della timeline, agganciato al passo (un quarto
 * d'ora): è una proposta, poi è il controllo della sala a dire se regge.
 */
export function minuteAt(fraction: number, axis: Axis, step = 15): number {
  const f = Math.min(Math.max(fraction, 0), 1);
  const raw = axis.start + f * (axis.end - axis.start);
  return Math.min(Math.max(Math.round(raw / step) * step, axis.start), axis.end - step);
}

export function ticks(axis: Axis, every = 120): { minute: number; label: string; left: number }[] {
  const out: { minute: number; label: string; left: number }[] = [];
  for (let m = Math.ceil(axis.start / every) * every; m <= axis.end; m += every) {
    out.push({
      minute: m,
      label: String(Math.floor(m / 60) % 24).padStart(2, '0'),
      left: ((m - axis.start) / (axis.end - axis.start)) * 100,
    });
  }
  return out;
}
```

- [ ] **Step 4:** PASS (8).
- [ ] **Step 5: Commit** — `La timeline sa dove mettere uno spettacolo e dove l'hai lasciato`

---

### Task 4: Giorni, blocchi e buchi

- [ ] **Step 1: Test**

<!-- file: src/app/admin/(casa)/programma/_tavolo/week.test.ts -->
```ts
import { describe, it, expect } from 'vitest';
import { buildWeek, findBlock, type OccupancyLike } from './week';

const show = (pretixId: number | null, title: string, time: string, startMinute: number, runtime: number) => ({
  pretixId,
  title,
  time,
  endTime: '',
  runtime,
  startMinute,
  endMinute: startMinute + runtime,
  tmdbId: pretixId ? `t${pretixId}` : null,
  posterPath: null,
});

const occupancy: OccupancyLike = {
  totalShows: 3,
  daysDetail: [
    {
      date: '2026-09-28',
      isPast: false,
      isWeekend: false,
      shows: [show(1, 'Born to Be Wild', '10:00', 600, 97), show(2, 'Jeff Buckley', '12:00', 720, 106)],
      gaps: [
        { from: '14:00', to: '14:30', minutes: 30, startMinute: 840 },
        { from: '16:30', to: '19:30', minutes: 180, startMinute: 990 },
      ],
    },
    {
      date: '2026-09-29',
      isPast: false,
      isWeekend: false,
      shows: [show(null, 'Evento esterno', '21:00', 1440 + 1260, 120)],
      gaps: [],
    },
  ],
};

describe('buildWeek', () => {
  it('porta ogni spettacolo nei minuti del suo giorno', () => {
    const w = buildWeek(occupancy, {});
    expect(w.days[1].blocks[0].start).toBe(1260);
    expect(w.days[0].blocks.map((b) => b.key)).toEqual(['1', '2']);
  });

  it('attacca i posti dal database, e senza dati li lascia sconosciuti', () => {
    const w = buildWeek(occupancy, { 1: { available: 1, total: 2, soldOut: false } });
    expect(w.days[0].blocks[0].sold).toBe(1);
    expect(w.days[0].blocks[1].sold).toBeNull();
  });

  it('tiene solo i buchi dove ci sta un film', () => {
    const w = buildWeek(occupancy, {});
    expect(w.days[0].gaps).toEqual([{ start: 990, end: 1170, from: '16:30', to: '19:30', minutes: 180 }]);
    expect(w.filmGaps).toBe(1);
  });

  it('non lascia toccare ciò che non è nato qui', () => {
    const w = buildWeek(occupancy, {});
    expect(w.days[1].blocks[0].touchable).toBe(false);
    expect(w.days[1].blocks[0].key).toBe('2026-09-29-0');
  });

  it('trova un blocco dalla sua chiave', () => {
    const w = buildWeek(occupancy, {});
    expect(findBlock(w, '2')?.block.title).toBe('Jeff Buckley');
    expect(findBlock(w, '99')).toBeNull();
  });
});
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3: Implementazione**

<!-- file: src/app/admin/(casa)/programma/_tavolo/week.ts -->
```ts
import type { DayOccupancy, PeriodOccupancy } from '@/actions/planningActions';
import { MINUTES_PER_DAY } from '@/services/scheduling/times';
import { axisFor, type Axis } from './geometry';

/** Un buco più corto di così non ospita un film con la sua pausa: non si disegna. */
export const MIN_FILM_GAP = 90;

export interface Seats {
  available: number | null;
  total: number | null;
  soldOut: boolean;
}

/** Quel che serve del risultato di `planningGetPeriodOccupancy`. */
export type OccupancyLike = Pick<PeriodOccupancy, 'totalShows'> & {
  daysDetail: (Pick<DayOccupancy, 'date' | 'isPast' | 'isWeekend' | 'gaps'> & {
    shows: Pick<DayOccupancy['shows'][number], 'pretixId' | 'title' | 'time' | 'endTime' | 'runtime' | 'startMinute' | 'endMinute' | 'tmdbId' | 'posterPath'>[];
  })[];
};

export interface TavoloBlock {
  key: string;
  pretixId: number | null;
  tmdbId: string | null;
  title: string;
  time: string;
  endTime: string;
  runtime: number;
  /** Minuti del giorno di programmazione (oltre 1440 = dopo mezzanotte). */
  start: number;
  end: number;
  /** Si sposta e si elimina solo ciò che è futuro ed è nato da Pretix. */
  touchable: boolean;
  sold: number | null;
  total: number | null;
  soldOut: boolean;
  posterPath: string | null;
}

export interface TavoloGap {
  start: number;
  end: number;
  from: string;
  to: string;
  minutes: number;
}

export interface TavoloDay {
  date: string;
  isPast: boolean;
  isWeekend: boolean;
  blocks: TavoloBlock[];
  gaps: TavoloGap[];
}

export interface TavoloWeek {
  days: TavoloDay[];
  axis: Axis;
  totalShows: number;
  /** Buchi futuri dove ci sta un film. */
  filmGaps: number;
}

export function buildWeek(occupancy: OccupancyLike, seats: Record<number, Seats>): TavoloWeek {
  const days: TavoloDay[] = occupancy.daysDetail.map((d, i) => {
    const base = i * MINUTES_PER_DAY;
    const blocks = d.shows.map((s, j): TavoloBlock => {
      const seat = s.pretixId != null ? seats[s.pretixId] : undefined;
      const sold =
        seat && seat.total !== null && seat.available !== null ? Math.max(0, seat.total - seat.available) : null;
      return {
        key: s.pretixId != null ? String(s.pretixId) : `${d.date}-${j}`,
        pretixId: s.pretixId,
        tmdbId: s.tmdbId ?? null,
        title: s.title,
        time: s.time,
        endTime: s.endTime,
        runtime: s.runtime,
        start: s.startMinute - base,
        end: s.endMinute - base,
        touchable: s.pretixId != null && !d.isPast,
        sold,
        total: seat?.total ?? null,
        soldOut: seat?.soldOut ?? false,
        posterPath: s.posterPath ?? null,
      };
    });
    const gaps = d.gaps
      .filter((g) => g.minutes >= MIN_FILM_GAP)
      .map((g) => ({
        start: g.startMinute - base,
        end: g.startMinute - base + g.minutes,
        from: g.from,
        to: g.to,
        minutes: g.minutes,
      }));
    return { date: d.date, isPast: d.isPast, isWeekend: d.isWeekend, blocks, gaps };
  });

  return {
    days,
    axis: axisFor(days.flatMap((d) => d.blocks.map((b) => ({ start: b.start, end: b.end })))),
    totalShows: occupancy.totalShows,
    filmGaps: days.reduce((n, d) => n + (d.isPast ? 0 : d.gaps.length), 0),
  };
}

export function findBlock(week: TavoloWeek, key: string): { day: TavoloDay; block: TavoloBlock } | null {
  for (const day of week.days) {
    const block = day.blocks.find((b) => b.key === key);
    if (block) return { day, block };
  }
  return null;
}
```

- [ ] **Step 4:** PASS (5).
- [ ] **Step 5: Commit** — `Il tavolo trasforma l'occupazione della sala in giorni, blocchi e buchi`

---

### Task 5: Le etichette

- [ ] **Step 1: Test**

<!-- file: src/app/admin/(casa)/programma/_tavolo/labels.test.ts -->
```ts
import { describe, it, expect } from 'vitest';
import { dayLong, dayShort, periodLabel } from './labels';

describe('etichette', () => {
  it('giorno corto e lungo, in italiano', () => {
    expect(dayShort('2026-09-29')).toBe('Mar 29');
    expect(dayLong('2026-09-29')).toBe('martedì 29 settembre');
  });

  it('il periodo, con il mese solo dove serve', () => {
    expect(periodLabel('2026-09-28', 7)).toBe('28 set – 4 ott');
    expect(periodLabel('2026-10-05', 7)).toBe('5 – 11 ott');
    expect(periodLabel('2026-09-29', 1)).toBe('martedì 29 settembre');
  });
});
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3: Implementazione**

<!-- file: src/app/admin/(casa)/programma/_tavolo/labels.ts -->
```ts
import { addDaysISO } from '@/services/scheduling/times';

/** A mezzogiorno UTC la data è la stessa a Roma: l'etichetta non scivola. */
function at(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

function fmt(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return at(iso).toLocaleDateString('it-IT', { ...opts, timeZone: 'UTC' }).replace('.', '');
}

/** "Mar 29" */
export function dayShort(iso: string): string {
  const s = `${fmt(iso, { weekday: 'short' })} ${Number(iso.slice(8))}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "martedì 29 settembre" */
export function dayLong(iso: string): string {
  return fmt(iso, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** "28 set – 4 ott", "5 – 11 ott"; un giorno solo si scrive per intero. */
export function periodLabel(from: string, days: number): string {
  if (days === 1) return dayLong(from);
  const to = addDaysISO(from, days - 1);
  const month = (iso: string) => fmt(iso, { month: 'short' });
  const day = (iso: string) => Number(iso.slice(8));
  return month(from) === month(to)
    ? `${day(from)} – ${day(to)} ${month(to)}`
    : `${day(from)} ${month(from)} – ${day(to)} ${month(to)}`;
}
```

- [ ] **Step 4:** PASS (2).
- [ ] **Step 5: Commit** — `Il tavolo scrive giorni e periodi in italiano`

---

### Task 6: La lettura dal server

<!-- file: src/app/admin/(casa)/programma/_tavolo/load.ts -->
```ts
import prisma from '@/lib/prisma';
import {
  planningDefaultStartDate,
  planningGetPeriodOccupancy,
  planningGetRooms,
} from '@/actions/planningActions';
import type { Span, TavoloQuery } from './query';
import { buildWeek, type Seats, type TavoloWeek } from './week';

export interface TavoloRoom {
  id: number;
  name: string;
  isFavorite: boolean;
}

export interface TavoloData {
  rooms: TavoloRoom[];
  roomId: number | null;
  /** La sala era nell'indirizzo: se no, il client prova quella salvata sul computer. */
  roomFromParam: boolean;
  from: string;
  days: Span;
  onlyEmpty: boolean;
  week: TavoloWeek | null;
}

/**
 * Occupazione dalla stessa funzione del wizard, posti dal database come in
 * Oggi: una query sola per tutti gli spettacoli del periodo.
 */
export async function loadTavolo(q: TavoloQuery): Promise<TavoloData> {
  const [rooms, from] = await Promise.all([
    planningGetRooms(),
    q.from ? Promise.resolve(q.from) : planningDefaultStartDate(),
  ]);

  const chosen = q.room !== null && rooms.some((r) => r.id === q.room) ? q.room : null;
  const roomId = chosen ?? (rooms.find((r) => r.isFavorite) ?? rooms[0])?.id ?? null;
  const base = { rooms, roomId, roomFromParam: chosen !== null, from, days: q.days, onlyEmpty: q.onlyEmpty };
  if (roomId === null) return { ...base, week: null };

  const occupancy = await planningGetPeriodOccupancy(roomId, from, q.days);
  const ids = occupancy.daysDetail
    .flatMap((d) => d.shows.map((s) => s.pretixId))
    .filter((id): id is number => id !== null);

  const rows = ids.length
    ? await prisma.pretixSync.findMany({
        where: { pretixId: { in: ids } },
        select: { pretixId: true, availableSeats: true, totalSeats: true, isSoldOut: true },
      })
    : [];
  const seats: Record<number, Seats> = Object.fromEntries(
    rows.map((r) => [r.pretixId, { available: r.availableSeats, total: r.totalSeats, soldOut: r.isSoldOut }])
  );

  return { ...base, week: buildWeek(occupancy, seats) };
}
```

- [ ] `npx tsc --noEmit` muto. **Commit** — `Il tavolo legge sala, occupazione e posti dal server`

---

### Task 7: Il cassetto dello spettacolo

**Modifica prima `Button`:** un `href` esterno (`http…`) si apre in una scheda nuova con `<a>`, non con `Link`.

<!-- file: src/app/admin/(casa)/programma/_tavolo/DeleteDialog.tsx -->
```tsx
'use client';

import { useState } from 'react';
import { planningDeleteShow } from '@/actions/planningActions';
import Button from '@/components/cabina/Button';
import Dialog from '@/components/cabina/Dialog';
import type { TavoloBlock } from './week';
import styles from './BlockPanel.module.css';

interface Props {
  block: TavoloBlock;
  when: string;
  onClose: () => void;
  onDeleted: () => void;
}

/**
 * Eliminare è irreversibile e si vede online subito. La spunta di consenso
 * compare solo se qualcuno ha già pagato: chiederla a sala vuota insegnerebbe
 * a premere sì senza leggere.
 */
export default function DeleteDialog({ block, when, onClose, onDeleted }: Props) {
  const [refusal, setRefusal] = useState<{ message: string; soldTickets: number } | null>(null);
  const [consent, setConsent] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (block.pretixId === null) return;
    setWorking(true);
    setError(null);
    try {
      const res = await planningDeleteShow(block.pretixId, refusal !== null);
      if (!res.deleted) {
        setRefusal({ message: res.error ?? '', soldTickets: res.soldTickets });
        return;
      }
      onDeleted();
    } catch {
      setError("L'eliminazione non è riuscita. Ricarica il tavolo e controlla.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={`Eliminare «${block.title}»?`} showTitle>
      <p className={styles.text}>
        {when}, ore {block.time}. Sparisce da Pretix, dal sito e dalla home: non si torna indietro.
      </p>
      {refusal && (
        <p className={styles.alarm}>
          {refusal.message} Eliminarlo lascia orfani quegli ordini: vanno rimborsati a mano dal pannello Pretix.
        </p>
      )}
      {error && <p className={styles.alarm}>{error}</p>}
      {refusal && (
        <label className={styles.consent}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          Ho capito: elimino uno spettacolo con {refusal.soldTickets}{' '}
          {refusal.soldTickets === 1 ? 'biglietto venduto' : 'biglietti venduti'}.
        </label>
      )}
      <div className={styles.dialogActions}>
        <Button variant="ghost" onClick={onClose} disabled={working}>Annulla</Button>
        <Button variant="alarm" onClick={confirm} disabled={working || (refusal !== null && !consent)}>
          {working ? 'Elimino…' : refusal ? 'Elimina lo stesso' : 'Elimina'}
        </Button>
      </div>
    </Dialog>
  );
}
```

<!-- file: src/app/admin/(casa)/programma/_tavolo/BlockPanel.tsx -->
```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { adminListQuotas } from '@/actions/adminActions';
import { planningCheckMove, planningMoveShow, type MoveCheck } from '@/actions/planningActions';
import Button from '@/components/cabina/Button';
import { useToast } from '@/components/cabina/Toast';
import DeleteDialog from './DeleteDialog';
import { dayLong, dayShort } from './labels';
import type { TavoloBlock, TavoloDay } from './week';
import styles from './BlockPanel.module.css';

export interface MoveIntent {
  day: string;
  time: string;
}

interface Quota {
  id: number;
  name: string | { it?: string };
  size: number | null;
  available_number?: number | null;
}

interface Props {
  block: TavoloBlock;
  day: TavoloDay;
  /** I giorni in cui si può spostare: quelli del periodo, non passati. */
  targetDays: string[];
  roomId: number;
  from: string;
  intent: MoveIntent | null;
  onClose: () => void;
  /** Qualcosa è cambiato in sala: il tavolo va riletto. */
  onChanged: (opts?: { keepOpen?: boolean }) => void;
}

const CLOCK = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function normalizeClock(v: string): string | null {
  const m = v.trim().match(CLOCK);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

function quotaName(q: Quota): string {
  return typeof q.name === 'string' ? q.name : q.name?.it ?? 'Quota';
}

export default function BlockPanel({ block, day, targetDays, roomId, from, intent, onClose, onChanged }: Props) {
  const toast = useToast();
  const [moveDay, setMoveDay] = useState(intent?.day ?? day.date);
  const [moveTime, setMoveTime] = useState(intent?.time ?? block.time);
  const [result, setResult] = useState<{ key: string; check: MoveCheck | null; error?: string } | null>(null);
  const [consent, setConsent] = useState(false);
  const [working, setWorking] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [quotas, setQuotas] = useState<Quota[] | null>(null);
  const [loadingQuotas, setLoadingQuotas] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const request = useRef(0);

  const clock = normalizeClock(moveTime);
  const changed = moveDay !== day.date || (clock !== null && clock !== block.time);
  const wanted = block.touchable && changed && clock ? `${moveDay}@${clock}` : null;
  const checking = wanted !== null && result?.key !== wanted;
  const check = wanted !== null && result?.key === wanted ? result.check : null;

  // Si chiede alla sala solo dopo che si è smesso di scrivere.
  useEffect(() => {
    if (!wanted || block.pretixId === null || !clock) return;
    const id = ++request.current;
    const timer = window.setTimeout(async () => {
      try {
        const c = await planningCheckMove({ seatingPlanId: roomId, pretixId: block.pretixId!, day: moveDay, time: clock, fromDate: from });
        if (request.current === id) setResult({ key: wanted, check: c });
      } catch {
        if (request.current === id) setResult({ key: wanted, check: null, error: 'Non sono riuscito a leggere la sala. Riprova.' });
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [wanted, block.pretixId, clock, moveDay, roomId, from]);

  const conflicts = check?.conflicts ?? [];
  const replaces = conflicts.map((c) => c.pretixId).filter((v): v is number => v != null);
  const needsConsent = (check?.soldTickets ?? 0) > 0;
  const canMove = Boolean(check?.usable) && (!needsConsent || consent) && !working;

  const confirmMove = async () => {
    if (!check || block.pretixId === null || !clock) return;
    setWorking(true);
    setMoveError(null);
    try {
      const res = await planningMoveShow({
        seatingPlanId: roomId,
        pretixId: block.pretixId,
        day: moveDay,
        time: clock,
        fromDate: from,
        replaces,
        force: needsConsent,
        allowOutsideHours: Boolean(check.outsideHours),
      });
      if (!res.moved) {
        setMoveError(res.error ?? 'Lo spostamento non è riuscito.');
        if (res.deleted.length > 0) onChanged({ keepOpen: true });
        return;
      }
      toast(`«${block.title}» spostato a ${dayLong(moveDay)} alle ${check.slot?.time ?? clock}.`, 'ok');
      onChanged();
    } catch {
      setMoveError('Lo spostamento non è riuscito. Ricarica il tavolo e controlla.');
    } finally {
      setWorking(false);
    }
  };

  const readQuotas = async () => {
    if (block.pretixId === null) return;
    setLoadingQuotas(true);
    try {
      setQuotas((await adminListQuotas(block.pretixId)) as Quota[]);
    } catch {
      toast('Pretix non ha risposto. Riprova fra poco.', 'alarm');
    } finally {
      setLoadingQuotas(false);
    }
  };

  const seats = block.soldOut
    ? 'Tutto esaurito'
    : block.sold !== null && block.total !== null
      ? `${block.sold} / ${block.total} venduti`
      : 'Posti non ancora letti';
  const soldShare = block.sold !== null && block.total ? Math.min(block.sold / block.total, 1) : 0;

  return (
    <div className={styles.panel}>
      <button type="button" className={styles.close} onClick={onClose} aria-label="Chiudi">
        <X size={16} />
      </button>

      <header>
        <p className={styles.kicker}>{block.touchable ? 'In sala · Pretix' : day.isPast ? 'Già passato' : 'Fuori dalla programmazione'}</p>
        <h2 className={styles.title}>{block.title}</h2>
        <p className={styles.meta}>
          {dayShort(day.date)} · <span className={styles.clock}>{block.time} – {block.endTime}</span> · {block.runtime}′
        </p>
      </header>

      <section className={styles.group}>
        <div className={styles.row}>
          <span className={styles.label}>Posti</span>
          <span className={styles.mono}>{seats}</span>
        </div>
        <div className={styles.seatBar}><span style={{ width: `${soldShare * 100}%` }} /></div>
        {block.pretixId !== null && (
          quotas ? (
            <ul className={styles.quotas}>
              {quotas.map((q) => (
                <li key={q.id}>
                  {quotaName(q)} <b>{q.available_number ?? '…'} / {q.size ?? '∞'}</b>
                </li>
              ))}
            </ul>
          ) : (
            <Button variant="ghost" onClick={readQuotas} disabled={loadingQuotas}>
              {loadingQuotas ? 'Leggo…' : 'Quote Pretix'}
            </Button>
          )
        )}
      </section>

      {!block.touchable ? (
        <p className={styles.text}>
          {day.isPast
            ? 'È già passato: si guarda, non si tocca.'
            : 'Non è nato dalla programmazione, quindi qui non si sposta: si gestisce da Pretix.'}
        </p>
      ) : (
        <>
          <section className={styles.group}>
            <span className={styles.label}>Sposta</span>
            <div className={styles.fields}>
              <select value={moveDay} onChange={(e) => { setMoveDay(e.target.value); setConsent(false); }} aria-label="Giorno">
                {targetDays.map((d) => (
                  <option key={d} value={d}>{dayShort(d)}</option>
                ))}
              </select>
              <input
                value={moveTime}
                onChange={(e) => { setMoveTime(e.target.value); setConsent(false); }}
                inputMode="numeric"
                aria-label="Orario"
                aria-invalid={clock === null ? true : undefined}
              />
            </div>

            {!changed && <p className={styles.hint}>Scrivi un altro orario, scegli un altro giorno, o trascina il blocco sulla settimana.</p>}
            {clock === null && <p className={styles.alarmText}>Scrivi l’orario come 18:30.</p>}
            {checking && <p className={styles.hint}>Guardo la sala…</p>}
            {result?.error && wanted && <p className={styles.alarmText}>{result.error}</p>}

            {check && (
              <>
                <p className={check.usable ? (conflicts.length || check.outsideHours ? styles.warnText : styles.okText) : styles.alarmText}>
                  {check.message}
                </p>
                {check.warning && <p className={styles.warnText}>{check.warning}</p>}
                {check.movingShowSoldTickets === null && (
                  <p className={styles.warnText}>Non sono riuscito a contare i biglietti già venduti per questo spettacolo.</p>
                )}
                {(check.movingShowSoldTickets ?? 0) > 0 && (
                  <p className={styles.warnText}>
                    {check.movingShowSoldTickets}{' '}
                    {check.movingShowSoldTickets === 1 ? 'persona ha' : 'persone hanno'} già un biglietto per le {block.time}:
                    si presenteranno all’orario vecchio. Pretix non le avvisa, devi farlo tu.
                  </p>
                )}
                {needsConsent && (
                  <label className={styles.consent}>
                    <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                    Ho capito: elimino {conflicts.length === 1 ? 'uno spettacolo' : `${conflicts.length} spettacoli`} con{' '}
                    {check.soldTickets} {check.soldTickets === 1 ? 'biglietto venduto' : 'biglietti venduti'}.
                  </label>
                )}
              </>
            )}
            {moveError && <p className={styles.alarmText}>{moveError}</p>}

            {check?.usable && (
              <Button variant={conflicts.length ? 'alarm' : 'fill'} onClick={confirmMove} disabled={!canMove}>
                {working
                  ? 'Sposto…'
                  : conflicts.length
                    ? `Sposta ed elimina ${conflicts.map((c) => `«${c.title}»`).join(' e ')}`
                    : check.outsideHours
                      ? 'Sposta lo stesso'
                      : `Sposta a ${dayShort(moveDay)} ${check.slot?.time ?? clock}`}
              </Button>
            )}
          </section>

          <section className={styles.group}>
            <span className={styles.label}>Altro</span>
            {block.tmdbId && (
              <Button href={`/admin/programma/wizard?room=${roomId}&tmdb=${encodeURIComponent(block.tmdbId)}`} variant="ghost">
                + Aggiungi una replica
              </Button>
            )}
            <Button variant="alarm" onClick={() => setDeleting(true)}>Elimina lo spettacolo</Button>
            <p className={styles.hint}>
              {block.sold ? `${block.sold} biglietti venduti: prima di eliminarlo te lo ricordo.` : 'Si elimina da Pretix e dal sito, dopo una conferma.'}
            </p>
          </section>
        </>
      )}

      {deleting && (
        <DeleteDialog
          block={block}
          when={dayLong(day.date)}
          onClose={() => setDeleting(false)}
          onDeleted={() => {
            setDeleting(false);
            toast(`«${block.title}» eliminato.`, 'ok');
            onChanged();
          }}
        />
      )}
    </div>
  );
}
```

<!-- file: src/app/admin/(casa)/programma/_tavolo/BlockPanel.module.css -->
```css
.panel { position: relative; display: grid; gap: 16px; padding: 18px; }
.close {
  position: absolute; top: 12px; right: 12px; display: grid; place-items: center;
  width: 30px; height: 30px; background: none; border: 0; border-radius: var(--c-radius);
  color: var(--c-dim); cursor: pointer;
}
.close:hover { color: var(--c-ink); background: var(--c-amber-soft); }

.kicker, .label {
  margin: 0; font-family: var(--c-font-mono); font-size: 10px;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--c-dim);
}
.kicker { color: var(--c-amber); }
.title { margin: 6px 32px 4px 0; font-family: var(--c-font-serif); font-weight: 600; font-size: 22px; line-height: 1.15; }
.meta { margin: 0; color: var(--c-dim); }
.clock, .mono { font-family: var(--c-font-mono); }
.clock { color: var(--c-amber); }

.group { display: grid; gap: 8px; padding-top: 14px; border-top: 1px solid var(--c-line); }
.row { display: flex; justify-content: space-between; align-items: baseline; }
.seatBar { height: 4px; border-radius: 2px; background: var(--c-line); overflow: hidden; }
.seatBar span { display: block; height: 100%; background: var(--c-ok); }
.quotas { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; font-size: 12px; color: var(--c-dim); }
.quotas b { font-family: var(--c-font-mono); font-weight: 400; color: var(--c-ink); margin-left: 6px; }

.fields { display: grid; grid-template-columns: 1fr 88px; gap: 6px; }
.fields select, .fields input {
  min-height: 38px; padding: 0 10px; background: var(--c-bg-sunken); color: var(--c-ink);
  border: 1px solid var(--c-line); border-radius: var(--c-radius); font-family: var(--c-font-mono); font-size: 13px;
}
.fields input:focus, .fields select:focus { outline: none; border-color: var(--c-amber); }
.fields input[aria-invalid='true'] { border-color: var(--c-alarm); }

.text, .hint, .okText, .warnText, .alarmText { margin: 0; font-size: 12.5px; line-height: 1.45; }
.hint { color: var(--c-dim); }
.okText { color: var(--c-ok); }
.warnText { color: var(--c-amber); }
.alarmText { color: var(--c-alarm); }
.alarm { margin: 0 0 12px; padding: 10px 12px; border-left: 2px solid var(--c-alarm); background: var(--c-alarm-soft); font-size: 13px; }
.text { margin-bottom: 12px; }

.consent { display: flex; gap: 8px; align-items: flex-start; font-size: 12.5px; }
.consent input { margin-top: 2px; accent-color: var(--c-alarm); }

.dialogActions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
```

- [ ] `npx tsc --noEmit` muto e `eslint` pulito. **Commit** — `Il cassetto dello spettacolo: posti, quote, sposta, replica, elimina`

---

### Task 8: La stanza e la pagina

<!-- file: src/app/admin/(casa)/programma/_tavolo/Tavolo.tsx -->
```tsx
'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Button from '@/components/cabina/Button';
import Dialog from '@/components/cabina/Dialog';
import { formatClock } from '@/services/scheduling/times';
import BlockPanel, { type MoveIntent } from './BlockPanel';
import { minuteAt, place, ticks } from './geometry';
import { dayShort, periodLabel } from './labels';
import type { TavoloData } from './load';
import { SPANS, shiftFrom, toSearch, type Span } from './query';
import { findBlock, type TavoloBlock, type TavoloDay } from './week';
import styles from './Tavolo.module.css';

const PRETIX_URL = 'https://pretix.eu/vestri/npkez/';
const MOBILE = '(max-width: 767px)';

function subscribeMobile(onChange: () => void) {
  const m = window.matchMedia(MOBILE);
  m.addEventListener('change', onChange);
  return () => m.removeEventListener('change', onChange);
}

function seatNote(b: TavoloBlock): string {
  if (b.soldOut) return 'esaurito';
  if (b.sold === null || b.total === null) return '';
  return `${b.sold}/${b.total}`;
}

export default function Tavolo({ data }: { data: TavoloData }) {
  const router = useRouter();
  const isMobile = useSyncExternalStore(subscribeMobile, () => window.matchMedia(MOBILE).matches, () => false);
  const [selected, setSelected] = useState<string | null>(null);
  const [intent, setIntent] = useState<MoveIntent | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);

  const { week, roomId } = data;
  const found = selected && week ? findBlock(week, selected) : null;
  const targetDays = week ? week.days.filter((d) => !d.isPast).map((d) => d.date) : [];

  const go = (patch: Partial<{ room: number; from: string; days: Span; onlyEmpty: boolean }>, replace = false) => {
    if (roomId === null) return;
    const next = { room: roomId, from: data.from, days: data.days, onlyEmpty: data.onlyEmpty, ...patch };
    setSelected(null);
    setIntent(null);
    const url = `/admin/programma${toSearch(next)}`;
    if (replace) router.replace(url);
    else router.push(url);
  };

  // Senza sala nell'indirizzo si usa quella scelta su questo computer, come nel wizard.
  useEffect(() => {
    if (data.roomFromParam) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem('defaultSalaId');
    } catch {
      /* archivio del browser non disponibile */
    }
    const id = Number(saved);
    if (id && id !== roomId && data.rooms.some((r) => r.id === id)) {
      router.replace(`/admin/programma${toSearch({ room: id, from: data.from, days: data.days, onlyEmpty: data.onlyEmpty })}`);
    }
  }, [data.roomFromParam, data.rooms, data.from, data.days, data.onlyEmpty, roomId, router]);

  // Esc chiude il cassetto, a meno che non ci sia una finestra aperta sopra.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[role="dialog"]')) return;
      setSelected(null);
      setIntent(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const chooseRoom = (id: number) => {
    try {
      localStorage.setItem('defaultSalaId', String(id));
    } catch {
      /* pazienza: vale solo per questa visita */
    }
    go({ room: id });
  };

  const open = (key: string) => {
    setSelected(key);
    setIntent(null);
  };

  const drop = (e: React.DragEvent<HTMLDivElement>, day: TavoloDay) => {
    e.preventDefault();
    const key = dragKey ?? e.dataTransfer.getData('text/plain');
    setDragKey(null);
    if (!key || !week || day.isPast) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const minute = minuteAt((e.clientX - rect.left) / rect.width, week.axis);
    setSelected(key);
    setIntent({ day: day.date, time: formatClock(minute) });
  };

  const changed = (opts?: { keepOpen?: boolean }) => {
    if (!opts?.keepOpen) {
      setSelected(null);
      setIntent(null);
    }
    router.refresh();
  };

  const panel = found && roomId !== null && (
    <BlockPanel
      key={`${found.block.key}@${intent?.day ?? ''}${intent?.time ?? ''}`}
      block={found.block}
      day={found.day}
      targetDays={targetDays}
      roomId={roomId}
      from={data.from}
      intent={intent}
      onClose={() => { setSelected(null); setIntent(null); }}
      onChanged={changed}
    />
  );

  const title = data.days === 1 ? 'La giornata' : data.days === 7 ? 'La settimana' : 'Il periodo';

  return (
    <div className={styles.room}>
      <header className={styles.head}>
        <div>
          <div className={styles.controls}>
            <select
              className={styles.select}
              value={roomId ?? ''}
              onChange={(e) => chooseRoom(Number(e.target.value))}
              aria-label="Sala"
            >
              {data.rooms.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <div className={styles.period}>
              <button type="button" onClick={() => go({ from: shiftFrom(data.from, data.days, -1) })} aria-label="Periodo precedente">
                <ChevronLeft size={15} />
              </button>
              <span>{periodLabel(data.from, data.days)}</span>
              <button type="button" onClick={() => go({ from: shiftFrom(data.from, data.days, 1) })} aria-label="Periodo successivo">
                <ChevronRight size={15} />
              </button>
            </div>
            <select
              className={styles.select}
              value={data.days}
              onChange={(e) => go({ days: Number(e.target.value) as Span })}
              aria-label="Ampiezza"
            >
              {SPANS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <h1 className={styles.title}>{title}</h1>
        </div>
        <div className={styles.actions}>
          <Button variant={data.onlyEmpty ? 'fill' : 'ghost'} onClick={() => go({ onlyEmpty: !data.onlyEmpty }, true)}>
            Solo vuote
          </Button>
          <Button href={PRETIX_URL} variant="ghost">Pretix ↗</Button>
          <Button href={`/admin/programma/wizard${roomId !== null ? `?room=${roomId}` : ''}`} variant="fill">+ Programma</Button>
        </div>
      </header>

      {!week ? (
        <p className={styles.empty}>Nessuna sala disponibile su Pretix.</p>
      ) : (
        <div className={styles.table} data-open={found ? '' : undefined}>
          <div className={styles.timeline}>
            <div className={styles.ruler} aria-hidden>
              <span />
              <div className={styles.ticks}>
                {ticks(week.axis).map((t) => (
                  <span key={t.minute} style={{ left: `${t.left}%` }}>{t.label}</span>
                ))}
              </div>
            </div>

            {week.days.map((day) => (
              <div key={day.date} className={styles.day} data-past={day.isPast || undefined} data-weekend={day.isWeekend || undefined}>
                <span className={styles.dayLabel}>{dayShort(day.date)}</span>

                <div
                  className={styles.track}
                  data-drop={dragKey && !day.isPast ? '' : undefined}
                  onDragOver={(e) => { if (dragKey && !day.isPast) e.preventDefault(); }}
                  onDrop={(e) => drop(e, day)}
                  onClick={(e) => { if (e.target === e.currentTarget) { setSelected(null); setIntent(null); } }}
                >
                  {day.gaps.map((g) => {
                    const pos = place(g.start, g.end, week.axis);
                    return (
                      <span
                        key={`gap-${g.start}`}
                        className={styles.gap}
                        style={{ left: `${pos.left}%`, width: `${pos.width}%` }}
                        title={`Libero ${g.from} – ${g.to}`}
                      />
                    );
                  })}
                  {day.blocks.map((b) => {
                    const pos = place(b.start, b.end, week.axis);
                    return (
                      <button
                        key={b.key}
                        type="button"
                        className={styles.block}
                        style={{ left: `${pos.left}%`, width: `${pos.width}%` }}
                        data-selected={selected === b.key || undefined}
                        data-locked={!b.touchable || undefined}
                        data-dim={(data.onlyEmpty && b.sold !== 0) || undefined}
                        data-soldout={b.soldOut || undefined}
                        draggable={b.touchable}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', b.key);
                          e.dataTransfer.effectAllowed = 'move';
                          setDragKey(b.key);
                        }}
                        onDragEnd={() => setDragKey(null)}
                        onClick={() => open(b.key)}
                        title={`${b.time} ${b.title}`}
                      >
                        <span className={styles.blockTime}>{b.time}</span>
                        <span className={styles.blockTitle}>{b.title}</span>
                      </button>
                    );
                  })}
                </div>

                <ol className={styles.dayList}>
                  {day.blocks.length === 0 && <li className={styles.dayListEmpty}>Nessuno spettacolo</li>}
                  {day.blocks.map((b) => (
                    <li key={b.key}>
                      <button
                        type="button"
                        onClick={() => open(b.key)}
                        data-dim={(data.onlyEmpty && b.sold !== 0) || undefined}
                      >
                        <span className={styles.blockTime}>{b.time}</span>
                        <span className={styles.listTitle}>{b.title}</span>
                        <span className={styles.listSeats}>{seatNote(b)}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>

          <aside className={styles.side}>
            {!isMobile && panel ? (
              panel
            ) : (
              <div className={styles.legend}>
                <p className={styles.legendTitle}>Il tavolo</p>
                <p>Clic su uno spettacolo per aprirlo. Trascinalo su un altro punto della settimana per spostarlo: prima di scrivere su Pretix ti dico cosa comporta.</p>
                <ul>
                  <li><span className={styles.swatchBlock} /> in sala, su Pretix</li>
                  <li><span className={styles.swatchSold} /> tutto esaurito</li>
                  <li><span className={styles.swatchGap} /> buco dove ci sta un film</li>
                </ul>
                <p className={styles.legendNote}>Per programmare film nuovi, “+ Programma” apre il wizard. Nella prossima tappa il catalogo arriva qui.</p>
              </div>
            )}
          </aside>
        </div>
      )}

      {week && (
        <footer className={styles.foot}>
          <span>
            {week.totalShows} {week.totalShows === 1 ? 'spettacolo' : 'spettacoli'} · {week.filmGaps}{' '}
            {week.filmGaps === 1 ? 'buco dove ci sta un film' : 'buchi dove ci sta un film'}
          </span>
          <span className={styles.footHint}>Esc chiude il cassetto</span>
        </footer>
      )}

      {isMobile && found && (
        <Dialog open onClose={() => { setSelected(null); setIntent(null); }} title={found.block.title} variant="sheet">
          {panel}
        </Dialog>
      )}
    </div>
  );
}
```

<!-- file: src/app/admin/(casa)/programma/_tavolo/Tavolo.module.css -->
```css
.room { padding: 24px 24px 0; }

.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 18px; flex-wrap: wrap; }
.controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.select, .period {
  min-height: 32px; background: var(--c-bg-sunken); color: var(--c-ink);
  border: 1px solid var(--c-line); border-radius: var(--c-radius);
  font-family: var(--c-font-mono); font-size: 11px; letter-spacing: 0.06em;
}
.select { padding: 0 8px; }
.period { display: flex; align-items: center; gap: 4px; padding: 0 4px; }
.period span { padding: 0 6px; white-space: nowrap; }
.period button { display: grid; place-items: center; width: 26px; height: 26px; background: none; border: 0; color: var(--c-dim); cursor: pointer; border-radius: 4px; }
.period button:hover { color: var(--c-amber); background: var(--c-amber-soft); }
.title { margin: 0; font-family: var(--c-font-serif); font-weight: 600; font-size: 32px; line-height: 1; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.empty { color: var(--c-dim); }

.table {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  min-height: 60vh;
  border: 1px solid var(--c-line);
  border-radius: var(--c-radius-lg);
  overflow: hidden;
}
.timeline { padding: 14px 16px 18px; overflow-x: auto; }
.side { border-left: 1px solid var(--c-line); background: var(--c-bg-raised); overflow-y: auto; max-height: calc(100dvh - 200px); position: sticky; top: var(--c-topbar-h); }

.ruler, .day { display: grid; grid-template-columns: 56px minmax(560px, 1fr); align-items: center; }
.ticks { position: relative; height: 16px; }
.ticks span { position: absolute; transform: translateX(-50%); font-family: var(--c-font-mono); font-size: 9.5px; color: var(--c-dim); }
.ticks span:first-child { transform: none; }

.day { margin-top: 6px; }
.day[data-past] { opacity: 0.45; }
.dayLabel { font-family: var(--c-font-mono); font-size: 10.5px; color: var(--c-dim); }
.day[data-weekend] .dayLabel { color: var(--c-ink); }

.track {
  position: relative;
  height: 46px;
  border: 1px solid var(--c-line);
  border-radius: var(--c-radius);
  background: repeating-linear-gradient(90deg, transparent 0, transparent calc(100% / 15 - 1px), #1c1712 calc(100% / 15 - 1px), #1c1712 calc(100% / 15));
}
.track[data-drop] { border-color: var(--c-amber); box-shadow: inset 0 0 0 1px var(--c-amber-soft); }

.gap {
  position: absolute; top: 3px; bottom: 3px; border-radius: 3px; pointer-events: none;
  background: repeating-linear-gradient(135deg, transparent 0 5px, rgba(232, 163, 61, 0.08) 5px 10px);
}

.block {
  position: absolute; top: 3px; bottom: 3px;
  display: grid; align-content: center; gap: 1px;
  min-width: 0; padding: 2px 6px; overflow: hidden;
  background: #2a2119; color: var(--c-ink);
  border: 0; border-left: 2px solid var(--c-amber); border-radius: 3px;
  text-align: left; cursor: pointer;
  transition: background var(--c-fast), box-shadow var(--c-fast), opacity var(--c-fast);
}
.block:hover { background: #342818; }
.block[data-selected] { background: #3a2a15; box-shadow: 0 0 0 2px var(--c-amber); z-index: 2; }
.block[data-locked] { border-left-color: var(--c-line-strong); cursor: default; }
.block[data-soldout] { border-left-color: var(--c-ok); }
.block[data-dim] { opacity: 0.25; }
.block[draggable='true'] { cursor: grab; }
.blockTime { font-family: var(--c-font-mono); font-size: 9px; color: var(--c-amber); }
.blockTitle { font-family: var(--c-font-serif); font-size: 11.5px; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.dayList { display: none; }

.legend { display: grid; gap: 12px; padding: 18px; color: var(--c-dim); font-size: 13px; }
.legend p { margin: 0; }
.legendTitle { font-family: var(--c-font-serif); font-size: 18px; color: var(--c-ink); }
.legend ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.legend li { display: flex; align-items: center; gap: 8px; }
.swatchBlock, .swatchSold, .swatchGap { width: 18px; height: 12px; border-radius: 2px; background: #2a2119; border-left: 2px solid var(--c-amber); }
.swatchSold { border-left-color: var(--c-ok); }
.swatchGap { border: 0; background: repeating-linear-gradient(135deg, transparent 0 3px, rgba(232, 163, 61, 0.25) 3px 6px); }
.legendNote { font-size: 12px; }

.foot { display: flex; justify-content: space-between; gap: 12px; padding: 12px 2px 24px; font-family: var(--c-font-mono); font-size: 11px; color: var(--c-dim); }

@media (max-width: 1100px) {
  .table { grid-template-columns: minmax(0, 1fr) 260px; }
}

@media (max-width: 767px) {
  .room { padding: 18px 16px 0; }
  .head { flex-direction: column; align-items: stretch; }
  .title { font-size: 26px; }
  .actions > * { flex: 1; }
  .table { grid-template-columns: 1fr; border: 0; }
  .timeline { padding: 0; overflow: visible; }
  .side, .ruler, .track, .footHint { display: none; }
  .day { grid-template-columns: 1fr; margin-top: 14px; }
  .dayLabel { margin-bottom: 4px; }
  .dayList { display: grid; list-style: none; margin: 0; padding: 0; }
  .dayList button {
    display: grid; grid-template-columns: 48px minmax(0, 1fr) auto; gap: 10px; align-items: center;
    width: 100%; min-height: 44px; padding: 0 4px; background: none; border: 0;
    border-top: 1px solid var(--c-line); color: var(--c-ink); text-align: left; cursor: pointer;
  }
  .dayList button[data-dim] { opacity: 0.35; }
  .listTitle { font-family: var(--c-font-serif); font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .listSeats { font-family: var(--c-font-mono); font-size: 11px; color: var(--c-dim); }
  .dayListEmpty { padding: 10px 4px; border-top: 1px solid var(--c-line); color: var(--c-dim); font-size: 13px; }
}
```

<!-- file: src/app/admin/(casa)/programma/page.tsx -->
```tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Tavolo from './_tavolo/Tavolo';
import { loadTavolo, type TavoloData } from './_tavolo/load';
import { parseQuery, wizardRedirect, type SearchParams } from './_tavolo/query';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Programma' };

export default async function ProgrammaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const toWizard = wizardRedirect(sp);
  if (toWizard) redirect(toWizard);

  let data: TavoloData | null = null;
  try {
    data = await loadTavolo(parseQuery(sp));
  } catch (err) {
    console.error('[TAVOLO] Lettura della sala fallita:', err);
  }

  if (!data) {
    return (
      <p style={{ maxWidth: 560, margin: '64px auto', padding: '0 16px', color: 'var(--c-dim)' }}>
        Non riesco a leggere la sala in questo momento. Riprova fra poco.
      </p>
    );
  }
  return <Tavolo data={data} />;
}
```

- [ ] **Ritocchi collegati:**
  - `Button.tsx`: un `href` esterno usa `<a target="_blank" rel="noopener noreferrer">`;
  - `rooms.ts`: `'pulizia'` e `'proiezioni vuote'` passano da `pannello` a `programma`;
  - `buildOggi.ts`: l'avviso `vuoti` va a `{ label: 'Vedi', href: '/admin/programma?vuote=1' }`.
- [ ] `npx vitest run && npx tsc --noEmit && eslint` sui file nuovi.
- [ ] **Commit** — `Il tavolo di montaggio: la settimana, i buchi, e ogni spettacolo a un clic`

---

### Task 9: Consegna

- [ ] Prova sul database vero, in sola lettura, di `loadTavolo` sulla settimana del 28 settembre: 33 spettacoli, buchi di martedì sera, venerdì pomeriggio e sabato pomeriggio, e domenica vuota.
- [ ] Lista per Giovanni:
  1. `/admin/programma` apre la settimana della sala preferita.
  2. Le frecce cambiano periodo, e il selettore mostra Giorno, Settimana, 2 settimane o Mese.
  3. Un clic su uno spettacolo apre il cassetto con posti e "Quote Pretix".
  4. "Sposta": scrivendo un orario, mentre scrivi arriva il responso della sala. "Sposta" lo scrive su Pretix, poi la timeline si aggiorna.
  5. Trascinare un blocco su un altro giorno o un'altra ora apre il cassetto con la destinazione già scritta.
  6. Elimina: su uno spettacolo vuoto basta una conferma, con biglietti venduti serve la spunta.
  7. "+ Aggiungi una replica" apre il wizard con film e sala scelti.
  8. "Solo vuote" spegne gli spettacoli con biglietti venduti.
  9. Il vecchio "Replica" del Pannello e `/admin/programmazione?tmdb=…` finiscono nel wizard.
  10. Sul telefono ci sono le liste per giorno, e il cassetto si apre come foglio dal basso.
