# Gestionale Cabina — Tappa 3b-1: programmare a mano sul tavolo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **In questo progetto si esegue inline** (Giovanni non vuole agenti delegati).

**Goal:** sul tavolo si programma senza wizard.
- Il cassetto a destra diventa il **catalogo**: ricerca, filtri, corsie e TMDB.
- Un film **trascinato** su un giorno va in bozza all'orario elegante più vicino. Un film **cliccato** accende i posti dove ci sta.
- I blocchi in bozza hanno il loro pannello: orario a mano (con eventuale sostituzione), specifiche di proiezione, scambia, togli.
- La bozza si salva da sola.
- **"Manda in sala"** crea gli spettacoli su Pretix a lotti, e se si interrompe riprende da dove era.

**Architecture:**
- **La bozza è un modulo puro e testato** (`draft.ts`). Ogni spettacolo in bozza vive per **giorno di programmazione e orario**. I minuti globali che il motore vuole si ricavano al momento con `rebase(show, origine)`. Così la bozza sopravvive a qualunque cambio di periodo sul tavolo.
- **Sul server la bozza si salva nella stessa forma del wizard.** Una bozza cominciata lì si riprende qui, e viceversa.
- **Due hook client:** `useDraft` (caricamento e salvataggio automatico) e `useCommit` (creazione a lotti, avanzamento, ripresa).
- **Le azioni del server sono tutte quelle che esistono già:** `planningSnapShow`, `planningFindSlots`, `planningCheckManualSlot`, `planningAlternatives`, `planningCommit*`, `planningSave/Load/DropDraft`, `catalogGetRails`, `catalogList`, `catalogGetFacets`, `catalogSearchTmdb`, `catalogPreviewTmdb`, `catalogAddByTmdbId`.

**Tech Stack:** Next 16.2, React 19, CSS Modules Cabina, drag and drop HTML5, vitest.

**Spec:** §3 della specifica del gestionale. 3b divisa in 3b-1 e 3b-2, approvata da Giovanni il 24 settembre.

## Regole che il tavolo eredita dal wizard, e non tradisce

- **Un film preso da TMDB non si scrive in catalogo**, a meno che tu non lo spunti. Il `?tmdb=` del wizard usa `catalogEnsureByTmdbId`, che scrive di nascosto. Il tavolo non lo usa: "Replica" legge il film con `catalogPreviewTmdb`, che non scrive niente.
- **Gli spettacoli messi a mano sono bloccati.** Il ricalcolo della 3b-2 non li sposterà.
- **Sostituire uno spettacolo in sala richiede il consenso** se ci sono biglietti venduti. La sostituzione viaggia con la chiave dello spettacolo: se poi lo sposti, si perde, come nel wizard.
- **Le specifiche di proiezione stanno sul film** e valgono per tutti i suoi spettacoli in bozza. Il 4K parte spuntato se la copia è in 4K.
- **Dopo la conferma** esce dalla bozza solo ciò che il tavolo ha mandato ed è stato creato. Una conferma ripresa da un altro computer non tocca la bozza.
- **Il wizard resta raggiungibile** (bottone "Wizard") fino alla fine della 3b-2.

## Mappa dei file (in `src/app/admin/(casa)/programma/_tavolo/`)

| File | Azione | Responsabilità |
|---|---|---|
| `draft.ts` + test | crea | la bozza: minuti, aggiunte, spostamenti, scambi, specifiche, scontri, carico della conferma, salvataggio compatibile |
| `useDraft.ts` | crea | carica la bozza della sala, la salva un secondo dopo ogni modifica |
| `useCommit.ts` | crea | crea, fa avanzare, riprova, riprende |
| `CatalogDrawer.tsx` + `.module.css` | crea | il catalogo nel cassetto |
| `TmdbDialog.tsx` | crea | la ricerca su TMDB, che non scrive salvo spunta |
| `DraftPanel.tsx` | crea | il pannello di uno spettacolo in bozza |
| `SwapDialog.tsx` | crea | scambia il film, di uno o di tutti gli spettacoli |
| `CommitBar.tsx` + `.module.css` | crea | la barra della bozza, la conferma, l'avanzamento, la ripresa |
| `BlockPanel.tsx` | modifica | "Replica" accende i posti del film sul tavolo |
| `Tavolo.tsx` + `.module.css` | riscrive | bozza sulla timeline, posti accesi, trascinamento dei film, cassetti |

---

### Task 1: La bozza, pura

- [ ] **Step 1: Test**

<!-- file: src/app/admin/(casa)/programma/_tavolo/draft.test.ts -->
```ts
import { describe, it, expect } from 'vitest';
import type { ScheduledShow } from '@/services/scheduling/engine';
import type { CatalogItem } from '../wizard/types';
import {
  addShow,
  clashesWithDraft,
  commitPayload,
  draftBlocksOn,
  draftKey,
  emptyDraft,
  fromSaved,
  maxRuntimeAt,
  minuteOfDay,
  rebase,
  removeShow,
  replaceShow,
  setSpecs,
  showFromSlot,
  swapFilm,
  toSaved,
  visibleSlots,
  withoutCommitted,
} from './draft';

const ORIGIN = '2026-09-28';

function film(tmdbId: string, title: string, runtime: number, extra: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: Number(tmdbId), title, year: 2020, durationMin: runtime, runtime, director: null, tmdbId,
    posterPath: null, genres: [], voteAverage: null, awardLabels: [], inPlex: true, verifyStatus: 'ok',
    scheduledCount: 0, ...extra,
  };
}

/** Uno spettacolo come lo restituisce il motore, con i minuti contati da ORIGIN. */
function show(tmdbId: string, title: string, day: string, time: string, runtime: number): ScheduledShow {
  const [h, m] = time.split(':').map(Number);
  const after = h * 60 + m < 600;
  const date = after ? `2026-${day.slice(5, 7)}-${String(Number(day.slice(8)) + 1).padStart(2, '0')}` : day;
  const base = { tmdbId, title, runtime, day, date, time, endTime: '', startMinute: 0, endMinute: 0, band: 'evening' as const, locked: true };
  return rebase(base, ORIGIN);
}

const DUEL = film('839', 'Duel', 90);
const ANORA = film('1064213', 'Anora', 139, { plexLibraries: ['4K'] });

describe('minuti', () => {
  it('dopo mezzanotte si va oltre le 24 ore', () => {
    expect(minuteOfDay({ time: '21:00' })).toBe(1260);
    expect(minuteOfDay({ time: '00:30' })).toBe(1470);
  });

  it('rebase conta i minuti dall’origine', () => {
    const s = show('839', 'Duel', '2026-09-30', '21:00', 90);
    expect(s.startMinute).toBe(2 * 1440 + 1260);
    expect(s.endMinute).toBe(2 * 1440 + 1350);
    expect(rebase(s, '2026-09-30').startMinute).toBe(1260);
  });
});

describe('aggiungere e togliere', () => {
  it('mette lo spettacolo in bozza, bloccato, con il film e le sue specifiche', () => {
    const d = addShow(emptyDraft(ORIGIN), { ...show('1064213', 'Anora', '2026-09-29', '18:00', 139), locked: false }, ANORA);
    expect(d.shows).toHaveLength(1);
    expect(d.shows[0].locked).toBe(true);
    expect(d.picks['1064213'].specs).toEqual(['4K']);
  });

  it('una sostituzione si ricorda solo se sostituisce qualcosa', () => {
    const s = show('839', 'Duel', '2026-09-29', '18:00', 90);
    const none = addShow(emptyDraft(ORIGIN), s, DUEL, { replaces: [], force: false, soldTickets: 0 });
    expect(none.replacements).toEqual({});
    const some = addShow(emptyDraft(ORIGIN), s, DUEL, { replaces: [5177858], force: false, soldTickets: 0, label: '«Duel» 16:30' });
    expect(Object.keys(some.replacements)).toEqual(['839@2026-09-29T18:00']);
  });

  it('se lo spettacolo viene prima dell’origine, l’origine arretra', () => {
    const d = addShow(emptyDraft(ORIGIN), show('839', 'Duel', '2026-09-26', '18:00', 90), DUEL);
    expect(d.origin).toBe('2026-09-26');
    expect(d.shows[0].startMinute).toBe(1080);
  });

  it('togliere lo spettacolo toglie anche la sua sostituzione', () => {
    const s = show('839', 'Duel', '2026-09-29', '18:00', 90);
    const d = addShow(emptyDraft(ORIGIN), s, DUEL, { replaces: [1], force: false, soldTickets: 0 });
    const out = removeShow(d, draftKey(d.shows[0]));
    expect(out.shows).toEqual([]);
    expect(out.replacements).toEqual({});
  });

  it('spostare perde la sostituzione, come nel wizard', () => {
    const s = show('839', 'Duel', '2026-09-29', '18:00', 90);
    const d = addShow(emptyDraft(ORIGIN), s, DUEL, { replaces: [1], force: false, soldTickets: 0 });
    const moved = replaceShow(d, draftKey(d.shows[0]), show('839', 'Duel', '2026-09-29', '19:00', 90));
    expect(moved.shows.map((x) => x.time)).toEqual(['19:00']);
    expect(moved.replacements).toEqual({});
  });
});

describe('dove sta la bozza', () => {
  const d = addShow(
    addShow(emptyDraft(ORIGIN), show('839', 'Duel', '2026-09-29', '21:00', 90), DUEL),
    show('1064213', 'Anora', '2026-09-29', '23:00', 139),
    ANORA,
  );

  it('i blocchi di un giorno, nei minuti di quel giorno', () => {
    expect(draftBlocksOn(d, '2026-09-29').map((b) => [b.start, b.end])).toEqual([[1260, 1350], [1380, 1519]]);
    expect(draftBlocksOn(d, '2026-09-30')).toEqual([]);
  });

  it('uno scontro conta la pausa di dieci minuti', () => {
    expect(clashesWithDraft(d, '2026-09-29', 1080, 1255)?.title).toBe('Duel');
    expect(clashesWithDraft(d, '2026-09-29', 1080, 1250)).toBeNull();
    expect(clashesWithDraft(d, '2026-09-29', 1300, 1375, draftKey(d.shows[0]))?.title).toBe('Anora');
  });

  it('dei posti proposti restano quelli che non cozzano con la bozza né fra loro', () => {
    const slots = [
      { day: '2026-09-29', date: '2026-09-29', time: '18:00', endTime: '19:30', startMinute: 0, endMinute: 0, band: 'evening' as const },
      { day: '2026-09-29', date: '2026-09-29', time: '18:15', endTime: '19:45', startMinute: 0, endMinute: 0, band: 'evening' as const },
      { day: '2026-09-29', date: '2026-09-29', time: '20:30', endTime: '22:00', startMinute: 0, endMinute: 0, band: 'evening' as const },
    ];
    expect(visibleSlots(slots, d, 90).map((s) => s.time)).toEqual(['18:00']);
  });

  it('quanto può durare un film che parte lì', () => {
    expect(maxRuntimeAt(d, '2026-09-29', 1080, [])).toBe(1260 - 10 - 1080);
    expect(maxRuntimeAt(d, '2026-09-29', 1080, [{ start: 1200, end: 1300 }])).toBe(1200 - 10 - 1080);
    expect(maxRuntimeAt(emptyDraft(ORIGIN), '2026-09-29', 1080, [])).toBe(1500 - 1080);
  });
});

describe('scambi e specifiche', () => {
  const base = addShow(
    addShow(emptyDraft(ORIGIN), show('839', 'Duel', '2026-09-29', '16:30', 90), DUEL, { replaces: [9], force: false, soldTickets: 0 }),
    show('839', 'Duel', '2026-10-01', '18:00', 90),
    DUEL,
  );

  it('uno solo: cambia film, durata e fine; il vecchio va fra gli scartati', () => {
    const d = swapFilm(base, draftKey(base.shows[0]), ANORA, 'one');
    expect(d.shows.map((s) => s.title)).toEqual(['Anora', 'Duel']);
    expect(d.shows[0].endTime).toBe('18:49');
    expect(d.rejected).toEqual(['839']);
    expect(d.picks['839']).toBeDefined();
    expect(Object.keys(d.replacements)).toEqual(['1064213@2026-09-29T16:30']);
  });

  it('tutti: il vecchio film esce anche dalle scelte', () => {
    const d = swapFilm(base, draftKey(base.shows[0]), ANORA, 'all');
    expect(d.shows.every((s) => s.tmdbId === '1064213')).toBe(true);
    expect(d.picks['839']).toBeUndefined();
  });

  it('le specifiche valgono per il film', () => {
    const d = setSpecs(base, '839', { specs: ['ATMOS', '4K'], specsNote: ' copia restaurata ' });
    expect(d.picks['839'].specs).toEqual(['ATMOS', '4K']);
    expect(commitPayload(d)[0]).toMatchObject({ specs: ['4K', 'ATMOS'], specsNote: 'copia restaurata' });
  });
});

describe('verso la sala', () => {
  const d = addShow(
    addShow(emptyDraft(ORIGIN), show('839', 'Duel', '2026-10-01', '18:00', 90), DUEL),
    show('839', 'Duel', '2026-09-29', '16:30', 90),
    DUEL,
    { replaces: [9], force: true, soldTickets: 2, outsideHours: true },
  );

  it('il carico della conferma è in ordine di data, con sostituzioni e permessi', () => {
    expect(commitPayload(d)).toEqual([
      { tmdbId: '839', date: '2026-09-29', time: '16:30', title: 'Duel', replaces: [9], forceReplace: true, allowOutsideHours: true },
      { tmdbId: '839', date: '2026-10-01', time: '18:00', title: 'Duel' },
    ]);
  });

  it('dopo la conferma escono solo gli spettacoli creati', () => {
    const out = withoutCommitted(d, new Set(['839@2026-09-29T16:30']));
    expect(out.shows.map((s) => s.date)).toEqual(['2026-10-01']);
    expect(out.replacements).toEqual({});
  });

  it('il salvataggio ha la forma del wizard, e si rilegge uguale', () => {
    const saved = toSaved(d);
    expect(saved.startDate).toBe(ORIGIN);
    expect(saved.days).toBe(4);
    expect(saved.showCount).toBe(2);
    expect((saved.state as { mode: string }).mode).toBe('period');
    const back = fromSaved({ ...saved, state: JSON.parse(JSON.stringify(saved.state)) });
    expect(back?.shows).toEqual(d.shows);
    expect(back?.replacements).toEqual(d.replacements);
    expect(back?.picks['839'].film.title).toBe('Duel');
  });

  it('una bozza vuota non si rilegge', () => {
    expect(fromSaved({ startDate: ORIGIN, days: 7, intensity: 'normal', state: {}, showCount: 0 })).toBeNull();
  });

  it('un posto proposto diventa uno spettacolo del film', () => {
    const s = showFromSlot(
      { tmdbId: '839', title: 'Duel', runtime: 90 },
      { day: '2026-09-29', date: '2026-09-29', time: '18:00', endTime: '19:30', startMinute: 2520, endMinute: 2610, band: 'evening' },
    );
    expect(s).toMatchObject({ tmdbId: '839', day: '2026-09-29', time: '18:00', endTime: '19:30', locked: true });
  });
});
```

- [ ] **Step 2:** `npx vitest run "src/app/admin/(casa)/programma/_tavolo/draft"` → FAIL (modulo mancante).

- [ ] **Step 3: Implementazione**

<!-- file: src/app/admin/(casa)/programma/_tavolo/draft.ts -->
```ts
import type { ScheduledShow } from '@/services/scheduling/engine';
import {
  CLOSING_MINUTE,
  MIN_GAP_MINUTES,
  MINUTES_PER_DAY,
  OPENING_MINUTE,
  daysBetweenISO,
  formatClock,
  type Band,
} from '@/services/scheduling/times';
import { normalizeProjectionSpecs, type ProjectionSpecCode } from '@/constants/projectionSpecs';
import { commitKey, defaultSpecsFor, type CatalogItem, type Pick as FilmPick } from '../wizard/types';

export type { FilmPick };

/** Cosa comporta uno spettacolo messo al posto di altri, già in sala. */
export interface Replacement {
  replaces: number[];
  force: boolean;
  label?: string;
  soldTickets: number;
  outsideHours?: boolean;
}

/**
 * La bozza del tavolo.
 *
 * Gli spettacoli portano giorno di programmazione e orario: sono quelli a dire
 * dove stanno. I minuti globali (`startMinute`) sono contati da `origin` e si
 * ricalcolano con `rebase` quando il motore li vuole contati da un'altra data.
 */
export interface Draft {
  origin: string;
  intensity: string;
  shows: ScheduledShow[];
  picks: Record<string, FilmPick>;
  /** Per `commitKey`: sostituzioni e permesso di uscire dall'orario. */
  replacements: Record<string, Replacement>;
  /** Film scartati scambiandoli: non si ripropongono. */
  rejected: string[];
}

export function emptyDraft(origin: string): Draft {
  return { origin, intensity: 'normal', shows: [], picks: {}, replacements: {}, rejected: [] };
}

function clockMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Minuto nel giorno di programmazione: dopo mezzanotte si va oltre le 24:00. */
export function minuteOfDay(show: { time: string }): number {
  const m = clockMinutes(show.time);
  return m < OPENING_MINUTE ? m + MINUTES_PER_DAY : m;
}

/** Lo stesso spettacolo, con i minuti globali contati da `origin`. */
export function rebase(show: ScheduledShow, origin: string): ScheduledShow {
  const start = daysBetweenISO(origin, show.day) * MINUTES_PER_DAY + minuteOfDay(show);
  return { ...show, startMinute: start, endMinute: start + show.runtime };
}

export function draftKey(show: Pick<ScheduledShow, 'tmdbId' | 'date' | 'time'>): string {
  return `d:${commitKey(show as ScheduledShow)}`;
}

export function findDraft(draft: Draft, key: string): ScheduledShow | null {
  return draft.shows.find((s) => draftKey(s) === key) ?? null;
}

export interface DraftBlock {
  key: string;
  show: ScheduledShow;
  start: number;
  end: number;
}

export function draftBlocksOn(draft: Draft, day: string): DraftBlock[] {
  return draft.shows
    .filter((s) => s.day === day)
    .map((s) => {
      const start = minuteOfDay(s);
      return { key: draftKey(s), show: s, start, end: start + s.runtime };
    })
    .sort((a, b) => a.start - b.start);
}

/** Gli spettacoli in bozza contati dal primo giorno del tavolo: così li vuole il motore. */
export function showsFor(draft: Draft, from: string): ScheduledShow[] {
  return draft.shows.map((s) => rebase(s, from));
}

function omit<T>(record: Record<string, T>, keys: Set<string>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => !keys.has(k)));
}

/** L'origine non resta mai dopo il primo spettacolo, o il wizard lo leggerebbe nel passato. */
function settle(draft: Draft): Draft {
  const earliest = draft.shows.reduce<string | null>((min, s) => (min === null || s.day < min ? s.day : min), null);
  if (earliest === null || earliest >= draft.origin) return draft;
  return { ...draft, origin: earliest, shows: draft.shows.map((s) => rebase(s, earliest)) };
}

export function addShow(draft: Draft, show: ScheduledShow, film?: CatalogItem | null, replacement?: Replacement): Draft {
  const placed = { ...rebase(show, draft.origin), locked: true };
  const picks = { ...draft.picks };
  if (film && !picks[placed.tmdbId]) picks[placed.tmdbId] = { film, specs: defaultSpecsFor(film) };
  const replacements = { ...draft.replacements };
  if (replacement && (replacement.replaces.length > 0 || replacement.outsideHours)) {
    replacements[commitKey(placed)] = replacement;
  }
  return settle({ ...draft, shows: [...draft.shows, placed], picks, replacements });
}

export function removeShow(draft: Draft, key: string): Draft {
  const target = findDraft(draft, key);
  if (!target) return draft;
  return {
    ...draft,
    shows: draft.shows.filter((s) => s !== target),
    replacements: omit(draft.replacements, new Set([commitKey(target)])),
  };
}

/** Lo spettacolo cambia posto: la vecchia sostituzione non vale più. */
export function replaceShow(draft: Draft, key: string, show: ScheduledShow, replacement?: Replacement): Draft {
  return addShow(removeShow(draft, key), show, draft.picks[show.tmdbId]?.film ?? null, replacement);
}

export function setSpecs(
  draft: Draft,
  tmdbId: string,
  patch: { specs?: ProjectionSpecCode[]; specsNote?: string },
): Draft {
  const current = draft.picks[tmdbId];
  if (!current) return draft;
  return { ...draft, picks: { ...draft.picks, [tmdbId]: { ...current, ...patch } } };
}

export interface SlotLike {
  day: string;
  date: string;
  time: string;
  endTime: string;
  startMinute: number;
  endMinute: number;
  band: Band;
}

export function showFromSlot(
  base: Pick<ScheduledShow, 'tmdbId' | 'title' | 'runtime'> & { posterPath?: string },
  slot: SlotLike,
): ScheduledShow {
  return {
    ...base,
    day: slot.day,
    date: slot.date,
    time: slot.time,
    endTime: slot.endTime,
    startMinute: slot.startMinute,
    endMinute: slot.endMinute,
    band: slot.band,
    locked: true,
  };
}

/** Il primo spettacolo in bozza con cui [start, end) si scontra, pausa compresa. */
export function clashesWithDraft(
  draft: Draft,
  day: string,
  start: number,
  end: number,
  exceptKey?: string,
): ScheduledShow | null {
  for (const b of draftBlocksOn(draft, day)) {
    if (b.key === exceptKey) continue;
    if (start < b.end + MIN_GAP_MINUTES && b.start < end + MIN_GAP_MINUTES) return b.show;
  }
  return null;
}

/** I posti proposti che si possono disegnare: senza scontri con la bozza, né fra loro. */
export function visibleSlots<T extends SlotLike>(slots: T[], draft: Draft, runtime: number): (T & { start: number; end: number })[] {
  const taken = new Map<string, { start: number; end: number }[]>();
  const out: (T & { start: number; end: number })[] = [];
  for (const slot of slots) {
    const start = minuteOfDay(slot);
    const end = start + runtime;
    if (clashesWithDraft(draft, slot.day, start, end)) continue;
    const day = taken.get(slot.day) ?? [];
    if (day.some((t) => start < t.end && t.start < end)) continue;
    day.push({ start, end });
    taken.set(slot.day, day);
    out.push({ ...slot, start, end });
  }
  return out;
}

/** Quanto può durare, al massimo, un film che comincia a `start` di quel giorno. */
export function maxRuntimeAt(
  draft: Draft,
  day: string,
  start: number,
  existing: { start: number; end: number }[],
  exceptKey?: string,
): number {
  const nexts = [
    ...draftBlocksOn(draft, day).filter((b) => b.key !== exceptKey).map((b) => b.start),
    ...existing.map((b) => b.start),
  ].filter((s) => s > start);
  const limit = nexts.length ? Math.min(Math.min(...nexts) - MIN_GAP_MINUTES, CLOSING_MINUTE) : CLOSING_MINUTE;
  return Math.max(limit - start, 0);
}

/** Cambia il film di uno spettacolo, o di tutti quelli dello stesso film. */
export function swapFilm(draft: Draft, key: string, film: CatalogItem, scope: 'one' | 'all'): Draft {
  const target = findDraft(draft, key);
  const runtime = film.runtime ?? film.durationMin ?? 0;
  if (!target || !film.tmdbId || runtime <= 0) return draft;
  const oldId = target.tmdbId;
  const touched = (s: ScheduledShow) => (scope === 'all' ? s.tmdbId === oldId : s === target);

  const moved = new Set<string>();
  const replacements: Record<string, Replacement> = {};
  const shows = draft.shows.map((s) => {
    if (!touched(s)) return s;
    const next: ScheduledShow = {
      ...s,
      tmdbId: film.tmdbId!,
      title: film.title,
      runtime,
      posterPath: film.posterPath ?? undefined,
      endTime: formatClock(minuteOfDay(s) + runtime),
      endMinute: s.startMinute + runtime,
      locked: true,
    };
    const old = draft.replacements[commitKey(s)];
    if (old) {
      replacements[commitKey(next)] = old;
      moved.add(commitKey(s));
    }
    return next;
  });

  const picks = { ...draft.picks };
  if (!picks[film.tmdbId]) picks[film.tmdbId] = { film, specs: defaultSpecsFor(film) };
  if (!shows.some((s) => s.tmdbId === oldId)) delete picks[oldId];

  return {
    ...draft,
    shows,
    picks,
    replacements: { ...omit(draft.replacements, moved), ...replacements },
    rejected: draft.rejected.includes(oldId) ? draft.rejected : [...draft.rejected, oldId],
  };
}

/** Toglie dalla bozza gli spettacoli già creati in sala. */
export function withoutCommitted(draft: Draft, created: Set<string>): Draft {
  return {
    ...draft,
    shows: draft.shows.filter((s) => !created.has(commitKey(s))),
    replacements: omit(draft.replacements, created),
  };
}

export interface CommitShowPayload {
  tmdbId: string;
  date: string;
  time: string;
  title: string;
  specs?: ProjectionSpecCode[];
  specsNote?: string;
  replaces?: number[];
  forceReplace?: boolean;
  allowOutsideHours?: boolean;
}

export function commitPayload(draft: Draft): CommitShowPayload[] {
  return [...draft.shows]
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    .map((s) => {
      const r = draft.replacements[commitKey(s)];
      const pick = draft.picks[s.tmdbId];
      const specs = normalizeProjectionSpecs(pick?.specs);
      const note = pick?.specsNote?.trim();
      return {
        tmdbId: s.tmdbId,
        date: s.date,
        time: s.time,
        title: s.title,
        ...(specs.length ? { specs } : {}),
        ...(note ? { specsNote: note } : {}),
        ...(r?.replaces.length ? { replaces: r.replaces, forceReplace: r.force } : {}),
        ...(r?.outsideHours ? { allowOutsideHours: true } : {}),
      };
    });
}

export interface SavedDraftLike {
  startDate: string;
  days: number;
  intensity: string;
  state: unknown;
  showCount: number;
}

/** La forma del wizard: una bozza cominciata lì si riprende qui, e viceversa. */
export function toSaved(draft: Draft): SavedDraftLike {
  const last = draft.shows.reduce((m, s) => Math.max(m, daysBetweenISO(draft.origin, s.day)), 0);
  return {
    startDate: draft.origin,
    days: Math.min(Math.max(last + 1, 1), 30),
    intensity: draft.intensity,
    showCount: draft.shows.length,
    state: {
      mode: 'period',
      step: 3,
      picks: Object.entries(draft.picks),
      shows: draft.shows,
      warnings: [],
      replacements: Object.entries(draft.replacements),
      rejected: draft.rejected,
    },
  };
}

export function fromSaved(saved: SavedDraftLike): Draft | null {
  const state = saved.state as {
    shows?: ScheduledShow[];
    picks?: [string, FilmPick][];
    replacements?: [string, Replacement][];
    rejected?: string[];
  } | null;
  if (!state?.shows?.length) return null;
  return {
    origin: saved.startDate,
    intensity: saved.intensity || 'normal',
    shows: state.shows.map((s) => rebase(s, saved.startDate)),
    picks: Object.fromEntries(state.picks ?? []),
    replacements: Object.fromEntries(state.replacements ?? []),
    rejected: state.rejected ?? [],
  };
}
```

- [ ] **Step 4:** PASS (19). **Step 5: Commit** — `La bozza del tavolo: dove sta, cosa sostituisce, cosa va in sala`

---

### Task 2: I due hook

<!-- file: src/app/admin/(casa)/programma/_tavolo/useDraft.ts -->
```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { planningDropDraft, planningLoadDraft, planningSaveDraft } from '@/actions/planningActions';
import { emptyDraft, fromSaved, toSaved, type Draft } from './draft';

/**
 * La bozza della sala: si carica da sola e si salva un secondo dopo ogni
 * modifica. Il salvataggio è una rete, non il lavoro: se non riesce il tavolo
 * va avanti lo stesso.
 */
export function useDraft(roomId: number | null, from: string) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const loadedFor = useRef<number | null>(null);
  const dirty = useRef(false);
  const fromRef = useRef(from);
  useEffect(() => {
    fromRef.current = from;
  });

  useEffect(() => {
    if (roomId === null) return;
    let cancelled = false;
    loadedFor.current = null;
    dirty.current = false;
    planningLoadDraft(roomId)
      .then((saved) => {
        if (cancelled) return;
        setDraft((saved && fromSaved(saved)) || emptyDraft(fromRef.current));
        setSavedAt(saved?.updatedAt ?? null);
        loadedFor.current = roomId;
      })
      .catch(() => {
        if (cancelled) return;
        setDraft(emptyDraft(fromRef.current));
        loadedFor.current = roomId;
      });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  useEffect(() => {
    if (!draft || roomId === null || loadedFor.current !== roomId || !dirty.current) return;
    const timer = window.setTimeout(async () => {
      dirty.current = false;
      if (draft.shows.length === 0) await planningDropDraft(roomId).catch(() => null);
      else await planningSaveDraft(roomId, toSaved(draft)).catch(() => null);
      setSavedAt(new Date().toISOString());
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [draft, roomId]);

  const update = useCallback((change: (d: Draft) => Draft) => {
    dirty.current = true;
    setDraft((d) => (d ? change(d) : d));
  }, []);

  const discard = useCallback(async () => {
    if (roomId !== null) await planningDropDraft(roomId).catch(() => null);
    dirty.current = false;
    setDraft(emptyDraft(fromRef.current));
    setSavedAt(null);
  }, [roomId]);

  return { draft, savedAt, update, discard };
}
```

<!-- file: src/app/admin/(casa)/programma/_tavolo/useCommit.ts -->
```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  planningCommitRetry,
  planningCommitStart,
  planningCommitStatus,
  planningCommitTick,
  planningFindOpenCommit,
} from '@/actions/planningActions';
import type { CommitShowPayload } from './draft';

/** Lo stesso filo del wizard: una creazione avviata lì si riprende qui. */
const JOB_KEY = 'programmazione:job';
const SENT_KEY = 'programmazione:job:sent';

export interface CommitFailure {
  key: string;
  label: string;
  error: string;
}

export type CommitPhase = 'idle' | 'running' | 'done';

function remember(id: string | null, sent?: string[]) {
  try {
    if (id) {
      localStorage.setItem(JOB_KEY, id);
      if (sent) localStorage.setItem(SENT_KEY, JSON.stringify({ id, sent }));
    } else {
      localStorage.removeItem(JOB_KEY);
      localStorage.removeItem(SENT_KEY);
    }
  } catch {
    /* archivio del browser non disponibile: la ripresa passerà dalla sala */
  }
}

function recall(): { id: string | null; sent: string[] | null } {
  try {
    const id = localStorage.getItem(JOB_KEY);
    const raw = localStorage.getItem(SENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as { id: string; sent: string[] }) : null;
    return { id, sent: parsed && parsed.id === id ? parsed.sent : null };
  } catch {
    return { id: null, sent: null };
  }
}

function keyOf(s: CommitShowPayload): string {
  return `${s.tmdbId}@${s.date}T${s.time}`;
}

/**
 * La creazione in sala. Nessuno la porta avanti in sottofondo: ogni giro è un
 * lotto vero, fatto da chi guarda la barra. Ripetere è sicuro, perché il
 * lavoro sa già cosa ha creato.
 *
 * `onCreated` riceve le chiavi degli spettacoli **mandati da qui** e creati
 * davvero. Se il lavoro è stato avviato altrove non le conosciamo, e allora non
 * si tocca la bozza: meglio uno spettacolo da togliere a mano che uno perso.
 */
export function useCommit(roomId: number | null, onCreated: (keys: Set<string>) => void) {
  const [phase, setPhase] = useState<CommitPhase>('idle');
  const [progress, setProgress] = useState({ step: '', done: 0, total: 1 });
  const [created, setCreated] = useState(0);
  const [failures, setFailures] = useState<CommitFailure[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [resumeOffer, setResumeOffer] = useState<{ id: string; done: number; total: number } | null>(null);
  const sentKeys = useRef<string[] | null>(null);
  const createdCallback = useRef(onCreated);
  useEffect(() => {
    createdCallback.current = onCreated;
  });

  const follow = useCallback(async (id: string) => {
    setPhase('running');
    setJobId(id);
    try {
      for (;;) {
        const job = await planningCommitTick(id);
        if (!job) {
          setProgress({ step: 'Non trovo più questo lavoro: ricontrolla la sala.', done: 1, total: 1 });
          remember(null);
          break;
        }
        setProgress({ step: job.step, done: job.done, total: job.total });
        setCreated(job.created.length);
        setFailures(job.errors);
        if (job.state === 'done' || job.state === 'error') {
          remember(null);
          if (sentKeys.current) {
            const failed = new Set(job.errors.map((e) => e.key));
            createdCallback.current(new Set(sentKeys.current.filter((k) => !failed.has(k))));
          }
          break;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
    } catch (e) {
      setFailures((prev) => [...prev, { key: 'tick', label: 'Avanzamento della creazione', error: String(e) }]);
    } finally {
      setPhase('done');
    }
  }, []);

  const start = useCallback(
    async (shows: CommitShowPayload[]) => {
      if (roomId === null || shows.length === 0) return;
      setFailures([]);
      setCreated(0);
      setProgress({ step: 'Registro il piano…', done: 0, total: shows.length });
      setPhase('running');
      try {
        const { jobId: id } = await planningCommitStart({ seatingPlanId: roomId, shows });
        sentKeys.current = shows.map(keyOf);
        remember(id, sentKeys.current);
        await follow(id);
      } catch (e) {
        setFailures([{ key: 'start', label: 'Avvio della creazione', error: String(e) }]);
        setPhase('done');
      }
    },
    [roomId, follow],
  );

  const retry = useCallback(async () => {
    if (!jobId) return;
    await planningCommitRetry(jobId);
    remember(jobId, sentKeys.current ?? undefined);
    await follow(jobId);
  }, [jobId, follow]);

  const close = useCallback(() => {
    setPhase('idle');
    setFailures([]);
    setCreated(0);
    setJobId(null);
    sentKeys.current = null;
  }, []);

  useEffect(() => {
    if (roomId === null) return;
    let cancelled = false;
    (async () => {
      const stored = recall();
      let id = stored.id;
      if (!id) id = await planningFindOpenCommit(roomId).catch(() => null);
      if (!id || cancelled) return;
      const job = await planningCommitStatus(id).catch(() => null);
      if (cancelled) return;
      if (!job || job.state === 'done' || job.state === 'error') {
        remember(null);
        return;
      }
      sentKeys.current = stored.id === id ? stored.sent : null;
      setResumeOffer({ id, done: job.done, total: job.total });
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  const acceptResume = useCallback(() => {
    if (!resumeOffer) return;
    const id = resumeOffer.id;
    setResumeOffer(null);
    void follow(id);
  }, [resumeOffer, follow]);

  const declineResume = useCallback(() => {
    remember(null);
    sentKeys.current = null;
    setResumeOffer(null);
  }, []);

  return { phase, progress, created, failures, resumeOffer, start, retry, close, acceptResume, declineResume };
}

export type CommitApi = ReturnType<typeof useCommit>;
```

- [ ] `npx tsc --noEmit` muto. **Commit** — `La bozza si salva da sola, e la conferma si fa avanzare e si riprende`

---

### Task 3: Il catalogo nel cassetto

<!-- file: src/app/admin/(casa)/programma/_tavolo/TmdbDialog.tsx -->
```tsx
'use client';

import { useState } from 'react';
import { catalogAddByTmdbId, catalogPreviewTmdb, catalogSearchTmdb } from '@/actions/catalogActions';
import Button from '@/components/cabina/Button';
import Dialog from '@/components/cabina/Dialog';
import { useToast } from '@/components/cabina/Toast';
import type { CatalogItem } from '../wizard/types';
import styles from './CatalogDrawer.module.css';

interface Hit {
  id: number;
  title?: string;
  original_title?: string;
  release_date?: string;
}

/**
 * Un film che non hai in libreria. Di norma vive solo nella bozza: scriverlo
 * in catalogo è una decisione d'archivio, e la prendi tu con la spunta.
 */
export default function TmdbDialog({ onClose, onPick }: { onClose: () => void; onPick: (film: CatalogItem) => void }) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [save, setSave] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      setHits(((await catalogSearchTmdb(query)) as Hit[]).slice(0, 12));
    } catch {
      toast('TMDB non ha risposto. Riprova fra poco.', 'alarm');
    } finally {
      setLoading(false);
    }
  };

  const pick = async (hit: Hit) => {
    setPicking(hit.id);
    try {
      if (save) await catalogAddByTmdbId(String(hit.id));
      const film = await catalogPreviewTmdb(String(hit.id));
      if (!film) throw new Error('film non trovato');
      onPick(film as unknown as CatalogItem);
    } catch {
      toast('Non sono riuscito a leggere questo film da TMDB.', 'alarm');
    } finally {
      setPicking(null);
    }
  };

  return (
    <Dialog open onClose={onClose} title="Cerca su TMDB" showTitle>
      <form onSubmit={search} className={styles.tmdbForm}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Titolo, oppure id TMDB" aria-label="Titolo o id TMDB" />
        <Button type="submit" variant="outline" disabled={loading}>{loading ? 'Cerco…' : 'Cerca'}</Button>
      </form>
      <label className={styles.tmdbSave}>
        <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
        Salvalo anche nel catalogo
      </label>
      <p className={styles.tmdbHint}>Se non lo spunti, il film vive solo in questa bozza.</p>
      {hits && hits.length === 0 && <p className={styles.tmdbHint}>Nessun film con questo nome.</p>}
      {hits && hits.length > 0 && (
        <ul className={styles.tmdbList}>
          {hits.map((h) => (
            <li key={h.id}>
              <span>
                {h.title || h.original_title} <em>{h.release_date?.slice(0, 4)}</em>
              </span>
              <Button variant="ghost" onClick={() => pick(h)} disabled={picking !== null}>
                {picking === h.id ? '…' : 'Usa'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
```

<!-- file: src/app/admin/(casa)/programma/_tavolo/CatalogDrawer.tsx -->
```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { RotateCw, Search } from 'lucide-react';
import { catalogGetFacets, catalogGetRails, catalogList } from '@/actions/catalogActions';
import { CATALOG_RAIL_HINTS, RUNTIME_BUCKETS, type CatalogRail, type RuntimeBucketKey } from '@/constants/catalogRails';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import type { CatalogItem } from '../wizard/types';
import TmdbDialog from './TmdbDialog';
import styles from './CatalogDrawer.module.css';

interface Props {
  /** Durate dei buchi del periodo: alimentano la corsia "Stanno nei buchi". */
  gaps: number[];
  selected: string | null;
  inDraft: Set<string>;
  onSelect: (film: CatalogItem | null) => void;
  /** Il film che si sta trascinando: il tavolo lo deve conoscere al rilascio. */
  onDragFilm: (film: CatalogItem) => void;
}

type Rail = { rail: CatalogRail; label: string; films: CatalogItem[] };

const RAIL_LABEL: Partial<Record<CatalogRail, string>> = { perfect: 'Stanno nei buchi' };

function runtimeOf(f: CatalogItem): number | null {
  return f.runtime ?? f.durationMin ?? null;
}

export default function CatalogDrawer({ gaps, selected, inDraft, onSelect, onDragFilm }: Props) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [genre, setGenre] = useState('');
  const [decade, setDecade] = useState('');
  const [bucket, setBucket] = useState<RuntimeBucketKey | ''>('');
  const [facets, setFacets] = useState<{ genres: string[]; decades: number[] }>({ genres: [], decades: [] });
  const [rails, setRails] = useState<{ key: string; rails: Rail[] } | null>(null);
  const [results, setResults] = useState<{ key: string; films: CatalogItem[]; total: number } | null>(null);
  const [nonce, setNonce] = useState(0);
  const [tmdbOpen, setTmdbOpen] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 350);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    catalogGetFacets()
      .then((f) => setFacets({ genres: f.genres, decades: f.decades }))
      .catch(() => null);
  }, []);

  const filtering = Boolean(debounced || genre || decade || bucket);
  const range = bucket ? RUNTIME_BUCKETS.find((b) => b.key === bucket) : undefined;
  const queryKey = `${debounced}|${genre}|${decade}|${bucket}`;
  const railsKey = `${gaps.join(',')}|${nonce}`;

  useEffect(() => {
    if (filtering) return;
    let cancelled = false;
    catalogGetRails({ hideScheduled: true }, { perRail: 8, gaps })
      .then((r) => {
        if (!cancelled) setRails({ key: railsKey, rails: r as unknown as Rail[] });
      })
      .catch(() => {
        if (!cancelled) setRails({ key: railsKey, rails: [] });
      });
    return () => {
      cancelled = true;
    };
    // `gaps` è un array nuovo a ogni render: conta la sua chiave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtering, railsKey]);

  useEffect(() => {
    if (!filtering) return;
    let cancelled = false;
    catalogList({
      search: debounced || undefined,
      genre: genre || undefined,
      decade: decade ? Number(decade) : undefined,
      minRuntime: range?.min,
      maxRuntime: range?.max,
      pageSize: 40,
    })
      .then((r) => {
        if (!cancelled) setResults({ key: queryKey, films: r.films as unknown as CatalogItem[], total: r.total });
      })
      .catch(() => {
        if (!cancelled) setResults({ key: queryKey, films: [], total: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [filtering, queryKey, debounced, genre, decade, range?.min, range?.max]);

  const loading = filtering ? results?.key !== queryKey : rails?.key !== railsKey;

  const card = (f: CatalogItem) => {
    const runtime = runtimeOf(f);
    const poster = getTMDBImageUrl(f.posterPath ?? null, 'w92');
    const draggable = Boolean(f.tmdbId && runtime);
    return (
      <li key={`${f.id}-${f.tmdbId}`}>
        <button
          type="button"
          className={styles.film}
          data-selected={f.tmdbId !== null && f.tmdbId === selected ? '' : undefined}
          draggable={draggable}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', `film:${f.tmdbId}`);
            e.dataTransfer.effectAllowed = 'copy';
            onDragFilm(f);
          }}
          onClick={() => onSelect(f.tmdbId === selected ? null : f)}
          title={draggable ? 'Trascinalo su un giorno, o cliccalo per vedere dove ci sta' : 'Senza durata: non so dove metterlo'}
        >
          <span className={styles.poster}>{poster && <img src={poster} alt="" loading="lazy" />}</span>
          <span className={styles.filmText}>
            <span className={styles.filmTitle}>{f.title}</span>
            <span className={styles.filmMeta}>
              {[f.year, f.director, runtime ? `${runtime}′` : 'durata ignota'].filter(Boolean).join(' · ')}
            </span>
            <span className={styles.badges}>
              {f.tmdbId && inDraft.has(f.tmdbId) && <em className={styles.badgeDraft}>in bozza</em>}
              {f.awardLabels?.length > 0 && <em>premiato</em>}
              {f.scheduledCount === 0 && <em>mai programmato</em>}
              {f.inCatalog === false && <em>solo bozza</em>}
            </span>
          </span>
        </button>
      </li>
    );
  };

  const visibleRails = useMemo(() => (rails?.rails ?? []).filter((r) => r.films.length > 0), [rails]);

  return (
    <div className={styles.drawer}>
      <header className={styles.head}>
        <p className={styles.kicker}>Catalogo</p>
        <label className={styles.search}>
          <Search size={14} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Titolo o regista…" aria-label="Cerca nel catalogo" />
        </label>
        <div className={styles.filters}>
          <select value={genre} onChange={(e) => setGenre(e.target.value)} aria-label="Genere">
            <option value="">Genere</option>
            {facets.genres.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select value={decade} onChange={(e) => setDecade(e.target.value)} aria-label="Decennio">
            <option value="">Anni</option>
            {facets.decades.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={bucket} onChange={(e) => setBucket(e.target.value as RuntimeBucketKey | '')} aria-label="Durata">
            <option value="">Durata</option>
            {RUNTIME_BUCKETS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
          </select>
        </div>
        <p className={styles.hint}>Trascina un film su un giorno, o cliccalo per accendere i posti dove ci sta.</p>
      </header>

      <div className={styles.body}>
        {loading && <p className={styles.hint}>Sfoglio il catalogo…</p>}

        {!loading && filtering && results && (
          <>
            <p className={styles.count}>{results.total} {results.total === 1 ? 'film' : 'film'}</p>
            <ul className={styles.list}>{results.films.map(card)}</ul>
          </>
        )}

        {!loading && !filtering && visibleRails.map((r) => (
          <section key={r.rail} className={styles.rail}>
            <div className={styles.railHead}>
              <h3 title={CATALOG_RAIL_HINTS[r.rail]}>{RAIL_LABEL[r.rail] ?? r.label}</h3>
              {r.rail === 'surprise' && (
                <button type="button" onClick={() => setNonce((n) => n + 1)} aria-label="Altri film a sorpresa">
                  <RotateCw size={13} />
                </button>
              )}
            </div>
            <ul className={styles.list}>{r.films.map(card)}</ul>
          </section>
        ))}

        <button type="button" className={styles.tmdbLink} onClick={() => setTmdbOpen(true)}>
          Non lo trovi? Cercalo su TMDB
        </button>
      </div>

      {tmdbOpen && (
        <TmdbDialog
          onClose={() => setTmdbOpen(false)}
          onPick={(film) => {
            setTmdbOpen(false);
            onSelect(film);
          }}
        />
      )}
    </div>
  );
}
```

<!-- file: src/app/admin/(casa)/programma/_tavolo/CatalogDrawer.module.css -->
```css
.drawer { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.head { display: grid; gap: 8px; padding: 16px 16px 12px; border-bottom: 1px solid var(--c-line); }
.kicker { margin: 0; font-family: var(--c-font-mono); font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--c-amber); }
.search {
  display: flex; align-items: center; gap: 8px; padding: 0 10px; min-height: 36px;
  background: var(--c-bg-sunken); border: 1px solid var(--c-line); border-radius: var(--c-radius); color: var(--c-dim);
}
.search:focus-within { border-color: var(--c-amber); }
.search input { flex: 1; min-width: 0; background: none; border: 0; color: var(--c-ink); font: inherit; font-size: 13.5px; }
.search input:focus { outline: none; }
.filters { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.filters select {
  min-width: 0; min-height: 30px; padding: 0 6px; background: var(--c-bg-sunken); color: var(--c-ink);
  border: 1px solid var(--c-line); border-radius: var(--c-radius); font-size: 12px;
}
.hint, .count { margin: 0; font-size: 12px; color: var(--c-dim); }
.count { font-family: var(--c-font-mono); font-size: 10.5px; margin-bottom: 6px; }

.body { flex: 1; overflow-y: auto; padding: 12px 10px 20px; display: grid; gap: 14px; align-content: start; }
.rail { display: grid; gap: 4px; }
.railHead { display: flex; justify-content: space-between; align-items: center; padding: 0 6px; }
.railHead h3 { margin: 0; font-family: var(--c-font-mono); font-size: 10px; font-weight: 400; letter-spacing: 0.14em; text-transform: uppercase; color: var(--c-dim); }
.railHead button { display: grid; place-items: center; width: 24px; height: 24px; background: none; border: 0; color: var(--c-dim); cursor: pointer; border-radius: 4px; }
.railHead button:hover { color: var(--c-amber); }

.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.film {
  display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 10px; align-items: center;
  width: 100%; padding: 6px; background: none; border: 0; border-radius: var(--c-radius);
  color: var(--c-ink); text-align: left; cursor: pointer;
}
.film:hover { background: var(--c-amber-soft); }
.film[draggable='true'] { cursor: grab; }
.film[data-selected] { background: var(--c-amber-soft); box-shadow: inset 2px 0 0 var(--c-amber); }
.poster { width: 34px; height: 50px; border-radius: 2px; overflow: hidden; background: linear-gradient(160deg, #3a2c1f, #15110d); border: 1px solid var(--c-line); }
.poster img { width: 100%; height: 100%; object-fit: cover; display: block; }
.filmText { display: grid; gap: 1px; min-width: 0; }
.filmTitle { font-family: var(--c-font-serif); font-size: 14px; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.filmMeta { font-size: 11px; color: var(--c-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badges { display: flex; gap: 4px; flex-wrap: wrap; }
.badges em { font-style: normal; font-family: var(--c-font-mono); font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--c-dim); }
.badges .badgeDraft { color: var(--c-amber); }

.tmdbLink { justify-self: start; margin: 4px 6px 0; padding: 0; background: none; border: 0; color: var(--c-amber); font-size: 12.5px; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }

.tmdbForm { display: flex; gap: 8px; }
.tmdbForm input {
  flex: 1; min-height: 38px; padding: 0 10px; background: var(--c-bg-sunken); color: var(--c-ink);
  border: 1px solid var(--c-line); border-radius: var(--c-radius); font: inherit;
}
.tmdbForm input:focus { outline: none; border-color: var(--c-amber); }
.tmdbSave { display: flex; gap: 8px; align-items: center; margin-top: 12px; font-size: 13px; }
.tmdbSave input { accent-color: var(--c-amber); }
.tmdbHint { margin: 4px 0 0; font-size: 12px; color: var(--c-dim); }
.tmdbList { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 4px; max-height: 40vh; overflow-y: auto; }
.tmdbList li { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 6px 0; border-top: 1px solid var(--c-line); }
.tmdbList em { font-style: normal; color: var(--c-dim); font-family: var(--c-font-mono); font-size: 11px; margin-left: 4px; }
```

- [ ] tipi + lint. **Commit** — `Il catalogo entra nel cassetto del tavolo, e TMDB non scrive senza permesso`

---

### Task 4: Il pannello della bozza e lo scambio

<!-- file: src/app/admin/(casa)/programma/_tavolo/SwapDialog.tsx -->
```tsx
'use client';

import { useEffect, useState } from 'react';
import { planningAlternatives } from '@/actions/planningActions';
import Button from '@/components/cabina/Button';
import Dialog from '@/components/cabina/Dialog';
import type { ScheduledShow } from '@/services/scheduling/engine';
import type { CatalogItem } from '../wizard/types';
import styles from './CatalogDrawer.module.css';

interface Props {
  show: ScheduledShow;
  occurrences: number;
  /** Quanto ci sta al massimo: nel suo orario, o in tutti gli orari del film. */
  maxOne: number;
  maxAll: number;
  exclude: string[];
  onClose: () => void;
  onSwap: (film: CatalogItem, scope: 'one' | 'all') => void;
}

/**
 * Non è il catalogo: qui si guarda cosa ci sta **lì**. Un film più lungo dello
 * spazio andrebbe a sbattere contro lo spettacolo dopo, quindi non compare.
 */
export default function SwapDialog({ show, occurrences, maxOne, maxAll, exclude, onClose, onSwap }: Props) {
  const [scope, setScope] = useState<'one' | 'all'>(occurrences > 1 ? 'all' : 'one');
  const [seed, setSeed] = useState(0);
  const [result, setResult] = useState<{ key: string; films: CatalogItem[] } | null>(null);
  const maxRuntime = scope === 'all' ? maxAll : maxOne;
  const key = `${scope}|${seed}|${maxRuntime}`;

  useEffect(() => {
    let cancelled = false;
    planningAlternatives({ band: show.band, maxRuntime, exclude, count: 12, seed })
      .then((rows) => {
        if (!cancelled) setResult({ key, films: rows as unknown as CatalogItem[] });
      })
      .catch(() => {
        if (!cancelled) setResult({ key, films: [] });
      });
    return () => {
      cancelled = true;
    };
    // `exclude` cambia identità a ogni render del genitore: conta la chiave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, show.band]);

  const loading = result?.key !== key;

  return (
    <Dialog open onClose={onClose} title={`Al posto di «${show.title}»`} showTitle>
      <p className={styles.tmdbHint}>Ci sta un film fino a {maxRuntime}′.</p>
      {occurrences > 1 && (
        <div className={styles.filters} style={{ gridTemplateColumns: '1fr 1fr', marginTop: 10 }}>
          <Button variant={scope === 'all' ? 'fill' : 'ghost'} onClick={() => setScope('all')}>
            Tutti e {occurrences}
          </Button>
          <Button variant={scope === 'one' ? 'fill' : 'ghost'} onClick={() => setScope('one')}>
            Solo le {show.time}
          </Button>
        </div>
      )}
      {loading ? (
        <p className={styles.tmdbHint}>Cerco cosa ci sta…</p>
      ) : result && result.films.length === 0 ? (
        <p className={styles.tmdbHint}>Nessun altro film in libreria sta in {maxRuntime}′ senza essere già in bozza.</p>
      ) : (
        <ul className={styles.tmdbList}>
          {result?.films.map((f) => (
            <li key={f.id}>
              <span>
                {f.title} <em>{[f.year, `${f.runtime ?? f.durationMin}′`].filter(Boolean).join(' · ')}</em>
              </span>
              <Button variant="ghost" onClick={() => onSwap(f, scope)}>Metti</Button>
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
        <Button variant="ghost" onClick={() => setSeed((s) => s + 1)} disabled={loading}>Fammene vedere altri</Button>
        <Button variant="ghost" onClick={onClose}>Chiudi</Button>
      </div>
    </Dialog>
  );
}
```

<!-- file: src/app/admin/(casa)/programma/_tavolo/DraftPanel.tsx -->
```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { planningCheckManualSlot, type ManualSlotCheck } from '@/actions/planningActions';
import Button from '@/components/cabina/Button';
import { useToast } from '@/components/cabina/Toast';
import { PROJECTION_SPECS, type ProjectionSpecCode } from '@/constants/projectionSpecs';
import type { ScheduledShow } from '@/services/scheduling/engine';
import { commitKey } from '../wizard/types';
import {
  clashesWithDraft,
  draftKey,
  maxRuntimeAt,
  minuteOfDay,
  removeShow,
  replaceShow,
  setSpecs,
  showFromSlot,
  swapFilm,
  type Draft,
} from './draft';
import { dayShort } from './labels';
import SwapDialog from './SwapDialog';
import styles from './BlockPanel.module.css';

interface Props {
  show: ScheduledShow;
  draft: Draft;
  roomId: number;
  from: string;
  targetDays: string[];
  existingOn: (day: string) => { start: number; end: number }[];
  update: (change: (d: Draft) => Draft) => void;
  onReselect: (key: string | null) => void;
}

const CLOCK = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function normalizeClock(v: string): string | null {
  const m = v.trim().match(CLOCK);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

export default function DraftPanel({ show, draft, roomId, from, targetDays, existingOn, update, onReselect }: Props) {
  const toast = useToast();
  const key = draftKey(show);
  const [moveDay, setMoveDay] = useState(show.day);
  const [moveTime, setMoveTime] = useState(show.time);
  const [result, setResult] = useState<{ key: string; check: ManualSlotCheck | null; error?: string } | null>(null);
  const [consent, setConsent] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const request = useRef(0);

  const clock = normalizeClock(moveTime);
  const changed = moveDay !== show.day || (clock !== null && clock !== show.time);
  const wanted = changed && clock ? `${moveDay}@${clock}` : null;
  const checking = wanted !== null && result?.key !== wanted;
  const check = wanted !== null && result?.key === wanted ? result.check : null;

  useEffect(() => {
    if (!wanted || !clock) return;
    const id = ++request.current;
    const timer = window.setTimeout(async () => {
      try {
        const c = await planningCheckManualSlot({ seatingPlanId: roomId, tmdbId: show.tmdbId, day: moveDay, time: clock, fromDate: from });
        if (request.current === id) setResult({ key: wanted, check: c });
      } catch {
        if (request.current === id) setResult({ key: wanted, check: null, error: 'Non sono riuscito a leggere la sala. Riprova.' });
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [wanted, clock, moveDay, roomId, from, show.tmdbId]);

  const slotStart = check?.slot ? minuteOfDay(check.slot) : null;
  const clash = check?.slot && slotStart !== null
    ? clashesWithDraft(draft, check.slot.day, slotStart, slotStart + show.runtime, key)
    : null;
  const conflicts = check?.conflicts ?? [];
  const needsConsent = (check?.soldTickets ?? 0) > 0;
  const canPlace = Boolean(check?.usable) && !clash && (!needsConsent || consent);

  const place = () => {
    if (!check?.slot || !canPlace) return;
    const next = showFromSlot(show, check.slot);
    update((d) =>
      replaceShow(d, key, next, {
        replaces: conflicts.map((c) => c.pretixId).filter((v): v is number => v != null),
        force: needsConsent,
        label: conflicts.map((c) => `«${c.title}» delle ${c.time}`).join(', ') || undefined,
        soldTickets: check.soldTickets,
        outsideHours: check.outsideHours,
      }),
    );
    onReselect(draftKey(next));
  };

  const pick = draft.picks[show.tmdbId];
  const specs = pick?.specs ?? [];
  const toggleSpec = (code: ProjectionSpecCode) =>
    update((d) => setSpecs(d, show.tmdbId, { specs: specs.includes(code) ? specs.filter((c) => c !== code) : [...specs, code] }));

  const siblings = draft.shows.filter((s) => s.tmdbId === show.tmdbId);
  const maxOne = maxRuntimeAt(draft, show.day, minuteOfDay(show), existingOn(show.day), key);
  const maxAll = Math.min(
    ...siblings.map((s) => maxRuntimeAt(draft, s.day, minuteOfDay(s), existingOn(s.day), draftKey(s))),
  );
  const exclude = [...new Set([...draft.shows.map((s) => s.tmdbId), ...draft.rejected])];
  const replacement = draft.replacements[commitKey(show)];

  return (
    <div className={styles.panel}>
      <button type="button" className={styles.close} onClick={() => onReselect(null)} aria-label="Chiudi">
        <X size={16} />
      </button>

      <header>
        <p className={styles.kicker}>In bozza · non ancora in sala</p>
        <h2 className={styles.title}>{show.title}</h2>
        <p className={styles.meta}>
          {dayShort(show.day)} · <span className={styles.clock}>{show.time} – {show.endTime}</span> · {show.runtime}′
        </p>
        {replacement && replacement.replaces.length > 0 && (
          <p className={styles.warnText}>
            Sostituirà {replacement.label ?? 'uno spettacolo in sala'}
            {replacement.soldTickets > 0 ? `, con ${replacement.soldTickets} biglietti venduti` : ''}.
          </p>
        )}
        {replacement?.outsideHours && <p className={styles.warnText}>Esce dall’orario d’apertura: l’hai scelto tu.</p>}
      </header>

      <section className={styles.group}>
        <span className={styles.label}>Orario</span>
        <div className={styles.fields}>
          <select value={moveDay} onChange={(e) => { setMoveDay(e.target.value); setConsent(false); }} aria-label="Giorno">
            {targetDays.map((d) => <option key={d} value={d}>{dayShort(d)}</option>)}
          </select>
          <input value={moveTime} onChange={(e) => { setMoveTime(e.target.value); setConsent(false); }} inputMode="numeric" aria-label="Orario" aria-invalid={clock === null ? true : undefined} />
        </div>
        {!changed && <p className={styles.hint}>Scrivi un orario, anche occupato: ti dico cosa comporta. Oppure trascina il blocco.</p>}
        {clock === null && <p className={styles.alarmText}>Scrivi l’orario come 18:30.</p>}
        {checking && <p className={styles.hint}>Guardo la sala…</p>}
        {result?.error && wanted && <p className={styles.alarmText}>{result.error}</p>}
        {check && (
          <>
            <p className={check.usable && !clash ? (conflicts.length || check.outsideHours ? styles.warnText : styles.okText) : styles.alarmText}>
              {clash ? `Si scontra con «${clash.title}» delle ${clash.time}, anche lui in bozza.` : check.message}
            </p>
            {check.warning && !clash && <p className={styles.warnText}>{check.warning}</p>}
            {needsConsent && !clash && (
              <label className={styles.consent}>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                Ho capito: alla conferma elimino {conflicts.length === 1 ? 'uno spettacolo' : `${conflicts.length} spettacoli`} con {check.soldTickets}{' '}
                {check.soldTickets === 1 ? 'biglietto venduto' : 'biglietti venduti'}.
              </label>
            )}
            {check.usable && !clash && (
              <Button variant={conflicts.length ? 'alarm' : 'fill'} onClick={place} disabled={!canPlace}>
                {conflicts.length
                  ? `Metti qui, al posto di ${conflicts.map((c) => `«${c.title}»`).join(' e ')}`
                  : `Metti a ${dayShort(moveDay)} ${check.slot?.time ?? clock}`}
              </Button>
            )}
          </>
        )}
      </section>

      <section className={styles.group}>
        <span className={styles.label}>Il film · vale per {siblings.length === 1 ? 'questo spettacolo' : `tutti e ${siblings.length} gli spettacoli`}</span>
        <div className={styles.specs}>
          {PROJECTION_SPECS.map((s) => (
            <label key={s.code} title={s.description}>
              <input type="checkbox" checked={specs.includes(s.code)} onChange={() => toggleSpec(s.code)} />
              {s.adminLabel}
            </label>
          ))}
        </div>
        <input
          className={styles.note}
          value={pick?.specsNote ?? ''}
          onChange={(e) => update((d) => setSpecs(d, show.tmdbId, { specsNote: e.target.value }))}
          placeholder="Nota di proiezione (es. copia restaurata)"
          aria-label="Nota di proiezione"
        />
      </section>

      <section className={styles.group}>
        <span className={styles.label}>Altro</span>
        <Button variant="ghost" onClick={() => setSwapOpen(true)}>⇄ Scambia il film</Button>
        <Button
          variant="alarm"
          onClick={() => {
            update((d) => removeShow(d, key));
            toast(`«${show.title}» tolto dalla bozza.`);
            onReselect(null);
          }}
        >
          Togli dalla bozza
        </Button>
      </section>

      {swapOpen && (
        <SwapDialog
          show={show}
          occurrences={siblings.length}
          maxOne={maxOne}
          maxAll={maxAll}
          exclude={exclude}
          onClose={() => setSwapOpen(false)}
          onSwap={(film, scope) => {
            setSwapOpen(false);
            update((d) => swapFilm(d, key, film, scope));
            toast(`Al posto di «${show.title}»: «${film.title}».`, 'ok');
            onReselect(draftKey({ tmdbId: film.tmdbId!, date: show.date, time: show.time }));
          }}
        />
      )}
    </div>
  );
}
```

In fondo a `BlockPanel.module.css` si aggiunge:

```css
.specs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 12.5px; }
.specs label { display: flex; gap: 6px; align-items: center; }
.specs input { accent-color: var(--c-amber); }
.note {
  min-height: 34px; padding: 0 10px; background: var(--c-bg-sunken); color: var(--c-ink);
  border: 1px solid var(--c-line); border-radius: var(--c-radius); font: inherit; font-size: 12.5px;
}
.note:focus { outline: none; border-color: var(--c-amber); }
```

- [ ] tipi + lint. **Commit** — `Il pannello della bozza: orario a mano, specifiche, scambia, togli`

---

### Task 5: La barra della bozza

<!-- file: src/app/admin/(casa)/programma/_tavolo/CommitBar.tsx -->
```tsx
'use client';

import { useMemo, useState } from 'react';
import Button from '@/components/cabina/Button';
import Dialog from '@/components/cabina/Dialog';
import { projectionSpecLabels } from '@/constants/projectionSpecs';
import { romeClock } from '@/services/scheduling/rome';
import { commitPayload, type Draft } from './draft';
import { dayShort } from './labels';
import type { CommitApi } from './useCommit';
import styles from './CommitBar.module.css';

interface Props {
  draft: Draft;
  savedAt: string | null;
  commit: CommitApi;
  onDiscard: () => void;
}

export default function CommitBar({ draft, savedAt, commit, onDiscard }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const payload = useMemo(() => commitPayload(draft), [draft]);
  const replacing = Object.values(draft.replacements).filter((r) => r.replaces.length > 0);
  const soldAtRisk = replacing.reduce((n, r) => n + r.soldTickets, 0);

  const byDay = useMemo(() => {
    const map = new Map<string, typeof payload>();
    for (const s of payload) map.set(s.date, [...(map.get(s.date) ?? []), s]);
    return [...map.entries()];
  }, [payload]);

  const n = draft.shows.length;
  const running = commit.phase === 'running';

  return (
    <>
      {n > 0 && (
        <div className={styles.bar}>
          <span className={styles.status}>
            <b>{n} in bozza</b>
            <span>{savedAt ? ` · salvata alle ${romeClock(new Date(savedAt))}` : ' · non ancora salvata'}</span>
            {replacing.length > 0 && <span className={styles.warn}> · {replacing.length} sostituzioni</span>}
          </span>
          <span className={styles.actions}>
            <Button variant="ghost" onClick={() => setDiscardOpen(true)} disabled={running}>Annulla bozza</Button>
            <Button variant="fill" onClick={() => setConfirmOpen(true)} disabled={running}>Manda in sala →</Button>
          </span>
        </div>
      )}

      {confirmOpen && (
        <Dialog open onClose={() => setConfirmOpen(false)} title={`Mandare in sala ${n} spettacoli?`} showTitle>
          <p className={styles.text}>Si creano su Pretix e compaiono subito sul sito, con la vendita aperta.</p>
          <div className={styles.summary}>
            {byDay.map(([date, shows]) => (
              <div key={date}>
                <p className={styles.day}>{dayShort(date)}</p>
                <ul>
                  {shows.map((s) => (
                    <li key={`${s.tmdbId}@${s.time}`}>
                      <span className={styles.time}>{s.time}</span> {s.title}
                      {s.specs && <em> · {projectionSpecLabels(s.specs, s.specsNote).join(' · ')}</em>}
                      {s.replaces && <em className={styles.warn}> · sostituisce</em>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {replacing.length > 0 && (
            <p className={styles.alarm}>
              {replacing.length === 1 ? 'Uno spettacolo in sala verrà eliminato' : `${replacing.length} spettacoli in sala verranno eliminati`} per fare posto
              {soldAtRisk > 0 ? `, con ${soldAtRisk} biglietti venduti da rimborsare a mano su Pretix` : ''}.
            </p>
          )}
          <div className={styles.dialogActions}>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Non ancora</Button>
            <Button
              variant="fill"
              onClick={() => {
                setConfirmOpen(false);
                void commit.start(payload);
              }}
            >
              Crea {n} spettacoli su Pretix
            </Button>
          </div>
        </Dialog>
      )}

      {commit.phase !== 'idle' && (
        <Dialog open onClose={() => { if (!running) commit.close(); }} title="In sala" showTitle={false}>
          <h2 className={styles.progressTitle}>
            {running ? 'Mando in sala…' : commit.failures.length ? 'Finito, con qualche intoppo' : 'In sala'}
          </h2>
          <div className={styles.progress}>
            <span style={{ width: `${Math.round((commit.progress.done / Math.max(commit.progress.total, 1)) * 100)}%` }} />
          </div>
          <p className={styles.text}>
            {running ? commit.progress.step : `${commit.created} ${commit.created === 1 ? 'spettacolo creato' : 'spettacoli creati'}.`}
          </p>
          {running && <p className={styles.hint}>Puoi anche chiudere il portatile: alla riapertura riprendo da dove ero.</p>}
          {commit.failures.length > 0 && (
            <ul className={styles.failures}>
              {commit.failures.map((f) => (
                <li key={f.key}><b>{f.label}</b> — {f.error}</li>
              ))}
            </ul>
          )}
          {!running && (
            <div className={styles.dialogActions}>
              {commit.failures.length > 0 && <Button variant="outline" onClick={() => void commit.retry()}>Riprova i falliti</Button>}
              <Button variant="fill" onClick={commit.close}>Chiudi</Button>
            </div>
          )}
        </Dialog>
      )}

      {commit.resumeOffer && commit.phase === 'idle' && (
        <Dialog open onClose={commit.declineResume} title="Una creazione rimasta a metà" showTitle>
          <p className={styles.text}>
            {commit.resumeOffer.done} spettacoli su {commit.resumeOffer.total} sono già in sala, ne mancano{' '}
            {commit.resumeOffer.total - commit.resumeOffer.done}. La riprendo da dove era? Quelli già creati non verranno rifatti.
          </p>
          <div className={styles.dialogActions}>
            <Button variant="ghost" onClick={commit.declineResume}>Lascia stare</Button>
            <Button variant="fill" onClick={commit.acceptResume}>Riprendi</Button>
          </div>
        </Dialog>
      )}

      {discardOpen && (
        <Dialog open onClose={() => setDiscardOpen(false)} title="Buttare la bozza?" showTitle>
          <p className={styles.text}>
            {n} {n === 1 ? 'spettacolo che non è ancora in sala sparisce' : 'spettacoli che non sono ancora in sala spariscono'}. Quello che è già su Pretix non si tocca.
          </p>
          <div className={styles.dialogActions}>
            <Button variant="ghost" onClick={() => setDiscardOpen(false)}>Tienila</Button>
            <Button variant="alarm" onClick={() => { setDiscardOpen(false); onDiscard(); }}>Butta la bozza</Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
```

<!-- file: src/app/admin/(casa)/programma/_tavolo/CommitBar.module.css -->
```css
.bar {
  position: sticky; bottom: 0; z-index: 20;
  display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;
  margin: 12px -24px 0; padding: 12px 24px;
  background: color-mix(in srgb, var(--c-bg-raised) 94%, transparent);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  border-top: 1px solid var(--c-amber);
}
.status { font-size: 13px; color: var(--c-dim); }
.status b { font-family: var(--c-font-mono); font-weight: 600; color: var(--c-amber); }
.warn { color: var(--c-amber); }
.actions { display: flex; gap: 8px; }

.text, .hint { margin: 0 0 10px; font-size: 13.5px; }
.hint { font-size: 12px; color: var(--c-dim); }
.summary { display: grid; gap: 10px; max-height: 40vh; overflow-y: auto; margin-bottom: 12px; padding-right: 4px; }
.summary ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; }
.summary li { font-family: var(--c-font-serif); font-size: 14px; }
.summary em { font-style: normal; font-family: var(--c-font-sans); font-size: 11.5px; color: var(--c-dim); }
.summary em.warn { color: var(--c-amber); }
.day { margin: 0 0 3px; font-family: var(--c-font-mono); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--c-dim); }
.time { font-family: var(--c-font-mono); font-size: 12px; color: var(--c-amber); margin-right: 6px; }
.alarm { margin: 0 0 12px; padding: 10px 12px; border-left: 2px solid var(--c-alarm); background: var(--c-alarm-soft); font-size: 13px; }

.progressTitle { margin: 0 0 12px; font-family: var(--c-font-serif); font-weight: 600; font-size: 22px; }
.progress { height: 4px; border-radius: 2px; background: var(--c-line); overflow: hidden; margin-bottom: 12px; }
.progress span { display: block; height: 100%; background: var(--c-amber); transition: width var(--c-slow); }
.failures { list-style: none; margin: 0 0 12px; padding: 0; display: grid; gap: 4px; font-size: 12.5px; color: var(--c-alarm); max-height: 30vh; overflow-y: auto; }

.dialogActions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }

@media (max-width: 767px) {
  .bar { margin: 12px -16px 0; padding: 10px 16px calc(10px + var(--c-bottombar-h)); }
  .actions { width: 100%; }
  .actions > * { flex: 1; }
}
```

- [ ] tipi + lint. **Commit** — `La barra della bozza: manda in sala, segui la creazione, riprendila`

---

### Task 6: Il tavolo mette insieme tutto

**`BlockPanel.tsx`:**
- nuova prop `onReplica: (tmdbId: string) => void`;
- il bottone "+ Aggiungi una replica" diventa `<Button variant="ghost" onClick={() => onReplica(block.tmdbId!)}>`, senza più link al wizard.

<!-- file: src/app/admin/(casa)/programma/_tavolo/Tavolo.tsx -->
```tsx
'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { catalogPreviewTmdb } from '@/actions/catalogActions';
import { planningFindSlots, planningSnapShow, type SlotProposal } from '@/actions/planningActions';
import Button from '@/components/cabina/Button';
import Dialog from '@/components/cabina/Dialog';
import { useToast } from '@/components/cabina/Toast';
import type { ScheduledShow } from '@/services/scheduling/engine';
import { MINUTES_PER_DAY, OPENING_MINUTE, daysBetweenISO, formatClock } from '@/services/scheduling/times';
import type { CatalogItem } from '../wizard/types';
import BlockPanel, { type MoveIntent } from './BlockPanel';
import CatalogDrawer from './CatalogDrawer';
import CommitBar from './CommitBar';
import DraftPanel from './DraftPanel';
import {
  addShow,
  draftBlocksOn,
  findDraft,
  rebase,
  replaceShow,
  showFromSlot,
  showsFor,
  visibleSlots,
  withoutCommitted,
} from './draft';
import { minuteAt, place, ticks } from './geometry';
import { dayShort, periodLabel } from './labels';
import type { TavoloData } from './load';
import { SPANS, shiftFrom, toSearch, type Span } from './query';
import { useCommit } from './useCommit';
import { useDraft } from './useDraft';
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

function runtimeOf(f: CatalogItem | null): number {
  return f ? f.runtime ?? f.durationMin ?? 0 : 0;
}

export default function Tavolo({ data }: { data: TavoloData }) {
  const router = useRouter();
  const toast = useToast();
  const isMobile = useSyncExternalStore(subscribeMobile, () => window.matchMedia(MOBILE).matches, () => false);
  const [selected, setSelected] = useState<string | null>(null);
  const [intent, setIntent] = useState<MoveIntent | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [film, setFilm] = useState<CatalogItem | null>(null);
  const [catalogSheet, setCatalogSheet] = useState(false);
  const [slotResult, setSlotResult] = useState<{ key: string; slots: SlotProposal[]; reason?: string } | null>(null);
  /** Dove hai afferrato il blocco, in minuti dal suo inizio: il film non "salta" al rilascio. */
  const grabMinutes = useRef(0);
  /** I film del catalogo che si stanno trascinando, per riconoscerli al rilascio. */
  const films = useRef(new Map<string, CatalogItem>());

  const { week, roomId } = data;
  const { draft, savedAt, update, discard } = useDraft(roomId, data.from);
  const commit = useCommit(roomId, (created) => {
    update((d) => withoutCommitted(d, created));
    router.refresh();
  });

  const found = selected && week ? findBlock(week, selected) : null;
  const draftShow = selected?.startsWith('d:') && draft ? findDraft(draft, selected) : null;
  const targetDays = week ? week.days.filter((d) => !d.isPast).map((d) => d.date) : [];

  // ── Posti accesi per il film scelto ────────────────────────────────────
  const slotWanted = film?.tmdbId && roomId !== null ? `${film.tmdbId}@${roomId}@${data.from}@${data.days}` : null;
  useEffect(() => {
    if (!slotWanted || !film?.tmdbId || roomId === null) return;
    let cancelled = false;
    planningFindSlots({ seatingPlanId: roomId, tmdbId: film.tmdbId, fromDate: data.from, maxDays: data.days, horizonDays: data.days })
      .then((res) => {
        if (!cancelled) setSlotResult({ key: slotWanted, slots: res.days.flatMap((d) => d.slots), reason: res.reason });
      })
      .catch(() => {
        if (!cancelled) setSlotResult({ key: slotWanted, slots: [], reason: 'Non sono riuscito a leggere la sala.' });
      });
    return () => {
      cancelled = true;
    };
  }, [slotWanted, film?.tmdbId, roomId, data.from, data.days]);

  const lit = useMemo(
    () => (draft && film && slotResult?.key === slotWanted ? visibleSlots(slotResult.slots, draft, runtimeOf(film)) : []),
    [draft, film, slotResult, slotWanted],
  );
  const litLoading = Boolean(film && slotWanted && slotResult?.key !== slotWanted);

  // ── Navigazione ────────────────────────────────────────────────────────
  const go = (patch: Partial<{ room: number; from: string; days: Span; onlyEmpty: boolean }>, replace = false) => {
    if (roomId === null) return;
    const next = { room: roomId, from: data.from, days: data.days, onlyEmpty: data.onlyEmpty, ...patch };
    setSelected(null);
    setIntent(null);
    const url = `/admin/programma${toSearch(next)}`;
    if (replace) router.replace(url);
    else router.push(url);
  };

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[role="dialog"]')) return;
      setSelected(null);
      setIntent(null);
      setFilm(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const chooseRoom = (id: number) => {
    try {
      localStorage.setItem('defaultSalaId', String(id));
    } catch {
      /* vale solo per questa visita */
    }
    go({ room: id });
  };

  const close = () => {
    setSelected(null);
    setIntent(null);
  };

  const chooseFilm = (f: CatalogItem | null) => {
    setFilm(f);
    setCatalogSheet(false);
    if (f) {
      if (f.tmdbId) films.current.set(f.tmdbId, f);
      setSelected(null);
    }
  };

  // ── Bozza: mettere, spostare ───────────────────────────────────────────
  const globalMinute = (day: string, minute: number) => daysBetweenISO(data.from, day) * MINUTES_PER_DAY + minute;

  const snap = async (show: ScheduledShow, desired: number) => {
    if (roomId === null || !draft) return null;
    const res = await planningSnapShow(show, desired, {
      seatingPlanId: roomId,
      startDate: data.from,
      days: data.days,
      otherShows: showsFor(draft, data.from),
    });
    if (!res.show) toast(res.reason ?? 'Qui non c’è spazio.', 'alarm');
    return res.show;
  };

  const placeFilm = async (f: CatalogItem, day: string, minute: number) => {
    const runtime = runtimeOf(f);
    if (!f.tmdbId || runtime <= 0) {
      toast('Di questo film non conosco la durata: non so dove metterlo.', 'alarm');
      return;
    }
    const m = Math.max(minute, OPENING_MINUTE);
    const start = globalMinute(day, m);
    const skeleton: ScheduledShow = {
      tmdbId: f.tmdbId,
      title: f.title,
      runtime,
      posterPath: f.posterPath ?? undefined,
      day,
      date: day,
      time: formatClock(m),
      endTime: formatClock(m + runtime),
      startMinute: start,
      endMinute: start + runtime,
      band: 'evening',
      locked: true,
    };
    const placed = await snap(skeleton, start);
    if (!placed) return;
    update((d) => addShow(d, placed, f));
    toast(`«${f.title}» in bozza, ${dayShort(placed.day)} alle ${placed.time}.`, 'ok');
  };

  const moveDraft = async (key: string, day: string, minute: number) => {
    const show = draft ? findDraft(draft, key) : null;
    if (!show) return;
    const placed = await snap(rebase(show, data.from), globalMinute(day, Math.max(minute, OPENING_MINUTE)));
    if (!placed) return;
    update((d) => replaceShow(d, key, placed));
    setSelected(null);
  };

  const addSlot = (slot: SlotProposal) => {
    if (!film?.tmdbId) return;
    const show = showFromSlot({ tmdbId: film.tmdbId, title: film.title, runtime: runtimeOf(film), posterPath: film.posterPath ?? undefined }, slot);
    update((d) => addShow(d, show, film));
    toast(`«${film.title}» in bozza, ${dayShort(slot.day)} alle ${slot.time}.`, 'ok');
  };

  const drop = (e: React.DragEvent<HTMLDivElement>, day: TavoloDay) => {
    e.preventDefault();
    const payload = e.dataTransfer.getData('text/plain') || dragKey;
    setDragKey(null);
    if (!payload || !week || day.isPast) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const axisLength = week.axis.end - week.axis.start;
    const minute = minuteAt((e.clientX - rect.left) / rect.width - grabMinutes.current / axisLength, week.axis);
    grabMinutes.current = 0;

    if (payload.startsWith('film:')) {
      const f = films.current.get(payload.slice(5));
      if (f) void placeFilm(f, day.date, minute);
      return;
    }
    if (payload.startsWith('d:')) {
      void moveDraft(payload, day.date, minute);
      return;
    }
    setSelected(payload);
    setIntent({ day: day.date, time: formatClock(minute) });
  };

  const startDrag = (e: React.DragEvent<HTMLElement>, key: string, start: number, end: number) => {
    const r = e.currentTarget.getBoundingClientRect();
    grabMinutes.current = ((e.clientX - r.left) / r.width) * (end - start);
    e.dataTransfer.setData('text/plain', key);
    e.dataTransfer.effectAllowed = 'move';
    setDragKey(key);
  };

  const replica = async (tmdbId: string) => {
    try {
      const f = await catalogPreviewTmdb(tmdbId);
      if (!f) throw new Error();
      chooseFilm(f as unknown as CatalogItem);
      toast('Scegli uno dei posti accesi, o trascina il film dal catalogo.');
    } catch {
      toast('Non riesco a leggere questo film.', 'alarm');
    }
  };

  const changed = (opts?: { keepOpen?: boolean }) => {
    if (!opts?.keepOpen) close();
    router.refresh();
  };

  // ── Cassetto ───────────────────────────────────────────────────────────
  const gapMinutes = useMemo(() => (week ? week.days.flatMap((d) => (d.isPast ? [] : d.gaps.map((g) => g.minutes))) : []), [week]);
  const inDraft = useMemo(() => new Set(draft?.shows.map((s) => s.tmdbId) ?? []), [draft]);
  const existingOn = (day: string) => week?.days.find((d) => d.date === day)?.blocks.map((b) => ({ start: b.start, end: b.end })) ?? [];

  const catalog = (
    <CatalogDrawer
      gaps={gapMinutes}
      selected={film?.tmdbId ?? null}
      inDraft={inDraft}
      onSelect={chooseFilm}
      onDragFilm={(f) => {
        if (f.tmdbId) films.current.set(f.tmdbId, f);
        grabMinutes.current = 0;
        setDragKey(`film:${f.tmdbId}`);
      }}
    />
  );

  const panel =
    found && roomId !== null ? (
      <BlockPanel
        key={`${found.block.key}@${intent?.day ?? ''}${intent?.time ?? ''}`}
        block={found.block}
        day={found.day}
        targetDays={targetDays}
        roomId={roomId}
        from={data.from}
        intent={intent}
        onClose={close}
        onChanged={changed}
        onReplica={replica}
      />
    ) : draftShow && draft && roomId !== null ? (
      <DraftPanel
        key={selected!}
        show={draftShow}
        draft={draft}
        roomId={roomId}
        from={data.from}
        targetDays={targetDays}
        existingOn={existingOn}
        update={update}
        onReselect={setSelected}
      />
    ) : null;

  const title = data.days === 1 ? 'La giornata' : data.days === 7 ? 'La settimana' : 'Il periodo';

  return (
    <div className={styles.room}>
      <header className={styles.head}>
        <div>
          <div className={styles.controls}>
            <select className={styles.select} value={roomId ?? ''} onChange={(e) => chooseRoom(Number(e.target.value))} aria-label="Sala">
              {data.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
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
            <select className={styles.select} value={data.days} onChange={(e) => go({ days: Number(e.target.value) as Span })} aria-label="Ampiezza">
              {SPANS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <h1 className={styles.title}>{title}</h1>
        </div>
        <div className={styles.actions}>
          <Button variant="outline" className={styles.mobileOnly} onClick={() => setCatalogSheet(true)}>
            <Plus size={14} /> Film
          </Button>
          <Button variant={data.onlyEmpty ? 'fill' : 'ghost'} onClick={() => go({ onlyEmpty: !data.onlyEmpty }, true)}>Solo vuote</Button>
          <Button href={PRETIX_URL} variant="ghost">Pretix ↗</Button>
          <Button href={`/admin/programma/wizard${roomId !== null ? `?room=${roomId}` : ''}`} variant="ghost">Wizard</Button>
        </div>
      </header>

      {film && (
        <div className={styles.filmBar}>
          <span>
            <b>{film.title}</b>{' '}
            {litLoading
              ? '· cerco dove ci sta…'
              : lit.length
                ? `· ${lit.length} ${lit.length === 1 ? 'posto acceso' : 'posti accesi'}: clicca quello che vuoi`
                : `· ${slotResult?.reason ?? 'nessun posto libero in questo periodo'}`}
          </span>
          <button type="button" onClick={() => setFilm(null)}>Lascia stare</button>
        </div>
      )}

      {!week ? (
        <p className={styles.empty}>
          {data.rooms.length === 0
            ? 'Non trovo le sale su Pretix: forse in questo momento non risponde. Riprova fra poco.'
            : 'Nessuna sala scelta.'}
        </p>
      ) : (
        <div className={styles.table}>
          <div className={styles.timeline}>
            <div className={styles.ruler} aria-hidden>
              <span />
              <div className={styles.ticks}>
                {ticks(week.axis).map((t) => <span key={t.minute} style={{ left: `${t.left}%` }}>{t.label}</span>)}
              </div>
            </div>

            {week.days.map((day) => {
              const drafts = draft ? draftBlocksOn(draft, day.date) : [];
              const slots = lit.filter((s) => s.day === day.date);
              return (
                <div key={day.date} className={styles.day} data-past={day.isPast || undefined} data-weekend={day.isWeekend || undefined}>
                  <span className={styles.dayLabel}>{dayShort(day.date)}</span>

                  <div
                    className={styles.track}
                    data-drop={dragKey && !day.isPast ? '' : undefined}
                    onDragOver={(e) => { if (dragKey && !day.isPast) e.preventDefault(); }}
                    onDrop={(e) => drop(e, day)}
                    onClick={(e) => { if (e.target === e.currentTarget) close(); }}
                  >
                    {day.gaps.map((g) => {
                      const pos = place(g.start, g.end, week.axis);
                      return <span key={`gap-${g.start}`} className={styles.gap} style={{ left: `${pos.left}%`, width: `${pos.width}%` }} title={`Libero ${g.from} – ${g.to}`} />;
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
                          onDragStart={(e) => startDrag(e, b.key, b.start, b.end)}
                          onDragEnd={() => setDragKey(null)}
                          onClick={() => { setSelected(b.key); setIntent(null); }}
                          title={`${b.time} ${b.title}`}
                        >
                          <span className={styles.blockTime}>{b.time}</span>
                          <span className={styles.blockTitle}>{b.title}</span>
                        </button>
                      );
                    })}
                    {drafts.map((b) => {
                      const pos = place(b.start, b.end, week.axis);
                      return (
                        <button
                          key={b.key}
                          type="button"
                          className={`${styles.block} ${styles.draft}`}
                          style={{ left: `${pos.left}%`, width: `${pos.width}%` }}
                          data-selected={selected === b.key || undefined}
                          draggable={!day.isPast}
                          onDragStart={(e) => startDrag(e, b.key, b.start, b.end)}
                          onDragEnd={() => setDragKey(null)}
                          onClick={() => { setSelected(b.key); setIntent(null); }}
                          title={`In bozza: ${b.show.time} ${b.show.title}`}
                        >
                          <span className={styles.blockTime}>{b.show.time}</span>
                          <span className={styles.blockTitle}>{b.show.title}</span>
                        </button>
                      );
                    })}
                    {slots.map((s) => {
                      const pos = place(s.start, s.end, week.axis);
                      return (
                        <button
                          key={`slot-${s.day}-${s.time}`}
                          type="button"
                          className={styles.slot}
                          style={{ left: `${pos.left}%`, width: `${pos.width}%` }}
                          onClick={() => addSlot(s)}
                          title={`Metti «${film?.title}» alle ${s.time}`}
                        >
                          + {s.time}
                        </button>
                      );
                    })}
                  </div>

                  <ol className={styles.dayList}>
                    {day.blocks.length === 0 && drafts.length === 0 && slots.length === 0 && <li className={styles.dayListEmpty}>Nessuno spettacolo</li>}
                    {day.blocks.map((b) => (
                      <li key={b.key}>
                        <button type="button" onClick={() => { setSelected(b.key); setIntent(null); }} data-dim={(data.onlyEmpty && b.sold !== 0) || undefined}>
                          <span className={styles.blockTime}>{b.time}</span>
                          <span className={styles.listTitle}>{b.title}</span>
                          <span className={styles.listSeats}>{seatNote(b)}</span>
                        </button>
                      </li>
                    ))}
                    {drafts.map((b) => (
                      <li key={b.key}>
                        <button type="button" data-draft="" onClick={() => setSelected(b.key)}>
                          <span className={styles.blockTime}>{b.show.time}</span>
                          <span className={styles.listTitle}>{b.show.title}</span>
                          <span className={styles.listSeats}>bozza</span>
                        </button>
                      </li>
                    ))}
                    {slots.map((s) => (
                      <li key={`slot-${s.time}`}>
                        <button type="button" data-slot="" onClick={() => addSlot(s)}>
                          <span className={styles.blockTime}>{s.time}</span>
                          <span className={styles.listTitle}>+ {film?.title}</span>
                          <span className={styles.listSeats}>metti qui</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>

          <aside className={styles.side}>{!isMobile && (panel ?? catalog)}</aside>
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

      {draft && <CommitBar draft={draft} savedAt={savedAt} commit={commit} onDiscard={() => void discard()} />}

      {isMobile && panel && (
        <Dialog open onClose={close} title="Spettacolo" variant="sheet">
          {panel}
        </Dialog>
      )}
      {isMobile && catalogSheet && !panel && (
        <Dialog open onClose={() => setCatalogSheet(false)} title="Catalogo" variant="sheet">
          <div className={styles.sheetCatalog}>{catalog}</div>
        </Dialog>
      )}
    </div>
  );
}
```

In fondo a `Tavolo.module.css` si aggiunge:

```css
.draft {
  background: rgba(232, 163, 61, 0.08);
  color: var(--c-amber);
  border: 1px dashed var(--c-amber);
  border-left-width: 1px;
}
.draft:hover { background: rgba(232, 163, 61, 0.16); }
.draft[data-selected] { background: rgba(232, 163, 61, 0.22); }

.slot {
  position: absolute; top: 3px; bottom: 3px; z-index: 3;
  display: grid; place-items: center; min-width: 0; padding: 0 4px; overflow: hidden;
  background: rgba(232, 163, 61, 0.05); color: var(--c-amber);
  border: 1px solid var(--c-amber); border-radius: 3px;
  font-family: var(--c-font-mono); font-size: 10px; white-space: nowrap; cursor: pointer;
  animation: glow 1.6s ease-in-out infinite;
}
.slot:hover { background: var(--c-amber); color: var(--c-amber-ink); animation: none; }
@keyframes glow { 50% { box-shadow: 0 0 0 3px var(--c-amber-soft); } }

.filmBar {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  margin-bottom: 10px; padding: 8px 12px; border-radius: var(--c-radius);
  background: var(--c-amber-soft); border: 1px solid var(--c-amber); font-size: 13px;
}
.filmBar b { font-family: var(--c-font-serif); font-weight: 600; }
.filmBar button { background: none; border: 0; color: var(--c-amber); font: inherit; font-size: 12.5px; cursor: pointer; text-decoration: underline; }

.mobileOnly { display: none; }
.sheetCatalog { height: 70dvh; }

@media (max-width: 767px) {
  .mobileOnly { display: inline-flex; }
  .dayList button[data-draft] { color: var(--c-amber); }
  .dayList button[data-slot] { color: var(--c-amber); border-top-style: dashed; }
}
```

- [ ] `npx vitest run && npx tsc --noEmit && eslint` sui file del tavolo.
- [ ] **Commit** — `Sul tavolo si programma: trascini un film, accendi i posti, mandi in sala`

---

### Task 7: Consegna

- [ ] Lista per Giovanni (con il suo dev server):
  1. Il cassetto a destra è il catalogo: le corsie, la ricerca, i filtri, "Cercalo su TMDB".
  2. Trascina un film su un buco: compare tratteggiato in ambra all'orario elegante più vicino, e l'avviso lo conferma.
  3. Clicca un film: in alto "N posti accesi", sulla settimana i riquadri "+ 18:30". Un clic ne mette uno in bozza.
  4. Clicca un blocco in bozza e prova:
     - un orario a mano libero;
     - un orario occupato da uno spettacolo in sala, che propone la sostituzione;
     - le specifiche e la nota;
     - "Scambia" su uno e su tutti;
     - "Togli".
  5. Ricarica la pagina: la bozza è ancora lì, "salvata alle…".
  6. **"Manda in sala" solo con uno spettacolo di prova**, da eliminare dopo dal tavolo. Guarda la barra di avanzamento, poi il blocco diventa pieno.
  7. Sul tavolo, "+ Aggiungi una replica" su uno spettacolo in sala accende i posti del suo film.
  8. Sul telefono: "+ Film" apre il catalogo, un clic sul film e poi su "metti qui".
