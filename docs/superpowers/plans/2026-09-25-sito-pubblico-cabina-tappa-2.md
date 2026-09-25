# Sito pubblico in cabina — Tappa 2: l'hero

> **Per chi esegue:** si esegue inline, un compito alla volta (Giovanni non vuole subagenti). I passi usano le caselle (`- [ ]`).

**Obiettivo:** l'hero della home prende la forma scelta sui mockup (A2 con il logo). Contiene:
- il fondale;
- il premio principale;
- il logo, oppure il titolo in Fraunces;
- la riga dei dati in mono;
- la trama;
- la tabella degli orari, una riga per giorno;
- "Prenota 21:15 →" e "▶ Trailer";
- la striscia di locandine, al posto del carosello "In Programmazione".

La home si apre sul film indicato da `?film=`.

**Architettura:** `MovieShowcase` (563 righe) si divide per compiti:
- `MovieShowcase.tsx` tiene lo stato: film attivo, disponibilità dal vivo, rotazione automatica, trailer, cassetto;
- `ShowcaseHero.tsx` disegna il film;
- `ShowtimeTable.tsx` disegna gli orari;
- `FilmStrip.tsx` disegna la striscia.

Tutto quello che si calcola sta in `heroData.ts`, puro e coperto da vitest: i giorni, il prossimo spettacolo, la lingua, il premio e il film iniziale.

**Strumenti:** Next.js 16, CSS Modules con le variabili di Cabina (`--c-*`, ereditate da `<main className="cabina pubblico">`), vitest.

**Specifica:** `docs/superpowers/specs/2026-09-25-sito-pubblico-cabina-design.md`, sezione 2, parti "L'hero" e "Aprire la home su un film".

**Decisioni prese qui, in più rispetto alla specifica:**
- **Anche sul computer la tabella ha un limite:** mostra 5 giorni, perché un film con due settimane di repliche farebbe un hero lungo due schermate. Sul telefono i giorni restano 3, come dice la specifica. Oltre il limite compare "Tutti gli orari ↓", che porta al calendario (`#programma`).
- **Il bottone dice anche il giorno** quando il prossimo spettacolo non è oggi: "Prenota ven 26 set 21:15 →".
- **I bollini accanto all'orario** sono solo quelli di quella replica: una lingua o dei sottotitoli diversi da quelli dell'hero, e le specifiche che non valgono per tutte le repliche. Oggi ogni orario ripete i bollini di divieto, lingua e sottotitoli; da qui in poi il divieto e la lingua comune stanno una volta sola, nella riga dei dati.
- **La lingua nella riga dei dati** è quella degli spettacoli, quando è la stessa per tutti, perché la home legge la lingua della singola proiezione (`metaLingua`). Altrimenti è quella della scheda film.
- **Il premio in alto** è solo un premio **vinto**, il più prestigioso secondo `FESTIVAL_PRESTIGE`. Le candidature restano nella colonna dei loghi dei festival (`MovieAwards`), che non cambia.

---

## Mappa dei file

| File | Cosa cambia |
|---|---|
| `src/components/MovieShowcase/heroData.ts` (nuovo) | calcoli puri dell'hero |
| `src/components/MovieShowcase/heroData.test.ts` (nuovo) | i test |
| `src/components/MovieShowcase/MovieShowcase.tsx` | riscritto: stato e composizione |
| `src/components/MovieShowcase/MovieShowcase.module.css` | riscritto: fondale, sfumature, contenitore |
| `src/components/MovieShowcase/ShowcaseHero.tsx` + `.module.css` (nuovi) | il film |
| `src/components/MovieShowcase/ShowtimeTable.tsx` + `.module.css` (nuovi) | la tabella degli orari |
| `src/components/MovieShowcase/FilmStrip.tsx` + `.module.css` (nuovi) | la striscia di locandine |
| `src/components/CinematicStory/storyBuilder.ts` | `awardHighlight` diventa `export` (una parola) |
| `src/components/CinematicStory/CinematicStory.tsx` | il capitolo calendario riceve `id="programma"` |
| `src/app/page.tsx` | legge `?film=`, passa `initialMovieId`, perde il frammento di diagnosi su Anora |
| `src/app/page.module.css` | resta solo `.main` (le altre regole, viola comprese, non le usa nessuno) |

Non si toccano: `BookingDrawer` (tappa 4), `MovieAwards`, `ProjectionSpecs`, `LanguageBadge`, `RatingBadge` (li usano altri), `CustomVideoPlayer`.

---

### Compito 1: `heroData.ts`, prima i test

**File:**
- Modifica: `src/components/CinematicStory/storyBuilder.ts:403`
- Crea: `src/components/MovieShowcase/heroData.test.ts`
- Crea: `src/components/MovieShowcase/heroData.ts`

- [ ] **Passo 1: esportare `awardHighlight`**

In `storyBuilder.ts`, riga 403: `function awardHighlight(` diventa `export function awardHighlight(`. Nient'altro.

- [ ] **Passo 2: scrivere i test**

```ts
import { describe, expect, it } from 'vitest';
import {
  bookLabel,
  heroLanguage,
  languageLabel,
  mainAwardLabel,
  pickInitialMovieId,
  showtimeDays,
  type SubeventLike,
} from './heroData';

const se = (over: Partial<SubeventLike> & { id: number }): SubeventLike => ({
  date: '2026-09-25T19:15:00.000Z',
  dayLabel: 'Oggi',
  timeLabel: '21:15',
  isSoldOut: false,
  language: 'Lingua originale',
  subtitles: 'Italiano',
  specs: [],
  specsNote: '',
  ...over,
});

describe('languageLabel', () => {
  it('scrive lingua e sottotitoli come nella riga dei dati', () => {
    expect(languageLabel('Lingua originale', 'Italiano', '')).toBe('V.O. · SOTT. ITA');
  });
  it('ignora "Nessuno" e la versione originale', () => {
    expect(languageLabel('Italiano', 'NESSUNO', 'Versione Originale')).toBe('ITALIANO');
  });
  it('mostra una versione speciale', () => {
    expect(languageLabel('', '', '3D')).toBe('3D');
  });
});

describe('heroLanguage', () => {
  const fallback = { language: 'Italiano', subtitles: '' };
  it('usa la lingua degli spettacoli quando è la stessa per tutti', () => {
    expect(heroLanguage([se({ id: 1 }), se({ id: 2 })], fallback)).toEqual({ language: 'Lingua originale', subtitles: 'Italiano' });
  });
  it('torna alla scheda film quando gli spettacoli non sono d\'accordo', () => {
    expect(heroLanguage([se({ id: 1 }), se({ id: 2, language: 'Italiano', subtitles: '' })], fallback)).toEqual(fallback);
  });
  it('torna alla scheda film senza spettacoli o senza lingua', () => {
    expect(heroLanguage([], fallback)).toEqual(fallback);
    expect(heroLanguage([se({ id: 1, language: '', subtitles: '' })], fallback)).toEqual(fallback);
  });
});

describe('showtimeDays', () => {
  const lang = { language: 'Lingua originale', subtitles: 'Italiano' };

  it('raggruppa gli spettacoli per giorno, nell\'ordine in cui arrivano', () => {
    const days = showtimeDays([
      se({ id: 1, dayLabel: 'Oggi', timeLabel: '18:30' }),
      se({ id: 2, dayLabel: 'Oggi', timeLabel: '21:15' }),
      se({ id: 3, dayLabel: 'ven 26 set', timeLabel: '21:30' }),
    ], lang, []);
    expect(days.map(d => [d.dayLabel, d.shows.map(s => s.time)])).toEqual([
      ['Oggi', ['18:30', '21:15']],
      ['ven 26 set', ['21:30']],
    ]);
  });

  it('accende il primo spettacolo non esaurito', () => {
    const days = showtimeDays([
      se({ id: 1, isSoldOut: true }),
      se({ id: 2 }),
      se({ id: 3 }),
    ], lang, []);
    const flat = days.flatMap(d => d.shows);
    expect(flat.map(s => s.isNext)).toEqual([false, true, false]);
    expect(flat[0].isSoldOut).toBe(true);
  });

  it('mette accanto all\'orario solo quello che vale per quella replica', () => {
    const days = showtimeDays([
      se({ id: 1, specs: ['4K', 'ATMOS'] }),
      se({ id: 2, language: 'Italiano', subtitles: '', specs: ['4K'], specsNote: 'con il regista' }),
    ], lang, ['4K']);
    const [a, b] = days[0].shows;
    expect(a.tags).toEqual(['DOLBY ATMOS']);
    expect(b.tags).toEqual(['ITA', 'CON IL REGISTA']);
  });
});

describe('bookLabel', () => {
  const lang = { language: 'Lingua originale', subtitles: 'Italiano' };
  it('oggi dice solo l\'ora', () => {
    expect(bookLabel(showtimeDays([se({ id: 7, timeLabel: '21:15' })], lang, []))).toEqual({ id: 7, label: '21:15' });
  });
  it('un altro giorno dice anche il giorno', () => {
    const days = showtimeDays([
      se({ id: 1, isSoldOut: true }),
      se({ id: 2, dayLabel: 'ven 26 set', timeLabel: '18:30' }),
    ], lang, []);
    expect(bookLabel(days)).toEqual({ id: 2, label: 'ven 26 set 18:30' });
  });
  it('tutto esaurito: niente', () => {
    expect(bookLabel(showtimeDays([se({ id: 1, isSoldOut: true })], lang, []))).toBeNull();
  });
});

describe('mainAwardLabel', () => {
  it('sceglie il premio vinto al festival più prestigioso', () => {
    expect(mainAwardLabel([
      { type: 'oscar', details: 'Vincitore: Miglior film', year: 2025 },
      { type: 'cannes', details: "Vincitore: Palma d'Oro", year: 2024 },
    ])).toBe("Palma d'Oro · 2024");
  });
  it('le sole candidature non vanno in alto', () => {
    expect(mainAwardLabel([{ type: 'venice', details: "Candidatura: Leone d'Oro", year: 2024 }])).toBeNull();
    expect(mainAwardLabel([])).toBeNull();
    expect(mainAwardLabel(undefined)).toBeNull();
  });
});

describe('pickInitialMovieId', () => {
  const movies = [{ id: 10 }, { id: 20 }];
  it('apre il film chiesto se è in programmazione', () => {
    expect(pickInitialMovieId(movies, '20')).toBe(20);
    expect(pickInitialMovieId(movies, ['20', '10'])).toBe(20);
  });
  it('ignora un film che non c\'è o un valore sbagliato', () => {
    expect(pickInitialMovieId(movies, '99')).toBeNull();
    expect(pickInitialMovieId(movies, 'anora')).toBeNull();
    expect(pickInitialMovieId(movies, '')).toBeNull();
    expect(pickInitialMovieId(movies, undefined)).toBeNull();
  });
});
```

- [ ] **Passo 3: verificare che falliscano**

```bash
npx vitest run src/components/MovieShowcase/heroData.test.ts
```

Atteso: FALLISCE, perché `./heroData` non esiste.

- [ ] **Passo 4: scrivere `heroData.ts`**

```ts
/**
 * I dati dell'hero, già pronti da disegnare. Niente React qui dentro: così
 * ogni regola (quale orario si accende, quale premio va in alto, che lingua si
 * scrive) si prova con vitest.
 */
import { normalizeProjectionSpecs, projectionSpec } from '@/constants/projectionSpecs';
import { getFullLanguageName } from '@/constants/languages';
import { formatShowDayLabel, formatShowTime } from '@/utils/cinemaDate';
import { awardHighlight } from '@/components/CinematicStory/storyBuilder';
import { FESTIVAL_PRESTIGE, resolveFestival } from '@/components/CinematicStory/festivals';

/** Uno spettacolo come arriva da app/page.tsx. */
export interface SubeventLike {
  id: number;
  date: string;
  dayLabel?: string;
  timeLabel?: string;
  isSoldOut?: boolean;
  language?: string;
  subtitles?: string;
  specs?: unknown;
  specsNote?: string;
}

export interface HeroShowtime {
  id: number;
  time: string;
  isSoldOut: boolean;
  /** Il prossimo spettacolo che si può prenotare: acceso in ambra. */
  isNext: boolean;
  /** Solo quello che vale per questa replica e non per tutte. */
  tags: string[];
}

export interface HeroShowtimeDay {
  dayLabel: string;
  shows: HeroShowtime[];
}

export interface HeroLanguage {
  language: string;
  subtitles: string;
}

const norm = (value?: string | null) => (value || '').trim().toLowerCase();

function hasSubtitles(subtitles?: string | null): boolean {
  const s = norm(subtitles);
  return s !== '' && s !== 'nessuno';
}

/** Le stesse sigle di LanguageBadge: ITA, ENG, V.O. */
function shortLanguage(lang: string): string {
  const l = norm(lang);
  if (l === 'italiano' || l === 'ita') return 'ITA';
  if (l === 'francese' || l === 'fra') return 'FRA';
  if (l === 'inglese' || l === 'eng' || l === 'english') return 'ENG';
  if (l === 'giapponese' || l === 'jpn' || l === 'gia') return 'GIA';
  if (l === 'lingua originale' || l === 'originale') return 'V.O.';
  return lang.trim().toUpperCase().substring(0, 3);
}

function displayLanguage(lang: string): string {
  const l = norm(lang);
  if (l === 'ita' || l === 'italiano') return 'ITALIANO';
  if (l === 'fra' || l === 'francese') return 'FRANCESE';
  if (l === 'eng' || l === 'inglese' || l === 'english') return 'INGLESE';
  if (l === 'gia' || l === 'jpn' || l === 'giapponese') return 'GIAPPONESE';
  if (l === 'lingua originale' || l === 'originale') return 'V.O.';
  return getFullLanguageName(lang.trim()).toUpperCase();
}

/** "V.O. · SOTT. ITA · 3D": la lingua come si scrive nella riga dei dati. */
export function languageLabel(language?: string, subtitles?: string, version?: string): string {
  const parts: string[] = [];
  if (language && language.trim()) parts.push(displayLanguage(language));
  if (subtitles && hasSubtitles(subtitles)) parts.push(`SOTT. ${shortLanguage(subtitles)}`);
  if (version && version.trim() && version !== 'Versione Originale') parts.push(version.trim().toUpperCase());
  return parts.join(' · ');
}

/**
 * La lingua da scrivere nell'hero. La home legge la lingua dalla singola
 * proiezione (`metaLingua`): se tutti gli spettacoli dicono la stessa cosa vale
 * quella, altrimenti quella della scheda film, e le differenze si leggono
 * accanto ai singoli orari.
 */
export function heroLanguage(subevents: SubeventLike[], fallback: HeroLanguage): HeroLanguage {
  const first = subevents[0];
  if (!first || !norm(first.language)) return fallback;
  const same = subevents.every(
    s => norm(s.language) === norm(first.language) && norm(s.subtitles) === norm(first.subtitles)
  );
  return same ? { language: first.language || '', subtitles: first.subtitles || '' } : fallback;
}

/**
 * Gli spettacoli raggruppati per giorno, nell'ordine in cui arrivano (la query
 * della home li ordina già per data). `commonSpecs` sono le specifiche che
 * valgono per tutte le repliche: stanno nella riga dei dati, non qui.
 */
export function showtimeDays(
  subevents: SubeventLike[],
  lang: HeroLanguage,
  commonSpecs: unknown
): HeroShowtimeDay[] {
  const nextId = subevents.find(s => !s.isSoldOut)?.id;
  const common = new Set(normalizeProjectionSpecs(commonSpecs));
  const days: HeroShowtimeDay[] = [];

  for (const s of subevents) {
    const tags: string[] = [];
    if (s.language && norm(s.language) && norm(s.language) !== norm(lang.language)) {
      tags.push(shortLanguage(s.language));
    }
    if (s.subtitles && hasSubtitles(s.subtitles) && norm(s.subtitles) !== norm(lang.subtitles)) {
      tags.push(`SOTT. ${shortLanguage(s.subtitles)}`);
    }
    for (const code of normalizeProjectionSpecs(s.specs)) {
      if (!common.has(code)) tags.push(projectionSpec(code)!.publicLabel);
    }
    const note = (s.specsNote || '').trim();
    if (note) tags.push(note.toUpperCase());

    const show: HeroShowtime = {
      id: s.id,
      time: s.timeLabel || formatShowTime(s.date),
      isSoldOut: !!s.isSoldOut,
      isNext: s.id === nextId,
      tags,
    };
    const dayLabel = s.dayLabel || formatShowDayLabel(s.date);
    const last = days[days.length - 1];
    if (last && last.dayLabel === dayLabel) last.shows.push(show);
    else days.push({ dayLabel, shows: [show] });
  }
  return days;
}

/** Il bottone "Prenota …": oggi basta l'ora, un altro giorno serve anche il giorno. */
export function bookLabel(days: HeroShowtimeDay[]): { id: number; label: string } | null {
  for (const day of days) {
    const show = day.shows.find(s => s.isNext);
    if (show) return { id: show.id, label: day.dayLabel === 'Oggi' ? show.time : `${day.dayLabel} ${show.time}` };
  }
  return null;
}

/**
 * Il premio da scrivere in cima all'hero: solo un premio vinto, e fra più
 * premi quello del festival più prestigioso. Le candidature restano nella
 * colonna dei loghi.
 */
export function mainAwardLabel(
  awards?: { type?: string; details?: string | null; year?: number | null }[]
): string | null {
  let best: { text: string; prestige: number } | null = null;
  for (const award of awards || []) {
    const { text, rank } = awardHighlight(award);
    if (rank < 2 || !text) continue;
    const i = FESTIVAL_PRESTIGE.indexOf(resolveFestival(award.type || '').key);
    const prestige = i === -1 ? FESTIVAL_PRESTIGE.length : i;
    if (!best || prestige < best.prestige) best = { text, prestige };
  }
  return best ? best.text : null;
}

/**
 * `?film=<tmdbId>`: il film da cui parte l'hero. Serve ai vecchi link della
 * pagina film, che ora portano alla home. Un film che non è in programmazione
 * si ignora.
 */
export function pickInitialMovieId(
  movies: { id: number }[],
  film?: string | string[] | null
): number | null {
  const raw = Array.isArray(film) ? film[0] : film;
  if (!raw || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return movies.some(m => m.id === id) ? id : null;
}
```

- [ ] **Passo 5: verificare che passino**

```bash
npx vitest run src/components/MovieShowcase/heroData.test.ts
```

Atteso: PASSA, tutti i test del file.

Se `mainAwardLabel` sbaglia, prima di toccare il codice si controlla come `awardHighlight` legge i `details` (riga 403 di `storyBuilder.ts`). I test usano il formato "Vincitore: …" / "Candidatura: …", che è quello che `awardHighlight` si aspetta.

- [ ] **Passo 6: commit**

```bash
git add src/components/MovieShowcase/heroData.ts src/components/MovieShowcase/heroData.test.ts src/components/CinematicStory/storyBuilder.ts
git commit -m "L'hero sa quali orari accendere, che lingua scrivere e quale premio mettere in alto

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Compito 2: la tabella degli orari

**File:**
- Crea: `src/components/MovieShowcase/ShowtimeTable.tsx`
- Crea: `src/components/MovieShowcase/ShowtimeTable.module.css`

- [ ] **Passo 1: il componente**

```tsx
import type { HeroShowtimeDay } from './heroData';
import styles from './ShowtimeTable.module.css';

// Quanti giorni stanno nell'hero prima di "Tutti gli orari ↓". Oltre, l'hero
// diventerebbe più lungo dello schermo: il resto lo mostra il calendario.
const DESK_DAYS = 5;
const PHONE_DAYS = 3;

interface ShowtimeTableProps {
  days: HeroShowtimeDay[];
  title: string;
  onPick: (subeventId: number) => void;
}

export default function ShowtimeTable({ days, title, onPick }: ShowtimeTableProps) {
  if (days.length === 0) {
    return <p className={styles.empty}>Nessuno spettacolo in programma</p>;
  }

  return (
    <div className={styles.wrap}>
      <dl className={styles.table}>
        {days.map((day, i) => (
          <div
            key={`${day.dayLabel}-${i}`}
            className={[
              styles.row,
              i >= PHONE_DAYS ? styles.extraPhone : '',
              i >= DESK_DAYS ? styles.extraDesk : '',
            ].filter(Boolean).join(' ')}
          >
            <dt className={styles.day}>{day.dayLabel}</dt>
            <dd className={styles.shows}>
              {day.shows.map(show => (
                <button
                  key={show.id}
                  type="button"
                  className={[
                    styles.time,
                    show.isNext ? styles.next : '',
                    show.isSoldOut ? styles.soldOut : '',
                  ].filter(Boolean).join(' ')}
                  disabled={show.isSoldOut}
                  onClick={() => onPick(show.id)}
                  aria-label={show.isSoldOut
                    ? `${title}, ${day.dayLabel} alle ${show.time}: esaurito`
                    : `Prenota ${title}, ${day.dayLabel} alle ${show.time}`}
                >
                  <span className={styles.clock}>{show.time}</span>
                  {show.tags.length > 0 && <span className={styles.tags}>{show.tags.join(' · ')}</span>}
                </button>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      {days.length > PHONE_DAYS && (
        <a
          href="#programma"
          className={days.length > DESK_DAYS ? styles.all : `${styles.all} ${styles.phoneOnly}`}
        >
          Tutti gli orari ↓
        </a>
      )}
    </div>
  );
}
```

- [ ] **Passo 2: lo stile**

```css
/* Il tabellone: una riga per giorno, gli orari in mono ambra, il prossimo
 * acceso. Le variabili vengono da components/cabina/cabina.css. */

.wrap {
  width: 100%;
  max-width: 540px;
}

.table {
  margin: 0;
  border-top: 1px solid var(--c-line);
}

.row {
  display: grid;
  grid-template-columns: 104px 1fr;
  gap: 16px;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid var(--c-line);
}

/* Dopo .row: a parità di peso vince l'ultima. */
.extraDesk {
  display: none;
}

.day {
  font-family: var(--c-font-mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--c-dim);
}

.shows {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 6px;
}

.time {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: none;
  font-family: var(--c-font-mono);
  color: var(--c-amber);
  cursor: pointer;
  transition: background var(--c-fast), border-color var(--c-fast), color var(--c-fast);
}

.time:hover {
  border-color: rgba(232, 163, 61, 0.45);
}

.clock {
  font-size: 16px;
}

.tags {
  font-size: 9px;
  letter-spacing: 0.12em;
  color: var(--c-dim);
}

.next {
  background: var(--c-amber);
  color: var(--c-amber-ink);
}

.next .tags {
  color: #5a4220;
}

.soldOut {
  color: var(--c-dim);
  text-decoration: line-through;
  opacity: 0.6;
  cursor: not-allowed;
}

.soldOut:hover {
  border-color: transparent;
}

.all {
  display: inline-block;
  margin-top: 10px;
  font-family: var(--c-font-mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--c-amber);
  text-decoration: none;
}

.phoneOnly {
  display: none;
}

.empty {
  margin: 0;
  font-family: var(--c-font-mono);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--c-dim);
}

@media (max-width: 768px) {
  .wrap {
    max-width: none;
  }

  .row {
    grid-template-columns: 76px 1fr;
    gap: 10px;
  }

  .extraPhone {
    display: none;
  }

  .phoneOnly {
    display: inline-block;
  }

  .clock {
    font-size: 15px;
  }
}
```

- [ ] **Passo 3: tipi**

```bash
npx tsc --noEmit
```

Atteso: nessun errore. Il componente non è ancora usato: si monta nel compito 5.

---

### Compito 3: la striscia di locandine

**File:**
- Crea: `src/components/MovieShowcase/FilmStrip.tsx`
- Crea: `src/components/MovieShowcase/FilmStrip.module.css`

- [ ] **Passo 1: il componente**

```tsx
import Image from 'next/image';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import type { GroupedMovie } from './MovieShowcase';
import styles from './FilmStrip.module.css';

interface FilmStripProps {
  movies: GroupedMovie[];
  activeId: number;
  onSelect: (movieId: number) => void;
}

/**
 * In fondo all'hero, per passare da un film all'altro. Prende il posto del
 * carosello "In Programmazione". Anche un film esaurito si può aprire: si
 * vede spento, ma trama e orari restano leggibili.
 */
export default function FilmStrip({ movies, activeId, onSelect }: FilmStripProps) {
  if (movies.length < 2) return null;
  const index = movies.findIndex(m => m.id === activeId);

  return (
    <div className={styles.strip}>
      <div className={styles.posters}>
        {movies.map((movie, i) => (
          <button
            key={movie.id}
            type="button"
            className={[
              styles.poster,
              movie.id === activeId ? styles.active : '',
              movie.isSoldOut ? styles.soldOut : '',
            ].filter(Boolean).join(' ')}
            aria-pressed={movie.id === activeId}
            aria-label={movie.isSoldOut ? `${movie.title}, esaurito` : movie.title}
            onClick={() => onSelect(movie.id)}
          >
            {movie.poster_path ? (
              <Image
                src={getTMDBImageUrl(movie.poster_path, 'w185')!}
                alt=""
                fill
                sizes="72px"
                className={styles.image}
                priority={i < 4}
              />
            ) : (
              <span className={styles.noPoster}>{movie.title}</span>
            )}
          </button>
        ))}
      </div>
      <p className={styles.count}>{index + 1} / {movies.length} in sala</p>
    </div>
  );
}
```

- [ ] **Passo 2: lo stile**

```css
.strip {
  display: flex;
  align-items: flex-end;
  gap: 16px;
}

.posters {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  min-width: 0;
  padding: 4px 2px;
  overflow-x: auto;
  scrollbar-width: none;
}

.posters::-webkit-scrollbar {
  display: none;
}

.poster {
  position: relative;
  flex: 0 0 auto;
  width: 48px;
  aspect-ratio: 2 / 3;
  padding: 0;
  border: 1px solid var(--c-line);
  border-radius: 3px;
  overflow: hidden;
  background: var(--c-bg-raised);
  cursor: pointer;
  opacity: 0.55;
  transition: opacity var(--c-fast), width var(--c-fast), border-color var(--c-fast);
}

.poster:hover {
  opacity: 0.85;
}

.active {
  width: 64px;
  opacity: 1;
  border-color: var(--c-amber);
}

.image {
  object-fit: cover;
}

.soldOut .image {
  filter: grayscale(0.8) brightness(0.6);
}

.noPoster {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 4px;
  font-size: 8px;
  line-height: 1.2;
  text-align: center;
  color: var(--c-dim);
}

.count {
  flex: 0 0 auto;
  margin: 0 0 4px auto;
  font-family: var(--c-font-mono);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--c-dim);
}

@media (max-width: 768px) {
  .poster {
    width: 42px;
  }

  .active {
    width: 54px;
  }

  .count {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .poster {
    transition: none;
  }
}
```

- [ ] **Passo 3: tipi**

```bash
npx tsc --noEmit
```

Atteso: nessun errore.

---

### Compito 4: il film nell'hero

**File:**
- Crea: `src/components/MovieShowcase/ShowcaseHero.tsx`
- Crea: `src/components/MovieShowcase/ShowcaseHero.module.css`

- [ ] **Passo 1: il componente**

```tsx
import Image from 'next/image';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import { normalizeProjectionSpecs, projectionSpec } from '@/constants/projectionSpecs';
import { normalizeRating } from '@/utils/ratingUtils';
import MovieAwards from '../MovieAwards/MovieAwards';
import ShowtimeTable from './ShowtimeTable';
import { bookLabel, heroLanguage, languageLabel, mainAwardLabel, showtimeDays } from './heroData';
import type { GroupedMovie } from './MovieShowcase';
import styles from './ShowcaseHero.module.css';

interface ShowcaseHeroProps {
  movie: GroupedMovie;
  isOverviewExpanded: boolean;
  onToggleOverview: () => void;
  onBook: (subeventId: number) => void;
  onTrailer: () => void;
}

/**
 * Il film nell'hero: premio, logo (o titolo in Fraunces), dati, trama, orari
 * e prenotazione. Si rimonta a ogni cambio di film (`key` in MovieShowcase),
 * ed è la dissolvenza d'entrata a fare da passaggio.
 */
export default function ShowcaseHero({ movie, isOverviewExpanded, onToggleOverview, onBook, onTrailer }: ShowcaseHeroProps) {
  const lang = heroLanguage(movie.subevents, {
    language: movie.versionLanguage || '',
    subtitles: movie.subtitles || '',
  });
  const days = showtimeDays(movie.subevents, lang, movie.specs);
  const book = bookLabel(days);
  const award = mainAwardLabel(movie.awards);
  const rating = normalizeRating(movie.rating);
  const hasTrailer = !!(movie.trailerKey || (movie.trailerKeys && movie.trailerKeys.length > 0));

  // Come si proietta: solo ciò che vale per *tutti* gli spettacoli. Le
  // differenze fra una replica e l'altra stanno accanto al singolo orario.
  const specs = normalizeProjectionSpecs(movie.specs).map(code => projectionSpec(code)!.publicLabel);
  const facts = [
    movie.director || '',
    movie.release_year || '',
    movie.runtime && movie.runtime > 0 ? `${movie.runtime} min` : '',
    languageLabel(lang.language, lang.subtitles, movie.format),
    ...specs,
  ].filter(Boolean);

  return (
    <div className={styles.hero}>
      <div className={styles.main}>
        {award && <p className={styles.award}>● {award}</p>}

        {movie.logo_path ? (
          <h1 className={styles.logo}>
            <Image
              src={getTMDBImageUrl(movie.logo_path, 'w500')!}
              alt={movie.title}
              fill
              className={styles.logoImage}
              sizes="(max-width: 768px) 80vw, 420px"
              priority
            />
          </h1>
        ) : (
          <h1 className={styles.title}>{movie.title}</h1>
        )}

        <p className={styles.facts}>
          {facts.map((fact, i) => <span key={i}>{fact}</span>)}
          {rating !== 'T' && <span className={rating === '18+' ? styles.alarm : undefined}>{rating}</span>}
        </p>

        {movie.overview && (
          <div className={styles.overviewBlock}>
            <p className={isOverviewExpanded ? `${styles.overview} ${styles.expanded}` : styles.overview}>
              {movie.overview}
            </p>
            {isOverviewExpanded && movie.cast && movie.cast.length > 0 && (
              <p className={styles.cast}><span>Con</span>{movie.cast.join(', ')}</p>
            )}
            {movie.overview.length > 150 && (
              <button type="button" className={styles.more} onClick={onToggleOverview} aria-expanded={isOverviewExpanded}>
                {isOverviewExpanded ? 'Meno ↑' : 'Più ↓'}
              </button>
            )}
          </div>
        )}

        <ShowtimeTable days={days} title={movie.title} onPick={onBook} />

        <div className={styles.actions}>
          {book ? (
            <button type="button" className={styles.book} onClick={() => onBook(book.id)}>
              Prenota {book.label} →
            </button>
          ) : (
            <span className={styles.soldOutLabel}>Esaurito</span>
          )}
          {hasTrailer && (
            <button type="button" className={styles.trailer} onClick={onTrailer}>
              ▶ Trailer
            </button>
          )}
        </div>
      </div>

      {movie.awards && movie.awards.length > 0 && (
        <div className={styles.awards}>
          <MovieAwards awards={movie.awards} vertical />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Passo 2: lo stile**

```css
/* Il film: logo o titolo, dati in mono, trama, orari. Colori di Cabina. */

.hero {
  display: flex;
  align-items: flex-end;
  gap: 48px;
  animation: heroIn var(--c-slow) both;
}

@keyframes heroIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.main {
  flex: 0 1 640px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.award {
  margin: 0 0 12px;
  font-family: var(--c-font-mono);
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--c-amber);
}

.logo {
  position: relative;
  width: 100%;
  max-width: 420px;
  height: 130px;
  margin: 0 0 16px;
}

.logoImage {
  object-fit: contain;
  object-position: left bottom;
  filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.6));
}

.title {
  margin: 0 0 16px;
  font-family: var(--c-font-serif);
  font-weight: 600;
  font-size: clamp(2.75rem, 6vw, 5rem);
  line-height: 0.95;
  letter-spacing: -0.01em;
  color: var(--c-ink);
}

.facts {
  display: flex;
  flex-wrap: wrap;
  row-gap: 4px;
  margin: 0 0 16px;
  font-family: var(--c-font-mono);
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--c-dim);
}

.facts span:first-child {
  color: var(--c-ink);
}

.facts span + span::before {
  content: '·';
  margin: 0 10px;
  color: var(--c-line-strong);
}

.alarm {
  color: var(--c-alarm);
}

.overviewBlock {
  max-width: 560px;
  margin: 0 0 24px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.overview {
  margin: 0;
  font-size: 1rem;
  line-height: 1.6;
  color: #cbbfae;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.expanded {
  display: block;
  -webkit-line-clamp: unset;
  line-clamp: unset;
}

.cast {
  margin: 4px 0 0;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--c-dim);
}

.cast span {
  margin-right: 8px;
  font-family: var(--c-font-mono);
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.more {
  padding: 4px 0;
  border: 0;
  background: none;
  font-family: var(--c-font-mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--c-amber);
  cursor: pointer;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 24px;
}

.book,
.trailer,
.soldOutLabel {
  padding: 12px 18px;
  border-radius: var(--c-radius);
  font-family: var(--c-font-mono);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  transition: background var(--c-fast), border-color var(--c-fast);
}

.book {
  border: 1px solid var(--c-amber);
  background: var(--c-amber);
  color: var(--c-amber-ink);
  font-weight: 600;
  cursor: pointer;
}

.book:hover {
  background: #f0b458;
}

.trailer {
  border: 1px solid var(--c-line-strong);
  background: rgba(16, 13, 10, 0.4);
  color: var(--c-ink);
  cursor: pointer;
}

.trailer:hover {
  border-color: var(--c-dim);
}

.soldOutLabel {
  border: 1px solid var(--c-line);
  color: var(--c-dim);
}

.awards {
  flex: 0 0 auto;
  align-self: center;
}

@media (max-width: 1024px) {
  .hero {
    flex-direction: column;
    align-items: flex-start;
    gap: 24px;
  }

  .awards {
    align-self: flex-start;
  }
}

@media (max-width: 768px) {
  .logo {
    max-width: 80vw;
    height: 90px;
  }

  .facts {
    font-size: 11px;
  }

  .overview {
    font-size: 0.95rem;
  }

  .actions {
    width: 100%;
    margin-top: 20px;
  }

  .book,
  .trailer {
    flex: 1;
    text-align: center;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero {
    animation: none;
  }
}
```

- [ ] **Passo 3: tipi**

```bash
npx tsc --noEmit
```

Atteso: nessun errore.

---

### Compito 5: `MovieShowcase` tiene lo stato e compone

**File:**
- Riscrive: `src/components/MovieShowcase/MovieShowcase.tsx`
- Riscrive: `src/components/MovieShowcase/MovieShowcase.module.css`

- [ ] **Passo 1: il componente**

Resta tutto quello che riguarda lo stato:
- la disponibilità dal vivo con SWR e il riordino dopo l'hydration;
- la rotazione automatica, ferma quando l'hero non si vede o c'è il puntatore sopra;
- i blocchi per il cassetto, la trama e il trailer;
- l'evento `vestri:select-movie` del racconto.

Se ne vanno il carosello (con le frecce e lo shimmer), `useTrailer`, che era dichiarato ma mai usato, e il `console.log` del cast.

```tsx
'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Image from 'next/image';
import useSWR from 'swr';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import { useAutoScroll } from '@/context/AutoScrollContext';
import BookingDrawer from '../BookingDrawer/BookingDrawer';
import CustomVideoPlayer from '../CustomVideoPlayer/CustomVideoPlayer';
import ShowcaseHero from './ShowcaseHero';
import FilmStrip from './FilmStrip';
import styles from './MovieShowcase.module.css';

// Nove secondi: cinque non bastavano a leggere trama e orari prima che la
// hero cambiasse film sotto gli occhi.
const AUTO_SCROLL_INTERVAL = 9000;
const fetcher = (url: string) => fetch(url).then(res => res.json());

export interface GroupedMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  logo_path?: string | null;
  release_date: string;
  /** Anno già estratto lato server, per non calcolarlo dopo l'hydration. */
  release_year?: string;
  director?: string;
  runtime?: number;
  isSoldOut?: boolean;
  cast?: string[];
  trailerKey?: string | null;
  trailerKeys?: string[];
  rating?: string;
  versionLanguage?: string;
  subtitles?: string;
  format?: string;
  /** Le specifiche comuni a tutti gli spettacoli del film. Vedi `app/page.tsx`. */
  specs?: string[];
  subevents: any[];
  awards?: any[];
  tagline?: string;
  extraBackdrops?: string[];
  genres?: string[];
  voteAverage?: number | null;
}

interface MovieShowcaseProps {
  movies: GroupedMovie[];
  initialAvailability?: Record<number, boolean>;
  /** Da `?film=`: il film da cui parte l'hero. Già controllato dal server. */
  initialMovieId?: number | null;
}

export default function MovieShowcase({ movies: initialMovies, initialAvailability, initialMovieId }: MovieShowcaseProps) {
  const { data: availabilityData } = useSWR('/api/availability', fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
    fallbackData: initialAvailability
  });

  const [activeMovieId, setActiveMovieId] = useState<number>(initialMovieId ?? initialMovies[0]?.id ?? 0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [checkoutSubeventId, setCheckoutSubeventId] = useState<number | null>(null);
  const [isOverviewExpanded, setIsOverviewExpanded] = useState(false);
  const [isImmersiveMode, setIsImmersiveMode] = useState(false);
  // Solo mouse: su touch `pointerleave` può non arrivare mai e la rotazione
  // resterebbe bloccata per sempre.
  const [isPointerOverHero, setIsPointerOverHero] = useState(false);
  const [timerKey, setTimerKey] = useState(0);
  const [isHydrated, setIsHydrated] = useState(false);
  // La rotazione automatica gira solo quando la hero è davvero visibile:
  // cambiare backdrop full-screen mentre l'utente sta scorrendo lo
  // scrollytelling in basso causava scatti periodici su tutta la pagina.
  const showcaseRef = useRef<HTMLDivElement>(null);
  const [heroInView, setHeroInView] = useState(true);

  useEffect(() => {
    const el = showcaseRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setHeroInView(entry.isIntersecting),
      { threshold: 0.05 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { isAutoScrollEnabled, suspendAutoScroll, holdAutoScroll, releaseAutoScroll } = useAutoScroll();

  // Chi arriva da un link a un film deve trovarlo lì, non vederlo scivolare
  // via dopo nove secondi.
  useEffect(() => {
    if (initialMovieId != null) suspendAutoScroll();
  }, [initialMovieId, suspendAutoScroll]);

  const liveMovies: GroupedMovie[] = useMemo(() => {
    if (!availabilityData) return initialMovies;

    return initialMovies.map((movie: GroupedMovie) => {
      const updatedSubevents = movie.subevents.map((se: any) => {
        const liveIsSoldOut = availabilityData[se.id] === true || availabilityData[se.id.toString()] === true;
        // Esaurito resta esaurito: il dato dal vivo può solo aggiungere.
        return { ...se, isSoldOut: se.isSoldOut || liveIsSoldOut };
      });
      const allSubeventsSoldOut = updatedSubevents.length > 0 && updatedSubevents.every((se: any) => se.isSoldOut === true);
      return { ...movie, subevents: updatedSubevents, isSoldOut: allSubeventsSoldOut };
    });
  }, [initialMovies, availabilityData]);

  // Durante l'hydration si disegna esattamente quello che ha disegnato il
  // server; dopo, i film esauriti scendono in fondo.
  const sortedMovies: GroupedMovie[] = useMemo(() => {
    if (!isHydrated || !availabilityData) return initialMovies;

    const sortDate = (movie: GroupedMovie) => {
      const shows = movie.isSoldOut ? movie.subevents : movie.subevents.filter(se => !se.isSoldOut);
      if (shows.length === 0) return Infinity;
      return Math.min(...shows.map(s => new Date(s.date).getTime()));
    };

    return [...liveMovies].sort((a, b) => {
      if (!a.isSoldOut && b.isSoldOut) return -1;
      if (a.isSoldOut && !b.isSoldOut) return 1;
      return sortDate(a) - sortDate(b);
    });
  }, [liveMovies, availabilityData, isHydrated, initialMovies]);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const availableMovies = useMemo(() => sortedMovies.filter(m => !m.isSoldOut), [sortedMovies]);

  const goToNextMovie = useCallback(() => {
    if (availableMovies.length <= 1) return;
    setActiveMovieId(prevId => {
      const currentIndex = availableMovies.findIndex(m => m.id === prevId);
      // Film esaurito aperto a mano, oppure l'ultimo: si riparte dal primo.
      if (currentIndex === -1 || currentIndex === availableMovies.length - 1) {
        return availableMovies[0].id;
      }
      return availableMovies[currentIndex + 1].id;
    });
    setTimerKey(prev => prev + 1);
  }, [availableMovies]);

  useEffect(() => {
    // Il puntatore sopra la hero è uno stato locale e non passa dal context:
    // farlo transitare dal provider avrebbe ridisegnato l'intero showcase a
    // ogni entrata e uscita del mouse.
    if (availableMovies.length <= 1 || !isAutoScrollEnabled || !heroInView || isPointerOverHero) return;
    const interval = setInterval(goToNextMovie, AUTO_SCROLL_INTERVAL);
    return () => clearInterval(interval);
  }, [goToNextMovie, availableMovies.length, timerKey, isAutoScrollEnabled, heroInView, isPointerOverHero]);

  // Finché una di queste condizioni è vera la hero non cambia film: c'è
  // qualcosa che l'utente sta leggendo o guardando. Al rilascio la rotazione
  // riprende da sola.
  const AUTO_SCROLL_BLOCKS = useMemo(() => ({
    drawer: drawerOpen,
    overview: isOverviewExpanded,
    trailer: isImmersiveMode,
  }), [drawerOpen, isOverviewExpanded, isImmersiveMode]);

  useEffect(() => {
    for (const [reason, active] of Object.entries(AUTO_SCROLL_BLOCKS)) {
      if (active) holdAutoScroll(reason);
      else releaseAutoScroll(reason);
    }
  }, [AUTO_SCROLL_BLOCKS, holdAutoScroll, releaseAutoScroll]);

  useEffect(() => () => {
    ['drawer', 'overview', 'trailer'].forEach(releaseAutoScroll);
  }, [releaseAutoScroll]);

  useEffect(() => {
    setIsOverviewExpanded(false);
    setIsImmersiveMode(false);
  }, [activeMovieId]);

  const handleMovieSelect = (movieId: number) => {
    setActiveMovieId(movieId);
    setTimerKey(prev => prev + 1);
    suspendAutoScroll();
  };

  // Selezione film richiesta dal racconto (CinematicStory) più in basso.
  useEffect(() => {
    const handler = (e: Event) => {
      const movieId = Number((e as CustomEvent).detail?.movieId);
      if (Number.isNaN(movieId)) return;
      setActiveMovieId(movieId);
      setTimerKey(prev => prev + 1);
      suspendAutoScroll();
    };
    window.addEventListener('vestri:select-movie', handler);
    return () => window.removeEventListener('vestri:select-movie', handler);
  }, [suspendAutoScroll]);

  if (liveMovies.length === 0) {
    return (
      <div className={styles.empty}>
        <p>Nessun film in programmazione</p>
      </div>
    );
  }

  const activeMovie = sortedMovies.find(m => m.id === activeMovieId) || sortedMovies[0];

  const handleBook = (subeventId: number) => {
    setCheckoutSubeventId(subeventId);
    setDrawerOpen(true);
  };

  const hidden = isImmersiveMode ? ` ${styles.uiHidden}` : '';

  return (
    <div ref={showcaseRef} className={styles.showcase}>
      <div
        className={styles.hero}
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') setIsPointerOverHero(true); }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') setIsPointerOverHero(false); }}
        onFocusCapture={suspendAutoScroll}
      >
        <div className={`${styles.backdrop}${hidden}`}>
          <Image
            src={getTMDBImageUrl(activeMovie.backdrop_path, 'original') || getTMDBImageUrl(activeMovie.poster_path, 'original') || ''}
            alt=""
            fill
            className={styles.backdropImage}
            sizes="100vw"
            priority
            suppressHydrationWarning
          />
          <div className={styles.shadeSide} />
          <div className={styles.shadeBottom} />
        </div>

        <div className={`${styles.content}${hidden}`}>
          <ShowcaseHero
            key={activeMovie.id}
            movie={activeMovie}
            isOverviewExpanded={isOverviewExpanded}
            onToggleOverview={() => setIsOverviewExpanded(v => !v)}
            onBook={handleBook}
            onTrailer={() => setIsImmersiveMode(true)}
          />
          <FilmStrip movies={sortedMovies} activeId={activeMovie.id} onSelect={handleMovieSelect} />
        </div>

        <CustomVideoPlayer
          videoId={activeMovie.trailerKey || null}
          backdropUrl={getTMDBImageUrl(activeMovie.backdrop_path, 'original')}
          isPlaying={isImmersiveMode}
          onClose={() => setIsImmersiveMode(false)}
        />
      </div>

      <BookingDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        subeventId={checkoutSubeventId}
        movieTitle={activeMovie.title}
      />
    </div>
  );
}
```

Prima di sostituire il file, rileggere la versione di oggi e confermare che l'unica logica tolta sia quella del carosello (`scrollRef`, `checkScroll`, `scroll`, `showLeftArrow`/`showRightArrow`, `loadedPosters`), più `useTrailer` e il `console.log`. Se c'è altro, va tenuto.

- [ ] **Passo 2: lo stile**

```css
/* L'hero della Sala buia: il fondale del film a tutto schermo e sopra, in
 * basso a sinistra, tutto quello che serve a scegliere. I colori sono quelli
 * di Cabina, ereditati da <main className="cabina pubblico">. */

.showcase {
  position: relative;
  width: 100%;
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  font-family: var(--c-font-mono);
  font-size: 12px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--c-dim);
}

.hero {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100svh;
  overflow: hidden;
  background: var(--c-bg);
  isolation: isolate;
}

.backdrop {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.backdropImage {
  object-fit: cover;
  object-position: center 20%;
}

/* Due sfumature verso il nero caldo: da sinistra, dove sta il testo, e dal
 * basso, dove l'hero si scioglie nel racconto. */
.shadeSide {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    90deg,
    rgba(16, 13, 10, 0.96) 0%,
    rgba(16, 13, 10, 0.78) 32%,
    rgba(16, 13, 10, 0.2) 70%,
    rgba(16, 13, 10, 0) 100%
  );
}

.shadeBottom {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 35%;
  pointer-events: none;
  background: linear-gradient(0deg, var(--c-bg) 0%, rgba(16, 13, 10, 0.7) 45%, transparent 100%);
}

.content {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 32px;
  box-sizing: border-box;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 72px 40px 28px;
}

/* Il trailer prende la scena: l'hero sparisce piano, come le luci in sala. */
.backdrop,
.content {
  transition: opacity 1.2s cubic-bezier(0.4, 0, 0.2, 1), visibility 1.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.uiHidden {
  opacity: 0;
  visibility: hidden;
}

@media (max-width: 768px) {
  .shadeSide {
    background: linear-gradient(
      0deg,
      rgba(16, 13, 10, 1) 0%,
      rgba(16, 13, 10, 0.9) 50%,
      rgba(16, 13, 10, 0.35) 80%,
      rgba(16, 13, 10, 0.15) 100%
    );
  }

  .content {
    gap: 24px;
    padding: 56px 16px 20px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .backdrop,
  .content {
    transition: none;
  }
}
```

- [ ] **Passo 3: tipi e test**

```bash
npx tsc --noEmit && npm test
```

Atteso: nessun errore, tutti i test verdi.

- [ ] **Passo 4: commit**

```bash
git add src/components/MovieShowcase/
git commit -m "L'hero prende la forma del tabellone, con il logo del film e la striscia di locandine

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Compito 6: la home legge `?film=` e il calendario ha un indirizzo

**File:**
- Modifica: `src/app/page.tsx`
- Modifica: `src/app/page.module.css`
- Modifica: `src/components/CinematicStory/CinematicStory.tsx` (caso `'calendar'`, riga 1117 circa)

- [ ] **Passo 1: `page.tsx`**

La firma diventa:

```tsx
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  noStore();
  const { film } = await searchParams;
```

Import in testa:

```ts
import { pickInitialMovieId } from '@/components/MovieShowcase/heroData';
```

Dopo l'ordinamento dei film (`movies.sort(...)`):

```ts
  // `?film=`: i vecchi link alla pagina del film arrivano qui.
  const initialMovieId = pickInitialMovieId(movies, film);
```

E `MovieShowcase` riceve `initialMovieId={initialMovieId}`.

Si toglie tutto il blocco `if (subevents[0]?.name?.includes('Anora')) { … }`, dal commento "Se è Anora" alla graffa che lo chiude. Scriveva un file di diagnosi in `scratch/` a ogni visita. `const m = movie as any;` resta, perché lo usano le righe dopo.

- [ ] **Passo 2: `page.module.css`**

`page.tsx` usa solo `styles.main`. Il file diventa:

```css
.main {
  min-height: 100vh;
  padding-bottom: 1rem;
}
```

Prima di salvare, controllare che nessun altro file importi `page.module.css`:

```bash
grep -rn "page.module.css" src
```

Atteso: solo `src/app/page.tsx` e `src/app/movie/[id]/page.tsx`. Quest'ultimo importa il **suo** `page.module.css`, che è un altro file.

- [ ] **Passo 3: il calendario ha un indirizzo**

In `CinematicStory.tsx`, nel `case 'calendar'`, la `motion.section` riceve `id="programma"`. È l'arrivo di "Tutti gli orari ↓".

- [ ] **Passo 4: tipi e test**

```bash
npx tsc --noEmit && npm test
```

Atteso: nessun errore, tutti i test verdi.

- [ ] **Passo 5: commit**

```bash
git add src/app/page.tsx src/app/page.module.css src/components/CinematicStory/CinematicStory.tsx
git commit -m "La home si apre sul film del link, e \"Tutti gli orari\" porta al calendario

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Compito 7: resoconto per Giovanni

**File:** nessuno. Il dev server **non** si avvia.

- [ ] **Passo 1: ultimo controllo**

```bash
npx tsc --noEmit && npm test && git status --short
grep -rn "galleryList\|galleryScroll\|cardWrapper" src/components/MovieShowcase
```

Atteso: nessun errore, test verdi, albero pulito. Il `grep` non trova niente: il carosello è sparito del tutto.

- [ ] **Passo 2: cosa provare**
- **Computer:**
  - il fondale sfuma verso il nero caldo;
  - in cima c'è il premio vinto in ambra (per esempio con un film premiato a Cannes);
  - c'è il logo, e per un film senza logo il titolo in Fraunces;
  - la riga dei dati in mono, con il 18+ in rosso;
  - la trama con "Più ↓";
  - la tabella con il prossimo orario acceso e gli esauriti barrati;
  - "Prenota … →" apre il cassetto su quello spettacolo;
  - "▶ Trailer" fa sparire l'hero e parte il trailer;
  - la colonna dei loghi dei festival c'è ancora.
- **Striscia:** cliccando una locandina cambia film; "N / M in sala" è giusto; la rotazione automatica funziona ancora e si ferma col mouse sopra.
- **Orari per replica:** uno spettacolo con una lingua diversa dagli altri, o in 4K solo quella sera, mostra il bollino accanto all'orario.
- **Telefono:** tre giorni di orari, poi "Tutti gli orari ↓", che porta al calendario; i bottoni sono larghi; la striscia scorre di lato.
- **`/?film=<tmdbId>`** di un film in programmazione: la home parte da quel film e non ruota subito. Con un id che non c'è, parte come sempre.
- **Film tutto esaurito:** al posto di "Prenota" c'è "Esaurito".
- **Safari vecchio:** l'hero si vede e il "Più ↓" funziona.
