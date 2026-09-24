# Gestionale Cabina — Tappa 3b-2: Riempi i buchi, e il wizard se ne va

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **In questo progetto si esegue inline** (Giovanni non vuole agenti delegati).

**Goal:**
- **"✦ Riempi i buchi"** sul tavolo:
  - **"Scegli tu"** è l'autoprogrammazione: il cinema sceglie i film dalla libreria ed evita quelli scartati;
  - **"Con questi film"** fa scegliere a te, con repliche e fascia per ogni film;
  - in entrambi i casi si sceglie l'intensità: Rilassata, Normale o Festival.
- **"Rigenera"** rimescola gli spettacoli messi dal motore.
- **"Blocca qui"** fissa uno spettacolo messo dal motore.
- Poi il **wizard sparisce**: `/admin/programma/wizard` e `?tmdb=` portano al tavolo.

**Architecture:**
- **Due regole pure in `draft.ts`, testate.**
  - *Riempire*: tutto ciò che è in bozza nel periodo va al motore come bloccato. Il motore conta anche i bloccati fra le repliche (`film.placed++` in `engine.ts`), quindi a ogni film si somma quello che ha già.
  - *Rigenerare*: restano fermi solo i bloccati. Gli altri si rimescolano con gli stessi numeri.
- **Le azioni del server sono quelle di oggi:** `planningAutoPlan` per scegliere i film, `planningGenerate` per piazzarli.
- **Gli spettacoli messi dal motore sono `locked: false`** e sul tavolo hanno il bordo a puntini. Qualunque gesto tuo li blocca.

**Spec:** §3 della specifica del gestionale.

## Mappa dei file (in `src/app/admin/(casa)/programma/`)

| File | Azione |
|---|---|
| `_tavolo/types.ts` | crea: i tipi che il tavolo usava dal wizard, ridotti a quelli vivi |
| `_tavolo/draft.ts` + test | aggiunge `inWindow`, `fillRequest`, `regenerateRequest`, `mergeFilled`, `mergeRegenerated`, `setLocked`, `unlockedIn` |
| `_tavolo/FillDialog.tsx` | crea |
| `_tavolo/Tavolo.tsx`, `.module.css`, `DraftPanel.tsx` | Riempi, Rigenera, Blocca, `?tmdb=` |
| `_tavolo/query.ts` + test, `load.ts`, `page.tsx` | via `wizardRedirect`, dentro `tmdb` |
| `wizard/` | elimina |
| `next.config.ts` + test | `/admin/programma/wizard` → `/admin/programma` |
| `src/components/cabina/rooms.ts`, `src/components/Admin/AdminPanel.tsx` | parole e commenti |

---

### Task 1: I tipi del tavolo

<!-- file: src/app/admin/(casa)/programma/_tavolo/types.ts -->
```ts
import type { ProjectionSpecCode } from '@/constants/projectionSpecs';
import type { ScheduledShow } from '@/services/scheduling/engine';
import type { Band } from '@/services/scheduling/times';

/** Un film del catalogo, come lo vede il tavolo. */
export interface CatalogItem {
  id: number;
  title: string;
  year: number | null;
  durationMin: number | null;
  runtime: number | null;
  director: string | null;
  tmdbId: string | null;
  posterPath: string | null;
  genres: string[];
  voteAverage: number | null;
  awardLabels: string[];
  inPlex: boolean;
  /** Le librerie Plex in cui esiste: `["Film"]`, `["4K"]` o entrambe. */
  plexLibraries?: string[];
  verifyStatus: string;
  scheduledCount: number;
  /** `false` = preso da TMDB e mai scritto in catalogo: vive solo nella bozza. */
  inCatalog?: boolean;
}

/** Un film in bozza, con le scelte che valgono per tutti i suoi spettacoli. */
export interface FilmPick {
  film: CatalogItem;
  replicas?: number;
  preferredBand?: Band;
  /** 4K, Dolby Vision, Atmos, IMAX: si copiano su ogni spettacolo alla conferma. */
  specs?: ProjectionSpecCode[];
  /** La riga libera, per ciò che le caselle non prevedono. */
  specsNote?: string;
}

/**
 * Se la copia in libreria è quella 4K, il 4K parte spuntato: è l'unica cosa
 * che il catalogo sa già con certezza. Il resto dipende da come si proietta
 * quella sera, e lo decide chi programma.
 */
export function defaultSpecsFor(film: CatalogItem): ProjectionSpecCode[] {
  const libraries = film.plexLibraries ?? [];
  return libraries.some((l) => l.trim().toUpperCase() === '4K') ? ['4K'] : [];
}

/**
 * Identità di uno spettacolo alla conferma. Deve coincidere con `showKeyOf` di
 * `commitRunner`: è la chiave con cui il lavoro riferisce i falliti.
 */
export function commitKey(s: Pick<ScheduledShow, 'tmdbId' | 'date' | 'time'>): string {
  return `${s.tmdbId}@${s.date}T${s.time}`;
}

export const BAND_CHOICES: { value: Band | ''; label: string }[] = [
  { value: '', label: 'Fascia: indifferente' },
  { value: 'matinee', label: 'Matinée' },
  { value: 'afternoon', label: 'Pomeriggio' },
  { value: 'evening', label: 'Prima serata' },
  { value: 'night', label: 'Seconda serata' },
];
```

- [ ] Tutti gli import `'../wizard/types'` del tavolo diventano `'./types'`. In `draft.ts` `type Pick as FilmPick` diventa `type FilmPick`, e `draftKey` usa `commitKey(show)` senza cast.
- [ ] `tsc` muto, 298 test verdi. **Commit** — `Il tavolo ha i suoi tipi, e non dipende più dal wizard`

---

### Task 2: Riempire e rigenerare, puri

- [ ] **Step 1: Test** (file a parte, `draft.fill.test.ts`)

<!-- file: src/app/admin/(casa)/programma/_tavolo/draft.fill.test.ts -->
```ts
import { describe, it, expect } from 'vitest';
import type { ScheduledShow } from '@/services/scheduling/engine';
import type { CatalogItem } from './types';
import {
  addShow,
  draftKey,
  emptyDraft,
  fillRequest,
  inWindow,
  mergeFilled,
  mergeRegenerated,
  rebase,
  regenerateRequest,
  setLocked,
  unlockedIn,
} from './draft';

const FROM = '2026-09-28';

function film(tmdbId: string, title: string, runtime: number): CatalogItem {
  return {
    id: Number(tmdbId), title, year: 2020, durationMin: runtime, runtime, director: null, tmdbId,
    posterPath: null, genres: [], voteAverage: null, awardLabels: [], inPlex: true, verifyStatus: 'ok', scheduledCount: 0,
  };
}

function show(tmdbId: string, title: string, day: string, time: string, runtime: number, locked = true): ScheduledShow {
  return rebase({ tmdbId, title, runtime, day, date: day, time, endTime: '', startMinute: 0, endMinute: 0, band: 'evening', locked }, FROM);
}

const DUEL = film('839', 'Duel', 90);
const ANORA = film('1064213', 'Anora', 139);
const FLOW = film('823219', 'Flow', 84);

/** Duel bloccato martedì, Anora del motore mercoledì, Flow bloccato fuori periodo. */
function base() {
  let d = addShow(emptyDraft(FROM), show('839', 'Duel', '2026-09-29', '18:00', 90), DUEL);
  d = mergeFilled(d, [show('1064213', 'Anora', '2026-09-30', '21:00', 139, false)], [ANORA]);
  d = addShow(d, show('823219', 'Flow', '2026-10-10', '18:00', 84), FLOW);
  return d;
}

describe('il periodo', () => {
  it('sa chi ci sta dentro', () => {
    expect(inWindow({ day: '2026-09-28' }, FROM, 7)).toBe(true);
    expect(inWindow({ day: '2026-10-04' }, FROM, 7)).toBe(true);
    expect(inWindow({ day: '2026-10-05' }, FROM, 7)).toBe(false);
    expect(inWindow({ day: '2026-09-27' }, FROM, 7)).toBe(false);
  });

  it('conta gli spettacoli messi dal motore', () => {
    expect(unlockedIn(base(), FROM, 7)).toBe(1);
  });
});

describe('riempire', () => {
  it('tiene fermo tutto ciò che è in bozza, e somma le repliche a quelle che ci sono', () => {
    const req = fillRequest(base(), FROM, 7, [{ film: FLOW, replicas: 2 }, { film: DUEL, replicas: 1 }, { film: ANORA }]);
    expect(req.films).toEqual([
      { tmdbId: '823219', replicas: 2, preferredBand: undefined },
      { tmdbId: '839', replicas: 2, preferredBand: undefined },
      { tmdbId: '1064213', replicas: undefined, preferredBand: undefined },
    ]);
    expect(req.locked.map((s) => [s.title, s.locked, s.startMinute])).toEqual([
      ['Duel', true, 1440 + 1080],
      ['Anora', true, 2 * 1440 + 1260],
    ]);
  });

  it('i film già in bozza e non scelti restano con i loro numeri', () => {
    const req = fillRequest(base(), FROM, 7, []);
    expect(req.films).toEqual([
      { tmdbId: '839', replicas: 1 },
      { tmdbId: '1064213', replicas: 1 },
    ]);
  });

  it('del risultato entra solo il nuovo, come messo dal motore, con il film fra le scelte', () => {
    const d = mergeFilled(
      emptyDraft(FROM),
      [show('839', 'Duel', '2026-09-29', '18:00', 90, true), show('823219', 'Flow', '2026-09-29', '21:00', 84, false)],
      [FLOW],
    );
    expect(d.shows.map((s) => [s.title, s.locked])).toEqual([['Flow', false]]);
    expect(d.picks['823219'].film.title).toBe('Flow');
  });
});

describe('rigenerare', () => {
  it('lascia fermi solo i bloccati, con gli stessi numeri', () => {
    const req = regenerateRequest(base(), FROM, 7);
    expect(req.films).toEqual([
      { tmdbId: '839', replicas: 1 },
      { tmdbId: '1064213', replicas: 1 },
    ]);
    expect(req.locked.map((s) => s.title)).toEqual(['Duel']);
  });

  it('toglie i vecchi del motore nel periodo e mette i nuovi', () => {
    const d = mergeRegenerated(base(), FROM, 7, [
      show('839', 'Duel', '2026-09-29', '18:00', 90, true),
      show('1064213', 'Anora', '2026-10-02', '20:00', 139, false),
    ]);
    expect(d.shows.map((s) => [s.title, s.day, s.locked])).toEqual([
      ['Duel', '2026-09-29', true],
      ['Flow', '2026-10-10', true],
      ['Anora', '2026-10-02', false],
    ]);
  });
});

describe('bloccare', () => {
  it('uno spettacolo del motore diventa tuo', () => {
    const d = base();
    const anora = d.shows.find((s) => s.title === 'Anora')!;
    expect(setLocked(d, draftKey(anora), true).shows.find((s) => s.title === 'Anora')?.locked).toBe(true);
  });
});
```

- [ ] **Step 2:** FAIL (le funzioni non esistono).

- [ ] **Step 3: Implementazione** (in fondo a `draft.ts`, e `Band` fra gli import già presenti)

```ts
/** Lo spettacolo cade nel periodo che il tavolo sta guardando? */
export function inWindow(show: Pick<ScheduledShow, 'day'>, from: string, days: number): boolean {
  const i = daysBetweenISO(from, show.day);
  return i >= 0 && i < days;
}

export function unlockedIn(draft: Draft, from: string, days: number): number {
  return draft.shows.filter((s) => !s.locked && inWindow(s, from, days)).length;
}

export interface FillChoice {
  film: CatalogItem;
  /** Quanti spettacoli in più; vuoto = decide il motore. */
  replicas?: number;
  band?: Band;
}

export interface FilmChoice {
  tmdbId: string;
  replicas?: number;
  preferredBand?: Band;
}

function countsOf(shows: ScheduledShow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of shows) counts.set(s.tmdbId, (counts.get(s.tmdbId) ?? 0) + 1);
  return counts;
}

/**
 * "Riempi i buchi": tutto ciò che è già in bozza resta dov'è — va al motore come
 * bloccato — e i film scelti prendono solo lo spazio rimasto. Il motore conta
 * anche i bloccati fra le repliche, quindi a ogni film si somma quello che ha.
 */
export function fillRequest(
  draft: Draft,
  from: string,
  days: number,
  extra: FillChoice[],
): { films: FilmChoice[]; locked: ScheduledShow[] } {
  const inside = draft.shows.filter((s) => inWindow(s, from, days));
  const counts = countsOf(inside);
  const films: FilmChoice[] = [];
  const seen = new Set<string>();
  for (const e of extra) {
    const id = e.film.tmdbId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const already = counts.get(id) ?? 0;
    films.push({ tmdbId: id, replicas: e.replicas == null ? undefined : already + e.replicas, preferredBand: e.band });
  }
  for (const [tmdbId, replicas] of counts) if (!seen.has(tmdbId)) films.push({ tmdbId, replicas });
  return { films, locked: inside.map((s) => ({ ...rebase(s, from), locked: true })) };
}

/** "Rigenera": restano fermi solo i bloccati; gli altri si rimescolano, con gli stessi numeri. */
export function regenerateRequest(draft: Draft, from: string, days: number): { films: FilmChoice[]; locked: ScheduledShow[] } {
  const inside = draft.shows.filter((s) => inWindow(s, from, days));
  return {
    films: [...countsOf(inside)].map(([tmdbId, replicas]) => ({ tmdbId, replicas })),
    locked: inside.filter((s) => s.locked).map((s) => rebase(s, from)),
  };
}

function placeUnlocked(draft: Draft, shows: ScheduledShow[]): Draft {
  return settle({ ...draft, shows: [...draft.shows, ...shows.map((s) => ({ ...rebase(s, draft.origin), locked: false }))] });
}

/** Del risultato entra solo ciò che il motore ha aggiunto. */
export function mergeFilled(draft: Draft, generated: ScheduledShow[], films: CatalogItem[]): Draft {
  const picks = { ...draft.picks };
  for (const f of films) if (f.tmdbId && !picks[f.tmdbId]) picks[f.tmdbId] = { film: f, specs: defaultSpecsFor(f) };
  return placeUnlocked({ ...draft, picks }, generated.filter((s) => !s.locked));
}

export function mergeRegenerated(draft: Draft, from: string, days: number, generated: ScheduledShow[]): Draft {
  const kept = draft.shows.filter((s) => s.locked || !inWindow(s, from, days));
  const dropped = new Set(draft.shows.filter((s) => !kept.includes(s)).map((s) => commitKey(s)));
  return placeUnlocked(
    { ...draft, shows: kept, replacements: omit(draft.replacements, dropped) },
    generated.filter((s) => !s.locked),
  );
}

export function setLocked(draft: Draft, key: string, locked: boolean): Draft {
  const target = findDraft(draft, key);
  if (!target) return draft;
  return { ...draft, shows: draft.shows.map((s) => (s === target ? { ...s, locked } : s)) };
}
```

- [ ] **Step 4:** PASS (8). **Commit** — `Riempire e rigenerare: quello che hai messo tu non si muove`

---

### Task 3: La finestra "Riempi i buchi"

<!-- file: src/app/admin/(casa)/programma/_tavolo/FillDialog.tsx -->
```tsx
'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { catalogList } from '@/actions/catalogActions';
import { planningAutoPlan, planningGenerate } from '@/actions/planningActions';
import Button from '@/components/cabina/Button';
import Dialog from '@/components/cabina/Dialog';
import { useToast } from '@/components/cabina/Toast';
import type { Intensity } from '@/services/scheduling/engine';
import type { Band } from '@/services/scheduling/times';
import { fillRequest, mergeFilled, type Draft, type FillChoice } from './draft';
import { periodLabel } from './labels';
import { BAND_CHOICES, type CatalogItem } from './types';
import styles from './CatalogDrawer.module.css';

const INTENSITIES: { key: Intensity; label: string; hint: string }[] = [
  { key: 'soft', label: 'Rilassata', hint: '4 al giorno, 5 nel weekend' },
  { key: 'normal', label: 'Normale', hint: '6 al giorno, 7 nel weekend' },
  { key: 'festival', label: 'Festival', hint: '7 al giorno, 8 nel weekend' },
];

interface Props {
  roomId: number;
  from: string;
  days: number;
  draft: Draft;
  /** Il film scelto nel catalogo, se c'è: parte già nell'elenco. */
  preset: CatalogItem | null;
  update: (change: (d: Draft) => Draft) => void;
  onClose: () => void;
}

export default function FillDialog({ roomId, from, days, draft, preset, update, onClose }: Props) {
  const toast = useToast();
  const [mode, setMode] = useState<'auto' | 'hand'>(preset ? 'hand' : 'auto');
  const [intensity, setIntensity] = useState<Intensity>((draft.intensity as Intensity) || 'normal');
  const [list, setList] = useState<FillChoice[]>(preset ? [{ film: preset }] : []);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<{ q: string; films: CatalogItem[] } | null>(null);
  const [working, setWorking] = useState(false);

  const q = search.trim();
  useEffect(() => {
    if (!q) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      catalogList({ search: q, pageSize: 8 })
        .then((r) => {
          if (!cancelled) setFound({ q, films: r.films as unknown as CatalogItem[] });
        })
        .catch(() => null);
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [q]);

  const add = (f: CatalogItem) => {
    if (!f.tmdbId || list.some((c) => c.film.tmdbId === f.tmdbId)) return;
    setList((l) => [...l, { film: f }]);
    setSearch('');
    setFound(null);
  };

  const patch = (tmdbId: string, change: Partial<FillChoice>) =>
    setList((l) => l.map((c) => (c.film.tmdbId === tmdbId ? { ...c, ...change } : c)));

  const run = async () => {
    setWorking(true);
    try {
      let choices = list;
      if (mode === 'auto') {
        const auto = await planningAutoPlan({ seatingPlanId: roomId, startDate: from, days, intensity, exclude: draft.rejected });
        choices = auto.chosen.map((c) => ({ film: c.film as unknown as CatalogItem, replicas: c.replicas, band: c.preferredBand }));
        if (choices.length === 0) {
          toast(auto.warnings[0] ?? 'Non ho trovato film adatti in libreria per questo periodo.', 'alarm');
          return;
        }
      }
      const req = fillRequest(draft, from, days, choices);
      const res = await planningGenerate({ seatingPlanId: roomId, startDate: from, days, intensity, films: req.films, locked: req.locked });
      const added = res.shows.filter((s) => !s.locked);
      update((d) => ({ ...mergeFilled(d, added, choices.map((c) => c.film)), intensity }));
      onClose();
      toast(
        added.length
          ? `${added.length} ${added.length === 1 ? 'spettacolo messo' : 'spettacoli messi'} in bozza. Rigenera li rimescola, un clic li sistema a mano.`
          : 'Non c’era spazio per niente di nuovo.',
        added.length ? 'ok' : 'info',
      );
      if (res.warnings.length) toast(res.warnings[0]);
    } catch {
      toast('Non sono riuscito a riempire il periodo. Riprova.', 'alarm');
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open onClose={() => { if (!working) onClose(); }} title="Riempi i buchi" showTitle>
      <p className={styles.tmdbHint}>{periodLabel(from, days)} · quello che è già in bozza resta dov’è.</p>

      <div className={styles.filters} style={{ gridTemplateColumns: '1fr 1fr', marginTop: 12 }}>
        <Button variant={mode === 'auto' ? 'fill' : 'ghost'} onClick={() => setMode('auto')}>Scegli tu</Button>
        <Button variant={mode === 'hand' ? 'fill' : 'ghost'} onClick={() => setMode('hand')}>Con questi film</Button>
      </div>

      <div className={styles.filters} style={{ marginTop: 10 }}>
        {INTENSITIES.map((i) => (
          <Button key={i.key} variant={intensity === i.key ? 'outline' : 'ghost'} onClick={() => setIntensity(i.key)} title={i.hint}>
            {i.label}
          </Button>
        ))}
      </div>
      <p className={styles.tmdbHint}>{INTENSITIES.find((i) => i.key === intensity)?.hint}</p>

      {mode === 'auto' ? (
        <p className={styles.tmdbHint} style={{ marginTop: 12 }}>
          Scelgo io dalla libreria il film giusto per ogni fascia, lontano da quelli che hai già scartato. Poi togli quello che non ti convince.
        </p>
      ) : (
        <div style={{ marginTop: 12 }}>
          <div className={styles.tmdbForm}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Aggiungi un film dal catalogo…" aria-label="Aggiungi un film" />
          </div>
          {q && found?.q === q && (
            <ul className={styles.tmdbList}>
              {found.films.map((f) => (
                <li key={f.id}>
                  <span>{f.title} <em>{[f.year, `${f.runtime ?? f.durationMin ?? '?'}′`].join(' · ')}</em></span>
                  <Button variant="ghost" onClick={() => add(f)}>+</Button>
                </li>
              ))}
            </ul>
          )}
          {list.length === 0 ? (
            <p className={styles.tmdbHint}>Nessun film ancora: cercane uno qui sopra.</p>
          ) : (
            <ul className={styles.tmdbList}>
              {list.map((c) => (
                <li key={c.film.tmdbId}>
                  <span>{c.film.title}</span>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select
                      value={c.replicas ?? ''}
                      onChange={(e) => patch(c.film.tmdbId!, { replicas: e.target.value === '' ? undefined : Number(e.target.value) })}
                      aria-label="Quanti spettacoli"
                    >
                      <option value="">Quanti: decidi tu</option>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <select
                      value={c.band ?? ''}
                      onChange={(e) => patch(c.film.tmdbId!, { band: (e.target.value || undefined) as Band | undefined })}
                      aria-label="Fascia"
                    >
                      {BAND_CHOICES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </select>
                    <button type="button" onClick={() => setList((l) => l.filter((x) => x !== c))} aria-label="Togli" style={{ background: 'none', border: 0, color: 'var(--c-dim)', cursor: 'pointer' }}>
                      <X size={14} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <Button variant="ghost" onClick={onClose} disabled={working}>Annulla</Button>
        <Button variant="fill" onClick={run} disabled={working || (mode === 'hand' && list.length === 0)}>
          {working ? 'Riempio…' : mode === 'auto' ? 'Riempi' : `Riempi con ${list.length} ${list.length === 1 ? 'film' : 'film'}`}
        </Button>
      </div>
    </Dialog>
  );
}
```

- [ ] tipi + lint. **Commit** — `Riempi i buchi: scegli tu, o con questi film, all'intensità che vuoi`

---

### Task 4: Sul tavolo

- **`Tavolo.tsx`:**
  - bottoni **"✦ Riempi i buchi"** (sempre) e **"Rigenera"** (se `unlockedIn > 0`); via "Wizard";
  - i blocchi del motore hanno `data-auto`;
  - `?tmdb=` accende i posti del film (`catalogPreviewTmdb`, che non scrive), poi si toglie dall'indirizzo;
  - `regenerate()` chiama `planningGenerate(regenerateRequest(...), seed casuale)` e poi `mergeRegenerated`.
- **`DraftPanel.tsx`:** se `!show.locked` il kicker dice "messo dal motore" e compare **"Blocca qui"** (`setLocked`).
- **`Tavolo.module.css`:** `.draft[data-auto] { border-style: dotted; opacity: 0.85; }`.
- **`query.ts`, `load.ts`, `page.tsx`:** `tmdb` al posto di `wizardRedirect`.

Il codice finale sta nei file (commit «Rigenera, Blocca qui, e ?tmdb= accende i posti sul tavolo»). L'effetto di `?tmdb=` legge il film da sé invece di passare da `replica`, che si ricrea a ogni render.

- [ ] test, tipi, lint. **Commit** — `Rigenera, Blocca qui, e ?tmdb= accende i posti sul tavolo`

---

### Task 5: Il wizard se ne va

```bash
git rm -rq "src/app/admin/(casa)/programma/wizard"
grep -rn "wizard/" src
```

- `next.config.ts`: `{ source: '/admin/programma/wizard', destination: '/admin/programma', permanent: false }`, più il suo test.
- `rooms.ts`: via la parola `'wizard'`.
- `AdminPanel.tsx`: i due commenti che parlano del wizard parlano del tavolo.

- [ ] test, tipi, lint. **Commit** — `Il wizard se ne va: si programma solo dal tavolo`

---

### Task 6: Consegna

1. "✦ Riempi i buchi" → "Scegli tu" → Normale → Riempi: i buchi si riempiono di blocchi a puntini, e quelli che avevi messo tu restano fermi.
2. "Rigenera": i blocchi a puntini cambiano, i tuoi no.
3. Un blocco a puntini → "Blocca qui": diventa tratteggiato pieno, e Rigenera non lo tocca più.
4. "Con questi film": aggiungi due film, uno con "3" e fascia "Prima serata", poi Riempi.
5. `/admin/programma/wizard` porta al tavolo, e "Replica" dal Pannello accende i posti del film.
