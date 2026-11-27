import { describe, it, expect } from 'vitest';
import { isCatalogSort, sortCatalog, type SortableFilm } from './catalogSort';

const film = (title: string, over: Partial<SortableFilm> = {}): SortableFilm => ({
  title,
  year: null,
  director: null,
  runtime: null,
  scheduledCount: 0,
  arrivedAt: null,
  taste: 0,
  ...over,
});

const titles = (fs: SortableFilm[]) => fs.map((f) => f.title);

describe('sortCatalog', () => {
  const lib = [
    film('Vertigo', { year: 1958, director: 'Alfred Hitchcock', runtime: 128, scheduledCount: 3, arrivedAt: 10 }),
    film('Anora', { year: 2024, director: 'Sean Baker', runtime: 139, scheduledCount: 0, arrivedAt: 30 }),
    film('Psycho', { year: 1960, director: 'Alfred Hitchcock', runtime: 109, scheduledCount: 1 }),
    film('Mistero', {}),
  ];

  it('per titolo, senza badare alle maiuscole', () => {
    expect(titles(sortCatalog(lib, 'title', 1))).toEqual(['Anora', 'Mistero', 'Psycho', 'Vertigo']);
  });

  it('per anno, e chi non ha l\'anno va in fondo in tutti e due i versi', () => {
    expect(titles(sortCatalog(lib, 'newest', 1))).toEqual(['Anora', 'Psycho', 'Vertigo', 'Mistero']);
    expect(titles(sortCatalog(lib, 'oldest', 1))).toEqual(['Vertigo', 'Psycho', 'Anora', 'Mistero']);
  });

  it('per regista, e dentro il regista in ordine di anno', () => {
    expect(titles(sortCatalog(lib, 'director', 1))).toEqual(['Vertigo', 'Psycho', 'Anora', 'Mistero']);
  });

  it('ultimi arrivati, più corti, meno programmati', () => {
    expect(titles(sortCatalog(lib, 'arrived', 1)).slice(0, 2)).toEqual(['Anora', 'Vertigo']);
    expect(titles(sortCatalog(lib, 'shortest', 1))).toEqual(['Psycho', 'Vertigo', 'Anora', 'Mistero']);
    expect(titles(sortCatalog(lib, 'leastShown', 1))).toEqual(['Anora', 'Mistero', 'Psycho', 'Vertigo']);
  });

  it('a caso: stesso seme stesso ordine, e non tocca l\'elenco di partenza', () => {
    const before = titles(lib);
    expect(titles(sortCatalog(lib, 'random', 42))).toEqual(titles(sortCatalog(lib, 'random', 42)));
    expect(sortCatalog(lib, 'random', 42)).toHaveLength(4);
    expect(titles(lib)).toEqual(before);
  });

  it('consigliati: il gusto pesa più del caso', () => {
    const tasted = [film('Qualunque'), film('Amato', { taste: 10 })];
    expect(sortCatalog(tasted, 'mix', 7)[0].title).toBe('Amato');
  });
});

describe('isCatalogSort', () => {
  it('riconosce solo gli ordini che esistono', () => {
    expect(isCatalogSort('director')).toBe(true);
    expect(isCatalogSort('voto')).toBe(false);
  });
});
