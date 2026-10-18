import { describe, expect, it } from 'vitest';
import { languageLabel, pickInitialMovieId, pickInitialSubeventId } from './linkData';

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

describe('pickInitialSubeventId', () => {
  const movies = [
    { id: 10, subevents: [{ id: 1, isSoldOut: false }, { id: 2, isSoldOut: true }] },
    { id: 20, subevents: [{ id: 3, isSoldOut: false }] },
  ];
  it('apre lo spettacolo chiesto se è del film e si può ancora prenotare', () => {
    expect(pickInitialSubeventId(movies, 10, '1')).toBe(1);
  });
  it('ignora uno spettacolo esaurito, di un altro film o sconosciuto', () => {
    expect(pickInitialSubeventId(movies, 10, '2')).toBeNull();
    expect(pickInitialSubeventId(movies, 10, '3')).toBeNull();
    expect(pickInitialSubeventId(movies, 10, '99')).toBeNull();
    expect(pickInitialSubeventId(movies, 10, 'abc')).toBeNull();
  });
  it('senza film o senza spettacolo non apre niente', () => {
    expect(pickInitialSubeventId(movies, null, '1')).toBeNull();
    expect(pickInitialSubeventId(movies, 10, undefined)).toBeNull();
  });
});
