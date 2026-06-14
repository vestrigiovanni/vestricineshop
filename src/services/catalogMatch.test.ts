import { describe, it, expect } from 'vitest';
import { normalizeText, yearMatches, directorMatches, pickBestMatch } from './catalogMatch';

describe('normalizeText', () => {
  it('rimuove accenti, punteggiatura e uniforma spazi/maiuscole', () => {
    expect(normalizeText('  Cuatro  Lunas! ')).toBe('cuatro lunas');
    expect(normalizeText('Amélie')).toBe('amelie');
    expect(normalizeText(null)).toBe('');
  });
});

describe('yearMatches', () => {
  it('accetta entro la tolleranza di ±1', () => {
    expect(yearMatches(2014, '2014-09-01')).toBe(true);
    expect(yearMatches(2014, '2015-01-01')).toBe(true);
    expect(yearMatches(2014, '2016-01-01')).toBe(false);
  });
  it('se manca l anno CSV non penalizza', () => {
    expect(yearMatches(null, '1999-01-01')).toBe(true);
  });
});

describe('directorMatches', () => {
  it('confronta normalizzando e con fallback sul cognome', () => {
    expect(directorMatches('Paolo Sorrentino', ['Paolo Sorrentino'])).toBe(true);
    expect(directorMatches('P. Sorrentino', ['Paolo Sorrentino'])).toBe(true);
    expect(directorMatches('Steven Spielberg', ['Christopher Nolan'])).toBe(false);
    expect(directorMatches(null, ['Qualcuno'])).toBe(false);
  });
});

describe('pickBestMatch', () => {
  const row = { title: '4 Moons', year: 2014, director: 'Sergio Tovar Velarde' };

  it('anno + regista => ok', () => {
    const res = pickBestMatch(row, [
      { id: '111', title: 'Other', releaseDate: '2001-01-01', directors: ['X'] },
      { id: '258034', title: '4 Lune', releaseDate: '2014-09-01', directors: ['Sergio Tovar Velarde'] },
    ]);
    expect(res).toEqual({ tmdbId: '258034', status: 'ok' });
  });

  it('anno giusto ma regista diverso => suspect', () => {
    const res = pickBestMatch(row, [
      { id: '999', title: '4 Moons', releaseDate: '2014-05-01', directors: ['Mario Rossi'] },
    ]);
    expect(res).toEqual({ tmdbId: '999', status: 'suspect' });
  });

  it('nessun candidato utile => null', () => {
    expect(pickBestMatch(row, [])).toBeNull();
  });
});
