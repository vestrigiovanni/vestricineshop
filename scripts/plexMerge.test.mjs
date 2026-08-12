import { describe, it, expect } from 'vitest';
import { identityOf, mergeAcrossLibraries } from './plexMerge.mjs';

/** Un film come esce da `normalizeFilm`, con i campi che qui contano. */
function film(over = {}) {
  return {
    plexKey: '1',
    libraries: ['Film'],
    plexUnmatched: false,
    title: 'Dune',
    originalTitle: null,
    year: 2021,
    durationMin: 155,
    director: null,
    summary: null,
    contentRating: null,
    addedAt: '2026-01-10T10:00:00.000Z',
    tmdbId: '438631',
    imdbId: null,
    ...over,
  };
}

describe('identityOf', () => {
  it('usa l\'id TMDB quando c\'è: è lo stesso per la copia normale e per la 4K', () => {
    expect(identityOf(film({ plexKey: '1' }))).toBe(identityOf(film({ plexKey: '99' })));
  });

  it('senza id TMDB ripiega su titolo e anno, ignorando accenti e punteggiatura', () => {
    const a = film({ tmdbId: null, title: 'Amélie — Il favoloso mondo di' });
    const b = film({ tmdbId: null, title: 'Amelie  Il favoloso mondo di!' });
    expect(identityOf(a)).toBe(identityOf(b));
  });

  it('lo stesso titolo in due anni diversi resta due film', () => {
    const a = film({ tmdbId: null, title: 'Dune', year: 1984 });
    const b = film({ tmdbId: null, title: 'Dune', year: 2021 });
    expect(identityOf(a)).not.toBe(identityOf(b));
  });
});

describe('mergeAcrossLibraries', () => {
  it('lo stesso film in Film e in 4K diventa una riga sola con due librerie', () => {
    const merged = mergeAcrossLibraries([
      film({ plexKey: '10', libraries: ['Film'] }),
      film({ plexKey: '20', libraries: ['4K'] }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].libraries).toEqual(['Film', '4K']);
  });

  it('l\'identità della riga la dà la prima libreria dell\'elenco', () => {
    const merged = mergeAcrossLibraries([
      film({ plexKey: '10', libraries: ['Film'] }),
      film({ plexKey: '20', libraries: ['4K'] }),
    ]);

    // Il plexKey è la riga di catalogo: se ballasse a ogni sincronizzazione,
    // ballerebbe anche il collegamento con le proiezioni già programmate.
    expect(merged[0].plexKey).toBe('10');
  });

  it('la copia dell\'altra libreria riempie i campi che alla prima mancano', () => {
    const merged = mergeAcrossLibraries([
      film({ plexKey: '10', libraries: ['Film'], tmdbId: null, director: null }),
      film({ plexKey: '20', libraries: ['4K'], tmdbId: '438631', director: 'Denis Villeneuve' }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].tmdbId).toBe('438631');
    expect(merged[0].director).toBe('Denis Villeneuve');
  });

  it('anche riattaccando una copia non riconosciuta, l\'identità resta alla prima libreria', () => {
    const merged = mergeAcrossLibraries([
      film({ plexKey: '10', libraries: ['Film'], tmdbId: null, plexUnmatched: true }),
      film({ plexKey: '20', libraries: ['4K'], tmdbId: '438631' }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].plexKey).toBe('10');
    expect(merged[0].libraries).toEqual(['Film', '4K']);
  });

  it('non sovrascrive un campo che la prima libreria aveva già', () => {
    const merged = mergeAcrossLibraries([
      film({ plexKey: '10', libraries: ['Film'], director: 'Villeneuve' }),
      film({ plexKey: '20', libraries: ['4K'], director: 'Sbagliato' }),
    ]);

    expect(merged[0].director).toBe('Villeneuve');
  });

  it('tiene la data d\'ingresso più vecchia: la copia 4K aggiunta oggi non è una novità', () => {
    const merged = mergeAcrossLibraries([
      film({ plexKey: '10', libraries: ['Film'], addedAt: '2025-03-01T00:00:00.000Z' }),
      film({ plexKey: '20', libraries: ['4K'], addedAt: '2026-08-01T00:00:00.000Z' }),
    ]);

    expect(merged[0].addedAt).toBe('2025-03-01T00:00:00.000Z');
  });

  it('basta una copia riconosciuta da Plex perché il film sia riconosciuto', () => {
    const merged = mergeAcrossLibraries([
      film({ plexKey: '10', libraries: ['Film'], tmdbId: null, plexUnmatched: true, title: 'Saggio 2019' }),
      film({ plexKey: '20', libraries: ['4K'], tmdbId: null, plexUnmatched: false, title: 'Saggio 2019' }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].plexUnmatched).toBe(false);
  });

  it('film diversi restano righe diverse', () => {
    const merged = mergeAcrossLibraries([
      film({ plexKey: '10', tmdbId: '1', title: 'Dune' }),
      film({ plexKey: '20', tmdbId: '2', title: 'Arrival', libraries: ['4K'] }),
    ]);

    expect(merged).toHaveLength(2);
    expect(merged.map((f) => f.libraries)).toEqual([['Film'], ['4K']]);
  });

  it('non modifica gli oggetti in ingresso', () => {
    const original = film({ plexKey: '10', libraries: ['Film'] });
    mergeAcrossLibraries([original, film({ plexKey: '20', libraries: ['4K'] })]);

    expect(original.libraries).toEqual(['Film']);
  });
});
