import { describe, expect, it } from 'vitest';
import { autoPick, bandAffinity, type AutoPickFilm } from './autoPick';

const DAY = 86_400_000;

function film(over: Partial<AutoPickFilm> & { tmdbId: string }): AutoPickFilm {
  return {
    title: `Film ${over.tmdbId}`,
    runtime: 110,
    genres: ['Dramma'],
    year: 2015,
    voteAverage: 7,
    voteCount: 800,
    awardLabels: [],
    addedAt: null,
    scheduledCount: 0,
    director: null,
    posterPath: null,
    ...over,
  };
}

/** Un catalogo finto ma vario, come quello vero: generi e durate mescolati. */
function catalog(n = 60): AutoPickFilm[] {
  const genres = [
    ['Animazione', 'Famiglia'],
    ['Commedia'],
    ['Dramma'],
    ['Horror', 'Thriller'],
    ['Azione', 'Avventura'],
    ['Fantascienza'],
    ['Documentario'],
    ['Guerra', 'Dramma'],
  ];
  return Array.from({ length: n }, (_, i) =>
    film({
      tmdbId: String(1000 + i),
      genres: genres[i % genres.length],
      runtime: 85 + ((i * 17) % 100),
      voteAverage: 5.5 + ((i * 7) % 40) / 10,
      voteCount: 100 + i * 60,
      director: `Regista ${i % 12}`,
    })
  );
}

describe('bandAffinity', () => {
  const now = Date.now();

  it('manda in matinée il film corto e leggero, non il dramma lungo', () => {
    const cartone = film({ tmdbId: 'a', genres: ['Animazione', 'Famiglia'], runtime: 95 });
    const fiume = film({ tmdbId: 'b', genres: ['Dramma', 'Guerra'], runtime: 170 });
    expect(bandAffinity(cartone, 'matinee', now)).toBeGreaterThan(bandAffinity(fiume, 'matinee', now));
  });

  it('in prima serata vince il film forte, non quello corto', () => {
    const forte = film({ tmdbId: 'a', voteAverage: 8.3, voteCount: 5000, awardLabels: ['Oscar'], runtime: 135 });
    const innocuo = film({ tmdbId: 'b', voteAverage: 6.1, voteCount: 120, runtime: 95 });
    expect(bandAffinity(forte, 'evening', now)).toBeGreaterThan(bandAffinity(innocuo, 'evening', now));
  });

  it('un voto alto con pochissimi voti non batte un film amato da tutti', () => {
    const raro = film({ tmdbId: 'a', voteAverage: 8.9, voteCount: 25 });
    const amato = film({ tmdbId: 'b', voteAverage: 8.0, voteCount: 8000 });
    expect(bandAffinity(amato, 'evening', now)).toBeGreaterThan(bandAffinity(raro, 'evening', now));
  });

  it('l\'horror sta meglio in seconda serata che in matinée', () => {
    const horror = film({ tmdbId: 'a', genres: ['Horror'], runtime: 105 });
    expect(bandAffinity(horror, 'night', now)).toBeGreaterThan(bandAffinity(horror, 'matinee', now));
  });

  it('la novità in libreria ha la precedenza in prima serata', () => {
    const nuovo = film({ tmdbId: 'a', addedAt: Date.now() - 3 * DAY });
    const vecchio = film({ tmdbId: 'b', addedAt: Date.now() - 800 * DAY });
    expect(bandAffinity(nuovo, 'evening', now)).toBeGreaterThan(bandAffinity(vecchio, 'evening', now));
  });
});

describe('autoPick', () => {
  it('copre tutte le fasce, non solo quella più larga', () => {
    const { films } = autoPick({ pool: catalog(), capacity: 90, seed: 7 });
    const bands = new Set(films.map((f) => f.preferredBand));
    expect(bands).toEqual(new Set(['matinee', 'afternoon', 'evening', 'night']));
  });

  it('propone abbastanza spettacoli da riempire il periodo', () => {
    const { films } = autoPick({ pool: catalog(), capacity: 90, seed: 7 });
    const total = films.reduce((sum, f) => sum + f.replicas, 0);
    expect(total).toBeGreaterThanOrEqual(90 * 0.85);
  });

  it('non propone mai due volte lo stesso film', () => {
    const { films } = autoPick({ pool: catalog(), capacity: 120, seed: 3 });
    expect(new Set(films.map((f) => f.tmdbId)).size).toBe(films.length);
  });

  it('stesso seed, stessa proposta', () => {
    const a = autoPick({ pool: catalog(), capacity: 60, seed: 42 });
    const b = autoPick({ pool: catalog(), capacity: 60, seed: 42 });
    expect(a.films).toEqual(b.films);
  });

  it('seed diverso, proposta diversa', () => {
    const a = autoPick({ pool: catalog(), capacity: 60, seed: 1 });
    const b = autoPick({ pool: catalog(), capacity: 60, seed: 999 });
    expect(a.films.map((f) => f.tmdbId)).not.toEqual(b.films.map((f) => f.tmdbId));
  });

  it('non ripropone i film scartati', () => {
    const pool = catalog();
    const first = autoPick({ pool, capacity: 60, seed: 5 });
    const rejected = first.films.slice(0, 4).map((f) => f.tmdbId);
    const second = autoPick({ pool, capacity: 60, seed: 5, exclude: rejected });
    expect(second.films.some((f) => rejected.includes(f.tmdbId))).toBe(false);
  });

  it('tiene i film che l\'utente ha approvato', () => {
    const pool = catalog();
    const keep = ['1003', '1017'];
    const { films } = autoPick({ pool, capacity: 60, seed: 5, keep });
    for (const id of keep) expect(films.some((f) => f.tmdbId === id)).toBe(true);
  });

  it('non manda in matinée film più lunghi di quanto la fascia regga', () => {
    const { films } = autoPick({ pool: catalog(), capacity: 90, seed: 11 });
    const mattina = films.filter((f) => f.preferredBand === 'matinee');
    expect(mattina.length).toBeGreaterThan(0);
    for (const f of mattina) expect(f.runtime).toBeLessThanOrEqual(150);
  });

  it('varia i generi invece di ripetere lo stesso', () => {
    const { films } = autoPick({ pool: catalog(), capacity: 90, seed: 2 });
    const pool = new Map(catalog().map((f) => [f.tmdbId, f]));
    const generi = films.flatMap((f) => pool.get(f.tmdbId)?.genres ?? []);
    const distinti = new Set(generi);
    expect(distinti.size).toBeGreaterThanOrEqual(5);
  });

  it('scarta i film senza durata invece di programmarli a caso', () => {
    const pool = [...catalog(10), film({ tmdbId: 'muto', runtime: 0 })];
    const { films } = autoPick({ pool, capacity: 30, seed: 1 });
    expect(films.some((f) => f.tmdbId === 'muto')).toBe(false);
  });

  it('dice chiaramente quando il catalogo non basta', () => {
    const { films, warnings } = autoPick({ pool: catalog(2), capacity: 90, seed: 1 });
    expect(films.length).toBeLessThanOrEqual(2);
    expect(warnings.join(' ')).toMatch(/catalogo/i);
  });

  it('senza spazio da riempire non propone niente', () => {
    const { films, warnings } = autoPick({ pool: catalog(), capacity: 0 });
    expect(films).toEqual([]);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('parte indietro chi è già stato programmato molte volte', () => {
    const pool = [
      film({ tmdbId: 'nuovo', genres: ['Dramma'], voteAverage: 7.4, voteCount: 2000, scheduledCount: 0 }),
      film({ tmdbId: 'visto', genres: ['Dramma'], voteAverage: 7.4, voteCount: 2000, scheduledCount: 6 }),
    ];
    const { films } = autoPick({ pool, capacity: 8, seed: 1, targetReplicas: 8 });
    expect(films[0].tmdbId).toBe('nuovo');
  });

  it('ogni film proposto ha almeno una replica e una ragione', () => {
    const { films } = autoPick({ pool: catalog(), capacity: 70, seed: 8 });
    for (const f of films) {
      expect(f.replicas).toBeGreaterThanOrEqual(1);
      expect(f.reason.length).toBeGreaterThan(0);
    }
  });
});
