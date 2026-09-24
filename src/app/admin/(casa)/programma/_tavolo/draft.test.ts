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
