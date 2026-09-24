# Gestionale Cabina — Tappa 2: la stanza Oggi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **In questo progetto si esegue inline** (Giovanni non vuole agenti delegati).

**Goal:** `/admin` diventa la stanza **Oggi** del mockup approvato. Mostra:
- cosa c'è in sala adesso, con una barra che avanza;
- la giornata, spettacolo per spettacolo;
- tre numeri: spettacoli oggi, biglietti venduti oggi, spettacoli della settimana;
- "Da guardare", gli avvisi, ognuno con un'azione.

Il vecchio pannello trasloca in `/admin/pannello` finché le sue funzioni non hanno una stanza loro.

**Architecture:**
- **Oggi legge dal database** (`PretixSync` + `MovieOverride`, allineati a Pretix dal sync), con una sola query. Non interroga Pretix spettacolo per spettacolo come fanno cassa e display. Così la schermata d'apertura si apre subito.
- **Il calcolo è una funzione pura e testata**, `buildOggi(rows, now, openCommit)`: stato di ogni spettacolo, numeri, avvisi.
- **Il caricamento è un modulo server sottile**, `loadOggi`: query, conversione delle righe, lavori di conferma aperti.
- **La pagina è un Server Component `force-dynamic`.** Un piccolo componente client la rinfresca ogni minuto, così "adesso" non invecchia se lo schermo resta acceso.

**Tech Stack:** Next 16.2, Prisma 7, date-fns 4 + date-fns-tz (Europe/Rome), CSS Modules con le variabili Cabina, vitest.

**Spec:** `docs/superpowers/specs/2026-09-24-gestionale-cabina-design.md`, §2 "Oggi" e "Da guardare"

## Cosa cambia rispetto alla specifica, e perché

**"Buchi nella settimana" diventa "giorni senza spettacoli nei prossimi sei giorni".**
- Calcolare i buchi ora per ora richiede orari d'apertura, pause e durate, cioè il motore della programmazione. È il lavoro del tavolo nella tappa 3, dove i buchi si vedono tratteggiati.
- Qui basta sapere se un giorno è rimasto scoperto.

**"Film senza trailer" vuol dire "senza trailer salvato"** (`customTrailerKeys` o `customTrailerUrl`). La programmazione salva le chiavi al momento della conferma, quindi un film programmato senza chiavi è davvero scoperto.

**Nasce una stanza provvisoria, Pannello (`/admin/pannello`).**
- Ospita il vecchio `AdminPanel`, con Sale, Display, Catalogo, Recupero biglietti, lista Pretix e pulizia proiezioni vuote.
- Non sta sotto il pollice sul telefono, ma nel foglio "Altro".
- Sparisce nella tappa 7.

## Mappa dei file

| File | Azione | Responsabilità |
|---|---|---|
| `vitest.config.ts` | modifica | alias `@/` → `src/`, come in `tsconfig.json` |
| `src/app/admin/(casa)/_oggi/buildOggi.ts` | crea | tipi e calcolo puro di Oggi |
| `src/app/admin/(casa)/_oggi/buildOggi.test.ts` | crea | test del calcolo |
| `src/app/admin/(casa)/_oggi/loadOggi.ts` | crea | query Prisma + lavori aperti → `buildOggi` |
| `src/app/admin/(casa)/_oggi/Oggi.tsx` + `Oggi.module.css` | crea | la stanza (Server Component) |
| `src/app/admin/(casa)/_oggi/AutoRefresh.tsx` | crea | rinfresca ogni minuto, se la scheda è visibile |
| `src/app/admin/(casa)/_oggi/SyncSeatsButton.tsx` | crea | "Rileggi da Pretix" → `adminSyncSoldOutStatus` |
| `src/app/admin/(casa)/page.tsx` | riscrive | carica e mostra Oggi |
| `src/app/admin/(casa)/pannello/page.tsx` | crea | il vecchio pannello, spostato da `page.tsx` |
| `src/components/cabina/rooms.ts` + `rooms.test.ts` | modifica | stanza `pannello`, parole chiave spostate lì |
| `src/components/cabina/AdminShell.tsx` | modifica | "Altro" elenca le stanze che non stanno sotto il pollice |

La cartella `_oggi` comincia con il trattino basso perché, per convenzione di Next, le cartelle private non diventano rotte.

---

### Task 1: vitest capisce `@/`

**Files:**
- Modify: `vitest.config.ts`

- [ ] **Step 1: Aggiungi l'alias**

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Lo stesso alias di tsconfig.json: senza, un modulo testato non può
    // importare nulla con "@/" e i test sono costretti a percorsi relativi.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // Anche `scripts/`: la fusione dei film fra librerie Plex vive lì, gira sul
    // Mac del cinema in Node puro, e sbagliarla riempie il catalogo di doppioni.
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    environment: 'node',
  },
});
```

- [ ] **Step 2: Verifica che i test esistenti restino verdi**

Run: `npx vitest run`
Expected: 241 passed

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts
git commit -m "I test capiscono @/ come il resto del codice"
```

---

### Task 2: Il calcolo di Oggi

**Files:**
- Create: `src/app/admin/(casa)/_oggi/buildOggi.ts`
- Test: `src/app/admin/(casa)/_oggi/buildOggi.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// src/app/admin/(casa)/_oggi/buildOggi.test.ts
import { describe, it, expect } from 'vitest';
import { romeToMs } from '@/services/scheduling/rome';
import { addDaysISO } from '@/services/scheduling/times';
import { buildOggi, type OggiRow } from './buildOggi';

/** Lunedì 28 settembre 2026. */
const DAY = '2026-09-28';
const at = (date: string, hh: number, mm = 0) => romeToMs(date, hh * 60 + mm);

let nextId = 1;
function row(date: string, hh: number, mm: number, title: string, minutes: number, extra: Partial<OggiRow> = {}): OggiRow {
  const start = at(date, hh, mm);
  return {
    id: nextId++,
    title,
    start,
    end: start + minutes * 60_000,
    roomName: 'CA GRANDA',
    available: 2,
    total: 2,
    soldOut: false,
    lingua: 'Inglese',
    sottotitoli: 'Italiano',
    director: null,
    hasTrailer: true,
    ...extra,
  };
}

const giornata = () => [
  row(DAY, 8, 0, "It's Never Over, Jeff Buckley", 106),
  row(DAY, 10, 30, 'Il sale della terra', 110, { lingua: 'Francese', director: 'Wim Wenders' }),
  row(DAY, 13, 0, 'Mystery train', 110),
  row(DAY, 15, 30, 'I predatori', 109, { lingua: 'Italiano' }),
  row('2026-09-29', 10, 30, 'The Look of Silence', 103),
];

describe('buildOggi — la giornata', () => {
  it('mette in sala il film che sta andando, con quanto manca', () => {
    const d = buildOggi(giornata(), at(DAY, 10, 45), false);
    expect(d.current?.title).toBe('Il sale della terra');
    expect(d.current?.start).toBe('10:30');
    expect(d.current?.end).toBe('12:20');
    expect(d.current?.progress).toBeCloseTo(15 / 110, 3);
    expect(d.current?.director).toBe('Wim Wenders');
  });

  it('dà a ogni spettacolo di oggi il suo stato, e lascia fuori domani', () => {
    const d = buildOggi(giornata(), at(DAY, 10, 45), false);
    expect(d.day.map((s) => [s.start, s.state])).toEqual([
      ['08:00', 'finito'],
      ['10:30', 'in-sala'],
      ['13:00', 'dopo'],
      ['15:30', 'dopo'],
    ]);
  });

  it('fra uno spettacolo e l’altro non c’è niente in sala, ma c’è il prossimo', () => {
    const d = buildOggi(giornata(), at(DAY, 12, 40), false);
    expect(d.current).toBeNull();
    expect(d.next?.title).toBe('Mystery train');
    expect(d.next?.when).toBe('oggi');
  });

  it('a giornata finita il prossimo è domani', () => {
    const d = buildOggi(giornata(), at(DAY, 23, 0), false);
    expect(d.next?.title).toBe('The Look of Silence');
    expect(d.next?.when).toBe('domani');
  });

  it('dopo mezzanotte, la coda di ieri è ancora in sala', () => {
    const rows = [row('2026-09-27', 23, 30, 'Arancia meccanica', 136)];
    const d = buildOggi(rows, at(DAY, 0, 30), false);
    expect(d.current?.title).toBe('Arancia meccanica');
    expect(d.day).toEqual([]);
  });

  it('scrive la data in italiano, con la maiuscola, e le sale di oggi', () => {
    const d = buildOggi(giornata(), at(DAY, 10, 45), false);
    expect(d.dateLabel).toBe('Lunedì 28 settembre');
    expect(d.rooms).toEqual(['CA GRANDA']);
  });
});

describe('buildOggi — i numeri', () => {
  it('conta gli spettacoli di oggi e della settimana', () => {
    const d = buildOggi(giornata(), at(DAY, 10, 45), false);
    expect(d.stats.showsToday).toBe(4);
    expect(d.stats.showsWeek).toBe(5);
  });

  it('somma i venduti che si conoscono', () => {
    const rows = [row(DAY, 13, 0, 'A', 100, { available: 1, total: 2 }), row(DAY, 16, 0, 'B', 100, { available: 0, total: 2 })];
    expect(buildOggi(rows, at(DAY, 9, 0), false).stats.soldToday).toBe(3);
  });

  it('se nessun posto è stato letto, i venduti sono sconosciuti, non zero', () => {
    const rows = [row(DAY, 13, 0, 'A', 100, { available: null, total: null })];
    expect(buildOggi(rows, at(DAY, 9, 0), false).stats.soldToday).toBeNull();
  });
});

describe('buildOggi — da guardare', () => {
  const ids = (d: ReturnType<typeof buildOggi>) => d.alerts.map((a) => a.id);

  it('una settimana in ordine non ha avvisi', () => {
    const rows = [0, 1, 2, 3, 4, 5, 6].map((i) => row(addDaysISO(DAY, i), 18, 0, 'Film', 100, { available: 1, total: 2 }));
    expect(buildOggi(rows, at(DAY, 9, 0), false).alerts).toEqual([]);
  });

  it('segnala i posti non letti da Pretix, con l’azione per rileggerli', () => {
    const rows = [row('2026-09-29', 17, 0, 'Arancia meccanica', 136, { available: null, total: null })];
    const a = buildOggi(rows, at(DAY, 9, 0), false).alerts.find((x) => x.id === 'posti');
    expect(a?.tone).toBe('alarm');
    expect(a?.text).toBe('1 spettacolo senza posti letti da Pretix, il primo domani alle 17:00.');
    expect(a?.action?.kind).toBe('sync-posti');
  });

  it('segnala gli spettacoli delle prossime 24 ore senza biglietti', () => {
    const rows = [row(DAY, 13, 0, 'Mystery train', 110, { available: 2, total: 2 })];
    const a = buildOggi(rows, at(DAY, 9, 0), false).alerts.find((x) => x.id === 'vuoti');
    expect(a?.text).toBe('1 spettacolo nelle prossime 24 ore senza biglietti venduti: Mystery train, oggi alle 13:00.');
  });

  it('segnala i film senza lingua e senza trailer salvato, una volta per film', () => {
    const rows = [
      row(DAY, 13, 0, 'Duel', 90, { lingua: null, hasTrailer: false, available: 1 }),
      row('2026-09-29', 13, 0, 'Duel', 90, { lingua: null, hasTrailer: false, available: 1 }),
    ];
    const d = buildOggi(rows, at(DAY, 9, 0), false);
    expect(d.alerts.find((x) => x.id === 'lingua')?.text).toBe('Un film senza lingua: Duel.');
    expect(d.alerts.find((x) => x.id === 'trailer')?.text).toBe('Un film senza trailer salvato: Duel.');
  });

  it('segnala i giorni scoperti nei prossimi sei', () => {
    const rows = [row(DAY, 18, 0, 'Film', 100, { available: 1 })];
    const a = buildOggi(rows, at(DAY, 9, 0), false).alerts.find((x) => x.id === 'giorni');
    expect(a?.text).toBe('Nessuno spettacolo domani, mercoledì 30, giovedì 1, venerdì 2, sabato 3 e domenica 4.');
    expect(a?.action?.href).toBe('/admin/programma');
  });

  it('mette per prima la conferma rimasta a metà', () => {
    const rows = [row('2026-09-29', 17, 0, 'X', 100, { available: null, total: null })];
    const d = buildOggi(rows, at(DAY, 9, 0), true);
    expect(ids(d)[0]).toBe('conferma');
    expect(d.alerts[0].tone).toBe('alarm');
  });
});
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

Run: `npx vitest run "src/app/admin/(casa)/_oggi"`
Expected: FAIL, "Failed to resolve import './buildOggi'"

- [ ] **Step 3: Scrivi `buildOggi.ts`**

```ts
// src/app/admin/(casa)/_oggi/buildOggi.ts
import { formatInTimeZone } from 'date-fns-tz';
import { it as itLocale } from 'date-fns/locale';
import { TIMEZONE, romeClock, romeDate } from '@/services/scheduling/rome';
import { addDaysISO } from '@/services/scheduling/times';

/** Uno spettacolo come arriva dal database, già tradotto in istanti. */
export interface OggiRow {
  id: number;
  title: string;
  /** Istanti in millisecondi. */
  start: number;
  end: number;
  roomName: string | null;
  available: number | null;
  total: number | null;
  soldOut: boolean;
  lingua: string | null;
  sottotitoli: string | null;
  director: string | null;
  hasTrailer: boolean;
}

export type ShowState = 'finito' | 'in-sala' | 'dopo';

export interface OggiShow {
  id: number;
  title: string;
  start: string;
  end: string;
  /** 'oggi', 'domani' o 'martedì 29'. */
  when: string;
  state: ShowState;
  /** Da 0 a 1, solo per lo spettacolo in sala. */
  progress: number;
  room: string | null;
  lingua: string | null;
  sottotitoli: string | null;
  director: string | null;
  sold: number | null;
  total: number | null;
  soldOut: boolean;
}

export interface OggiAlert {
  id: 'conferma' | 'posti' | 'vuoti' | 'lingua' | 'trailer' | 'giorni';
  tone: 'alarm' | 'info';
  text: string;
  action?: { label: string; href?: string; kind?: 'sync-posti' };
}

export interface OggiData {
  dateLabel: string;
  rooms: string[];
  current: OggiShow | null;
  next: OggiShow | null;
  day: OggiShow[];
  stats: { showsToday: number; soldToday: number | null; showsWeek: number };
  alerts: OggiAlert[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function relativeDay(ms: number, today: string): string {
  const date = romeDate(ms);
  if (date === today) return 'oggi';
  if (date === addDaysISO(today, 1)) return 'domani';
  return formatInTimeZone(ms, TIMEZONE, 'EEEE d', { locale: itLocale });
}

function soldOf(r: OggiRow): number | null {
  return r.total !== null && r.available !== null ? Math.max(0, r.total - r.available) : null;
}

function spettacoli(n: number): string {
  return n === 1 ? '1 spettacolo' : `${n} spettacoli`;
}

/** "A", "A e B", "A, B e C". */
function listIt(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

function filmList(titles: string[]): string {
  const shown = titles.slice(0, 3).join(', ');
  return titles.length > 3 ? `${shown} e altri ${titles.length - 3}` : shown;
}

function toShow(r: OggiRow, nowMs: number, today: string): OggiShow {
  const state: ShowState = r.end <= nowMs ? 'finito' : r.start <= nowMs ? 'in-sala' : 'dopo';
  return {
    id: r.id,
    title: r.title,
    start: romeClock(r.start),
    end: romeClock(r.end),
    when: relativeDay(r.start, today),
    state,
    progress: state === 'in-sala' ? (nowMs - r.start) / (r.end - r.start) : state === 'finito' ? 1 : 0,
    room: r.roomName,
    lingua: r.lingua,
    sottotitoli: r.sottotitoli,
    director: r.director,
    sold: soldOf(r),
    total: r.total,
    soldOut: r.soldOut,
  };
}

function buildAlerts(rows: OggiRow[], nowMs: number, today: string, openCommit: boolean): OggiAlert[] {
  const alerts: OggiAlert[] = [];
  const future = rows.filter((r) => r.start > nowMs);
  const when = (r: OggiRow) => `${relativeDay(r.start, today)} alle ${romeClock(r.start)}`;

  if (openCommit) {
    alerts.push({
      id: 'conferma',
      tone: 'alarm',
      text: 'Una conferma della programmazione è rimasta a metà.',
      action: { label: 'Riprendi', href: '/admin/programma' },
    });
  }

  const unread = future.filter((r) => r.available === null || r.total === null);
  if (unread.length > 0) {
    alerts.push({
      id: 'posti',
      tone: 'alarm',
      text: `${spettacoli(unread.length)} senza posti letti da Pretix, il primo ${when(unread[0])}.`,
      action: { label: 'Rileggi da Pretix', kind: 'sync-posti' },
    });
  }

  const empty = future.filter((r) => r.start <= nowMs + DAY_MS && soldOf(r) === 0);
  if (empty.length > 0) {
    alerts.push({
      id: 'vuoti',
      tone: 'info',
      text: `${spettacoli(empty.length)} nelle prossime 24 ore senza biglietti venduti: ${empty[0].title}, ${when(empty[0])}.`,
      action: { label: 'Vedi', href: '/admin/pannello' },
    });
  }

  const uniqueTitles = (list: OggiRow[]) => [...new Set(list.map((r) => r.title))];
  const noLanguage = uniqueTitles(future.filter((r) => !r.lingua));
  if (noLanguage.length > 0) {
    alerts.push({
      id: 'lingua',
      tone: 'info',
      text: `${noLanguage.length === 1 ? 'Un film' : `${noLanguage.length} film`} senza lingua: ${filmList(noLanguage)}.`,
      action: { label: 'Sistema', href: '/admin/film' },
    });
  }

  const noTrailer = uniqueTitles(future.filter((r) => !r.hasTrailer));
  if (noTrailer.length > 0) {
    alerts.push({
      id: 'trailer',
      tone: 'info',
      text: `${noTrailer.length === 1 ? 'Un film' : `${noTrailer.length} film`} senza trailer salvato: ${filmList(noTrailer)}.`,
      action: { label: 'Sistema', href: '/admin/film' },
    });
  }

  const busyDays = new Set(rows.map((r) => romeDate(r.start)));
  const emptyDays = [1, 2, 3, 4, 5, 6].map((i) => addDaysISO(today, i)).filter((d) => !busyDays.has(d));
  if (emptyDays.length > 0) {
    const labels = emptyDays.map((d) => relativeDay(new Date(`${d}T12:00:00Z`).getTime(), today));
    alerts.push({
      id: 'giorni',
      tone: 'info',
      text: `Nessuno spettacolo ${listIt(labels)}.`,
      action: { label: 'Programma', href: '/admin/programma' },
    });
  }

  return alerts;
}

export function buildOggi(rows: OggiRow[], nowMs: number, openCommit: boolean): OggiData {
  const today = romeDate(nowMs);
  const sorted = [...rows].sort((a, b) => a.start - b.start);
  const todayRows = sorted.filter((r) => romeDate(r.start) === today);
  const weekEnd = addDaysISO(today, 6);

  const currentRow = sorted.find((r) => r.start <= nowMs && nowMs < r.end) ?? null;
  const nextRow = sorted.find((r) => r.start > nowMs) ?? null;

  const knownSold = todayRows.map(soldOf).filter((n): n is number => n !== null);

  return {
    dateLabel: capitalize(formatInTimeZone(nowMs, TIMEZONE, 'EEEE d MMMM', { locale: itLocale })),
    rooms: [...new Set(todayRows.map((r) => r.roomName).filter((n): n is string => Boolean(n)))],
    current: currentRow ? toShow(currentRow, nowMs, today) : null,
    next: nextRow ? toShow(nextRow, nowMs, today) : null,
    day: todayRows.map((r) => toShow(r, nowMs, today)),
    stats: {
      showsToday: todayRows.length,
      soldToday: knownSold.length > 0 ? knownSold.reduce((a, b) => a + b, 0) : null,
      showsWeek: sorted.filter((r) => {
        const d = romeDate(r.start);
        return d >= today && d <= weekEnd;
      }).length,
    },
    alerts: buildAlerts(sorted, nowMs, today, openCommit),
  };
}
```

`relativeDay` sui giorni vuoti usa mezzogiorno UTC di quella data. In ora di Roma è sempre lo stesso giorno (le 13 o le 14), quindi l'etichetta non scivola mai sul giorno accanto.

- [ ] **Step 4: Lancia il test e verifica che passi**

Run: `npx vitest run "src/app/admin/(casa)/_oggi"`
Expected: PASS (15 test)

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/(casa)/_oggi/buildOggi.ts" "src/app/admin/(casa)/_oggi/buildOggi.test.ts"
git commit -m "Oggi sa cosa c'è in sala, cosa viene dopo e cosa va guardato"
```

---

### Task 3: Il caricamento dal database

**Files:**
- Create: `src/app/admin/(casa)/_oggi/loadOggi.ts`

- [ ] **Step 1: Scrivi `loadOggi.ts`**

```ts
// src/app/admin/(casa)/_oggi/loadOggi.ts
import prisma from '@/lib/prisma';
import { findOpenJob } from '@/services/scheduling/commitJobs';
import { romeDate, romeToMs } from '@/services/scheduling/rome';
import { addDaysISO } from '@/services/scheduling/times';
import { buildOggi, type OggiData, type OggiRow } from './buildOggi';

/** Quanto indietro guardare per trovare la coda notturna di ieri ancora in sala. */
const NIGHT_TAIL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_RUNTIME_MIN = 120;

/**
 * Oggi legge dal database, non da Pretix: una query sola invece di una
 * chiamata per spettacolo. I posti sono quelli che il sync ha scritto; quando
 * mancano, "Da guardare" lo dice e offre di rileggerli.
 */
export async function loadOggi(nowMs: number): Promise<OggiData> {
  const today = romeDate(nowMs);
  const from = new Date(romeToMs(today, 0) - NIGHT_TAIL_MS);
  const to = new Date(romeToMs(addDaysISO(today, 7), 0));

  const rows = await prisma.pretixSync.findMany({
    where: { active: true, isHidden: false, dateFrom: { gte: from, lt: to } },
    orderBy: { dateFrom: 'asc' },
    include: {
      movie: {
        select: {
          customTitle: true,
          customDirector: true,
          runtime: true,
          versionLanguage: true,
          subtitles: true,
          customTrailerUrl: true,
          customTrailerKeys: true,
        },
      },
    },
  });

  const plans = [...new Set(rows.map((r) => r.seatingPlanId).filter((id): id is number => id !== null))];
  const openCommit = (await Promise.all(plans.map(findOpenJob))).some(Boolean);

  const mapped: OggiRow[] = rows.map((r) => {
    const start = r.dateFrom.getTime();
    const runtime = r.movie?.runtime ?? DEFAULT_RUNTIME_MIN;
    return {
      id: r.pretixId,
      title: r.movie?.customTitle || r.name,
      start,
      end: r.dateTo ? r.dateTo.getTime() : start + runtime * 60_000,
      roomName: r.roomName,
      available: r.availableSeats,
      total: r.totalSeats,
      soldOut: r.isSoldOut,
      lingua: r.metaLingua ?? r.movie?.versionLanguage ?? null,
      sottotitoli: r.metaSottotitoli ?? r.movie?.subtitles ?? null,
      director: r.movie?.customDirector ?? null,
      hasTrailer: Boolean(r.movie?.customTrailerUrl) || (r.movie?.customTrailerKeys.length ?? 0) > 0,
    };
  });

  return buildOggi(mapped, nowMs, openCommit);
}
```

- [ ] **Step 2: Controlla i tipi**

Run: `npx tsc --noEmit`
Expected: nessun output

- [ ] **Step 3: Commit**

```bash
git add "src/app/admin/(casa)/_oggi/loadOggi.ts"
git commit -m "Oggi legge la settimana dal database con una query sola"
```

---

### Task 4: Il vecchio pannello trasloca in `/admin/pannello`

**Files:**
- Move: `src/app/admin/(casa)/page.tsx` → `src/app/admin/(casa)/pannello/page.tsx`
- Modify: `src/components/cabina/rooms.ts`, `src/components/cabina/rooms.test.ts`
- Modify: `src/components/cabina/AdminShell.tsx`

- [ ] **Step 1: Aggiungi il caso al test delle stanze**

In `rooms.test.ts`, dentro `riconosce ogni stanza e le sue sottopagine`:

```ts
    expect(activeRoom('/admin/pannello')).toBe('pannello');
```

e in fondo al file:

```ts
describe('stanze provvisorie', () => {
  it('il pannello non sta sotto il pollice, ma nel foglio "Altro"', () => {
    expect(ROOMS.find((r) => r.key === 'pannello')?.mobile).toBe(false);
  });
});
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

Run: `npx vitest run src/components/cabina/rooms.test.ts`
Expected: FAIL, `expected null to be 'pannello'`

- [ ] **Step 3: Aggiungi la stanza**

In `rooms.ts`:
- il tipo diventa `export type RoomKey = 'oggi' | 'programma' | 'film' | 'cassa' | 'pannello';`;
- le parole chiave di `oggi` diventano `['home', 'oggi', 'adesso', 'in sala', 'avvisi']`;
- in fondo a `ROOMS` si aggiunge:

```ts
  {
    // Provvisoria: il vecchio pannello, finché Sale, Display, Catalogo e
    // Recupero biglietti non hanno una stanza loro (tappe 4, 5 e 6).
    key: 'pannello',
    label: 'Pannello',
    href: '/admin/pannello',
    mobile: false,
    keywords: ['sale', 'display', 'preroll', 'catalogo', 'recupero biglietti', 'pretix', 'pulizia', 'proiezioni vuote'],
  },
```

Aggiorna anche il commento in testa al file: le funzioni in attesa di stanza ora vivono in "Pannello", non in "Oggi".

- [ ] **Step 4: Il guscio impara la nuova stanza**

In `AdminShell.tsx`:
- in `ICONS` aggiungi `pannello: LayoutGrid` (con `LayoutGrid` fra gli import di lucide-react);
- nel foglio "Altro", prima di "Cerca o vai a…", elenca le stanze che non stanno sotto il pollice:

```tsx
          {ROOMS.filter((r) => !r.mobile).map((room) => {
            const Icon = ICONS[room.key];
            return (
              <Link key={room.key} href={room.href} className={styles.moreItem} onClick={() => setMoreOpen(false)}>
                <Icon size={18} /> {room.label}
              </Link>
            );
          })}
```

- [ ] **Step 5: Sposta la pagina**

```bash
mkdir -p "src/app/admin/(casa)/pannello"
git mv "src/app/admin/(casa)/page.tsx" "src/app/admin/(casa)/pannello/page.tsx"
```

Nel file spostato, il commento in testa diventa:

```tsx
/**
 * Il vecchio pannello, in attesa di trasloco.
 *
 * Contiene ancora Sale, Display, Catalogo, Recupero biglietti, la lista di
 * Pretix e la pulizia delle proiezioni vuote. Ognuna di queste cose si sposta
 * nella sua stanza nelle prossime tappe; quando l'ultima se ne va, se ne va
 * anche questa pagina.
 */
```

e il nome della funzione diventa `PannelloProvvisorio`.

- [ ] **Step 6: Test e tipi**

Run: `npx vitest run && npx tsc --noEmit`
Expected: test PASS, `tsc` senza output. `/admin` resta senza pagina fino al Task 6, ma questo non è un errore di tipi.

- [ ] **Step 7: Commit**

```bash
git add -A "src/app/admin/(casa)" src/components/cabina/rooms.ts src/components/cabina/rooms.test.ts src/components/cabina/AdminShell.tsx
git commit -m "Il vecchio pannello trasloca in una stanza provvisoria"
```

Questo commit lascia `/admin` senza pagina per un solo commit. Il Task 6 la rimette; non si pubblica fra i due.

---

### Task 5: I due pezzi vivi di Oggi

**Files:**
- Create: `src/app/admin/(casa)/_oggi/AutoRefresh.tsx`
- Create: `src/app/admin/(casa)/_oggi/SyncSeatsButton.tsx`

- [ ] **Step 1: Scrivi `AutoRefresh`**

```tsx
// src/app/admin/(casa)/_oggi/AutoRefresh.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * "Adesso" invecchia: se lo schermo resta acceso, ogni minuto si rilegge la
 * stanza dal server. Solo con la scheda visibile, per non lavorare a vuoto.
 */
export default function AutoRefresh({ everyMs = 60_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, everyMs);
    return () => window.clearInterval(id);
  }, [router, everyMs]);
  return null;
}
```

- [ ] **Step 2: Scrivi `SyncSeatsButton`**

```tsx
// src/app/admin/(casa)/_oggi/SyncSeatsButton.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminSyncSoldOutStatus } from '@/actions/adminActions';
import Button from '@/components/cabina/Button';
import { useToast } from '@/components/cabina/Toast';

export default function SyncSeatsButton({ label }: { label: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const res = await adminSyncSoldOutStatus();
      toast(`Posti riletti da Pretix: ${res.count} spettacoli aggiornati.`, 'ok');
      router.refresh();
    } catch {
      toast('Pretix non ha risposto. Riprova fra poco.', 'alarm');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" onClick={run} disabled={busy}>
      {busy ? 'Rileggo…' : label}
    </Button>
  );
}
```

- [ ] **Step 3: Controlla i tipi**

Run: `npx tsc --noEmit`
Expected: nessun output

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/(casa)/_oggi/AutoRefresh.tsx" "src/app/admin/(casa)/_oggi/SyncSeatsButton.tsx"
git commit -m "Oggi si rinfresca da solo, e i posti si rileggono con un bottone"
```

---

### Task 6: La stanza Oggi

**Files:**
- Create: `src/app/admin/(casa)/_oggi/Oggi.tsx`, `src/app/admin/(casa)/_oggi/Oggi.module.css`
- Create: `src/app/admin/(casa)/page.tsx`

- [ ] **Step 1: Scrivi `Oggi.tsx`**

```tsx
// src/app/admin/(casa)/_oggi/Oggi.tsx
import Button from '@/components/cabina/Button';
import AutoRefresh from './AutoRefresh';
import SyncSeatsButton from './SyncSeatsButton';
import type { OggiData, OggiShow } from './buildOggi';
import styles from './Oggi.module.css';

function language(s: OggiShow): string {
  if (!s.lingua) return 'Lingua da indicare';
  return s.sottotitoli ? `${s.lingua}, sott. ${s.sottotitoli}` : s.lingua;
}

function seats(s: OggiShow): string {
  if (s.soldOut) return 'tutto esaurito';
  if (s.sold === null || s.total === null) return 'posti da leggere';
  return `${s.sold}/${s.total} venduti`;
}

const STATE_LABEL = { finito: 'finito', 'in-sala': 'in sala', dopo: 'dopo' } as const;

function NowCard({ data }: { data: OggiData }) {
  const s = data.current;
  if (s) {
    return (
      <section className={styles.now} aria-label="In sala adesso">
        <p className={styles.nowLabel}>
          <span className={styles.dot} aria-hidden /> In sala adesso · {s.start} – {s.end}
        </p>
        <h2 className={styles.nowTitle}>{s.title}</h2>
        <p className={styles.nowMeta}>{[s.director, language(s)].filter(Boolean).join(' · ')}</p>
        <div
          className={styles.bar}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(s.progress * 100)}
          aria-label="Avanzamento del film"
        >
          <span style={{ width: `${Math.round(s.progress * 100)}%` }} />
        </div>
      </section>
    );
  }
  const n = data.next;
  return (
    <section className={`${styles.now} ${styles.nowIdle}`} aria-label="In sala adesso">
      <p className={styles.nowLabel}>Sala ferma</p>
      {n ? (
        <>
          <h2 className={styles.nowTitle}>{n.title}</h2>
          <p className={styles.nowMeta}>
            Il prossimo, {n.when} alle {n.start} · {language(n)}
          </p>
        </>
      ) : (
        <h2 className={styles.nowTitle}>Niente in programma</h2>
      )}
    </section>
  );
}

export default function Oggi({ data }: { data: OggiData }) {
  const soldToday = data.stats.soldToday;
  return (
    <div className={styles.room}>
      <AutoRefresh />
      <header className={styles.head}>
        <div>
          <p className={styles.kicker}>
            {data.dateLabel}
            {data.rooms.length > 0 && ` · ${data.rooms.join(' · ')}`}
          </p>
          <h1 className={styles.title}>Oggi in sala</h1>
        </div>
        <div className={styles.headActions}>
          <Button href="/admin/cassa">Apri cassa</Button>
          <Button href="/admin/programma" variant="fill">+ Programma</Button>
        </div>
      </header>

      <div className={styles.grid}>
        <div className={styles.main}>
          <NowCard data={data} />

          <section aria-label="La giornata">
            <h3 className={styles.section}>La giornata</h3>
            {data.day.length === 0 ? (
              <p className={styles.empty}>Oggi non ci sono spettacoli.</p>
            ) : (
              <ol className={styles.list}>
                {data.day.map((s) => (
                  <li key={s.id} className={styles.row} data-state={s.state}>
                    <span className={styles.time}>{s.start}</span>
                    <span className={styles.rowMain}>
                      <span className={styles.rowTitle}>{s.title}</span>
                      <span className={styles.rowMeta}>{language(s)}</span>
                    </span>
                    <span className={styles.rowSide}>
                      <span className={styles.seats}>{seats(s)}</span>
                      <span className={styles.pill}>{STATE_LABEL[s.state]}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className={styles.side}>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Spettacoli</span>
              <b>{data.stats.showsToday}</b>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Venduti</span>
              <b title={soldToday === null ? 'I posti di oggi non sono ancora stati letti da Pretix' : undefined}>
                {soldToday ?? '—'}
              </b>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Settimana</span>
              <b>{data.stats.showsWeek}</b>
            </div>
          </div>

          <section aria-label="Da guardare">
            <h3 className={styles.section}>Da guardare</h3>
            {data.alerts.length === 0 ? (
              <p className={styles.calm}>Tutto in ordine.</p>
            ) : (
              <ul className={styles.alerts}>
                {data.alerts.map((a) => (
                  <li key={a.id} className={styles.alert} data-tone={a.tone}>
                    <p>{a.text}</p>
                    {a.action?.kind === 'sync-posti' && <SyncSeatsButton label={a.action.label} />}
                    {a.action?.href && (
                      <Button href={a.action.href} variant="ghost">
                        {a.action.label}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Scrivi `Oggi.module.css`**

```css
/* src/app/admin/(casa)/_oggi/Oggi.module.css */
.room { max-width: 1180px; margin: 0 auto; padding: 28px 24px 48px; }

.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 24px; }
.kicker, .section, .statLabel, .nowLabel {
  margin: 0;
  font-family: var(--c-font-mono);
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--c-dim);
}
.title { margin: 6px 0 0; font-family: var(--c-font-serif); font-weight: 600; font-size: 34px; line-height: 1; }
.headActions { display: flex; gap: 8px; }

.grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 28px; align-items: start; }
.main, .side { display: grid; gap: 24px; min-width: 0; }
.section { margin-bottom: 8px; }

/* In sala adesso */
.now {
  padding: 18px 20px;
  border: 1px solid var(--c-line);
  border-radius: var(--c-radius-lg);
  background: linear-gradient(135deg, var(--c-amber-soft), transparent 62%);
}
.nowIdle { background: var(--c-bg-raised); }
.nowLabel { display: flex; align-items: center; gap: 8px; color: var(--c-amber); }
.nowIdle .nowLabel { color: var(--c-dim); }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--c-amber); box-shadow: 0 0 0 4px var(--c-amber-soft); animation: pulse 2.4s ease-in-out infinite; }
.nowTitle { margin: 10px 0 6px; font-family: var(--c-font-serif); font-weight: 600; font-size: 28px; line-height: 1.1; }
.nowMeta { margin: 0; color: var(--c-dim); }
.bar { height: 3px; margin-top: 16px; border-radius: 2px; background: var(--c-line); overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--c-amber); transition: width var(--c-slow); }

/* La giornata */
.list { list-style: none; margin: 0; padding: 0; }
.row {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 11px 0;
  border-top: 1px solid var(--c-line);
}
.row[data-state='finito'] { opacity: 0.45; }
.row[data-state='in-sala'] {
  margin: 0 -12px;
  padding: 11px 12px;
  border-radius: var(--c-radius);
  background: var(--c-amber-soft);
  border-top-color: transparent;
}
.time { font-family: var(--c-font-mono); font-size: 15px; color: var(--c-amber); }
.rowMain { display: grid; min-width: 0; }
.rowTitle { font-family: var(--c-font-serif); font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rowMeta { font-size: 12px; color: var(--c-dim); }
.rowSide { display: flex; align-items: center; gap: 10px; }
.seats { font-family: var(--c-font-mono); font-size: 11px; color: var(--c-dim); white-space: nowrap; }
.pill {
  font-family: var(--c-font-mono);
  font-size: 9.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 99px;
  border: 1px solid var(--c-line-strong);
  color: var(--c-dim);
}
.row[data-state='in-sala'] .pill { border-color: var(--c-amber); color: var(--c-amber); }
.empty, .calm { margin: 0; color: var(--c-dim); }

/* I numeri */
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.stat { padding: 12px 14px; border: 1px solid var(--c-line); border-radius: var(--c-radius-lg); }
.stat b { display: block; margin-top: 6px; font-family: var(--c-font-mono); font-size: 26px; font-weight: 600; }

/* Da guardare */
.alerts { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.alert {
  display: grid;
  gap: 10px;
  justify-items: start;
  padding: 12px 14px;
  border-left: 2px solid var(--c-amber);
  border-radius: 0 var(--c-radius) var(--c-radius) 0;
  background: var(--c-amber-soft);
}
.alert[data-tone='alarm'] { border-left-color: var(--c-alarm); background: var(--c-alarm-soft); }
.alert p { margin: 0; }

@keyframes pulse { 50% { box-shadow: 0 0 0 7px transparent; } }

@media (max-width: 900px) {
  .grid { grid-template-columns: 1fr; }
  .side { order: -1; }
}

@media (max-width: 767px) {
  .room { padding: 20px 16px 32px; }
  .head { flex-direction: column; align-items: stretch; }
  .headActions > * { flex: 1; }
  .title { font-size: 28px; }
  .nowTitle { font-size: 23px; }
  .row { grid-template-columns: 48px minmax(0, 1fr); }
  .rowSide { grid-column: 2; }
}
```

Sul telefono, e sotto i 900 px, i numeri e gli avvisi salgono sopra la giornata: è la prima cosa da vedere aprendo il gestionale in piedi.

- [ ] **Step 3: Scrivi la pagina**

```tsx
// src/app/admin/(casa)/page.tsx
import type { Metadata } from 'next';
import Oggi from './_oggi/Oggi';
import { loadOggi } from './_oggi/loadOggi';
import type { OggiData } from './_oggi/buildOggi';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Oggi' };

export default async function OggiPage() {
  let data: OggiData | null = null;
  try {
    data = await loadOggi(Date.now());
  } catch (err) {
    console.error('[OGGI] Lettura del database fallita:', err);
  }

  if (!data) {
    return (
      <p style={{ maxWidth: 560, margin: '64px auto', padding: '0 16px', color: 'var(--c-dim)' }}>
        Non riesco a leggere il database in questo momento. Le altre stanze funzionano; riprova fra poco.
      </p>
    );
  }
  return <Oggi data={data} />;
}
```

- [ ] **Step 4: Test, tipi, lint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint "src/app/admin/(casa)" src/components/cabina`
Expected: test PASS (241 + 16 = 257), `tsc` senza output, `eslint` senza errori nei file nuovi. Gli avvisi dei file spostati (programma, film, cassa, pannello) sono preesistenti e non si toccano.

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/(casa)/_oggi/Oggi.tsx" "src/app/admin/(casa)/_oggi/Oggi.module.css" "src/app/admin/(casa)/page.tsx"
git commit -m "La stanza Oggi: cosa c'è in sala, la giornata, i numeri, cosa guardare"
```

---

### Task 7: Consegna

- [ ] **Step 1:** `grep -rn "admin/pannello" src` elenca i link a Pannello: `rooms.ts` e l'avviso "vuoti" in `buildOggi.ts`. La tappa 3 li sposta su Programma.
- [ ] **Step 2: Lista per Giovanni**
  1. `/admin` apre Oggi, con data, sale, "Oggi in sala", Apri cassa e + Programma.
  2. Durante uno spettacolo, "In sala adesso" ha titolo, orari e barra. Fra uno spettacolo e l'altro compare "Sala ferma" con il prossimo.
  3. La giornata mostra gli spettacoli finiti sbiaditi, quello in sala evidenziato e i posti venduti oppure "posti da leggere".
  4. I tre numeri. "Venduti" è "—" se i posti di oggi non sono ancora stati letti.
  5. "Da guardare":
     - "Rileggi da Pretix" mostra "Rileggo…", poi l'avviso e la pagina aggiornata;
     - i link portano a Film, Programma e Pannello.
  6. Lasciando la pagina aperta, dopo un minuto la barra avanza da sola.
  7. Pannello (nella barra in alto, e sul telefono in "Altro") contiene il vecchio pannello con tutte le sue funzioni.
  8. Sul telefono, numeri e avvisi stanno sopra la giornata e i bottoni in alto prendono tutta la larghezza.
