import { describe, expect, it } from 'vitest';
import { arrivalTimes, buildShelves, directorsOf, type ShelfFilm } from './shelves';

const NOW = Date.UTC(2026, 9, 18);

let n = 0;
function film(over: Partial<ShelfFilm> = {}): ShelfFilm {
  n += 1;
  return {
    tmdbId: String(n),
    title: `Film ${n}`,
    year: 1990,
    runtime: 110,
    director: null,
    genres: [],
    voteAverage: null,
    voteCount: null,
    awardLabels: [],
    scheduledCount: 1,
    addedAt: null,
    taste: 0,
    canon: false,
    ...over,
  };
}

const shelf = (films: ShelfFilm[], key: string, seed = 1) =>
  buildShelves(films, { seed, now: NOW }).shelves.find((s) => s.key === key);

describe('buildShelves', () => {
  it('mette per primi gli ultimi arrivati in libreria', () => {
    const films = [1, 5, 3, 4, 2].map((daysAgo) => film({ addedAt: NOW - daysAgo * 86_400_000 }));
    const [d1, d5, d3, d4, d2] = films.map((f) => f.tmdbId);
    expect(shelf(films, 'fresh')?.ids).toEqual([d1, d2, d3, d4, d5]);
  });

  it('usciti di recente: solo gli ultimi anni, dal più nuovo', () => {
    const films = [2026, 2025, 2024, 2023, 2010].map((year) => film({ year }));
    const ids = shelf(films, 'released')!.ids;
    expect(ids.map((id) => films.find((f) => f.tmdbId === id)!.year)).toEqual([2026, 2025, 2024, 2023]);
  });

  it('un regista ha la sua riga da tre film in su, anche quando firma in due', () => {
    const films = [
      film({ director: 'Agnès Varda' }),
      film({ director: 'Agnès Varda' }),
      film({ director: 'Agnès Varda, JR' }),
      film({ director: 'JR' }),
      film({ director: 'JR' }),
    ];
    const keys = buildShelves(films, { seed: 1, now: NOW }).shelves.map((s) => s.key);
    expect(keys).toContain('director:Agnès Varda');
    expect(keys).toContain('director:JR');
  });

  it('una riga con troppi pochi film non c’è', () => {
    const films = [film({ scheduledCount: 0 }), film({ scheduledCount: 0 }), film()];
    expect(shelf(films, 'never')).toBeUndefined();
  });

  it('lo stesso seme dà le stesse righe, un seme diverso rimescola il caso', () => {
    const films = Array.from({ length: 40 }, () => film());
    const a = shelf(films, 'random', 7)!.ids;
    expect(shelf(films, 'random', 7)!.ids).toEqual(a);
    expect(shelf(films, 'random', 8)!.ids).not.toEqual(a);
  });

  it('la vetrina pesca solo film del catalogo, senza doppioni', () => {
    const films = Array.from({ length: 30 }, (_, i) => film({ addedAt: NOW - i, taste: i % 3 }));
    const { heroIds } = buildShelves(films, { seed: 3, now: NOW });
    expect(heroIds.length).toBeGreaterThan(0);
    expect(new Set(heroIds).size).toBe(heroIds.length);
    for (const id of heroIds) expect(films.some((f) => f.tmdbId === id)).toBe(true);
  });
});

it('le righe per merito non si aprono con i film già in testa alle righe sopra', () => {
  const star = Array.from({ length: 12 }, () => film({ taste: 2, scheduledCount: 0, genres: ['Dramma'] }));
  const others = Array.from({ length: 12 }, () => film({ taste: 0, scheduledCount: 0, genres: ['Dramma'] }));
  const { shelves } = buildShelves([...star, ...others], { seed: 1, now: NOW });
  const forYou = shelves.find((s) => s.key === 'forYou')!.ids.slice(0, 10);
  const drama = shelves.find((s) => s.key === 'genre:Dramma')!.ids.slice(0, 2);
  expect(drama.some((id) => forYou.includes(id))).toBe(false);
});

describe('directorsOf', () => {
  it('divide le coppie di registi', () => {
    expect(directorsOf({ director: 'Joel Coen, Ethan Coen' })).toEqual(['Joel Coen', 'Ethan Coen']);
    expect(directorsOf({ director: null })).toEqual([]);
  });
});

describe('arrivalTimes', () => {
  it('la data di Plex vince, l’importazione in blocco non è un arrivo', () => {
    const bulkDay = Date.UTC(2026, 5, 14, 10);
    const films = [
      ...Array.from({ length: 60 }, (_, i) => ({ tmdbId: `b${i}`, addedAt: null, catalogedAt: bulkDay + i })),
      { tmdbId: 'late', addedAt: null, catalogedAt: Date.UTC(2026, 8, 14) },
      { tmdbId: 'plex', addedAt: Date.UTC(2026, 9, 1), catalogedAt: bulkDay },
    ];
    const a = arrivalTimes(films);
    expect(a.get('b0')).toBeNull();
    expect(a.get('late')).toBe(Date.UTC(2026, 8, 14));
    expect(a.get('plex')).toBe(Date.UTC(2026, 9, 1));
  });
});
