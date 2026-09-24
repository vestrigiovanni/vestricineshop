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
