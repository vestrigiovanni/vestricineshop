import { describe, it, expect } from 'vitest';
import { parseQuery, shiftFrom, spanBetween, toSearch } from './query';

describe('parseQuery', () => {
  it('legge sala, inizio, durata e filtro', () => {
    expect(parseQuery({ room: '12', from: '2026-09-28', days: '14', vuote: '1' })).toEqual({
      room: 12,
      from: '2026-09-28',
      days: 14,
      onlyEmpty: true,
      tmdb: null,
    });
  });

  it('senza parametri: nessuna sala, nessuna data, una settimana', () => {
    expect(parseQuery({})).toEqual({ room: null, from: null, days: 7, onlyEmpty: false, tmdb: null });
  });

  it('scarta i valori che non hanno senso', () => {
    expect(parseQuery({ room: 'abc', from: '28/09/2026', days: '45' })).toEqual({
      room: null,
      from: null,
      days: 7,
      onlyEmpty: false,
      tmdb: null,
    });
  });

  it('se un parametro è ripetuto, vale il primo', () => {
    expect(parseQuery({ room: ['3', '4'] }).room).toBe(3);
  });
});

describe('un periodo su misura', () => {
  it('accetta qualunque durata da 1 a 30 giorni', () => {
    expect(parseQuery({ days: '5' }).days).toBe(5);
    expect(parseQuery({ days: '30' }).days).toBe(30);
    expect(parseQuery({ days: '0' }).days).toBe(7);
  });

  it('dal lunedì alla domenica sono sette giorni, estremi compresi', () => {
    expect(spanBetween('2026-11-09', '2026-11-15')).toBe(7);
    expect(spanBetween('2026-11-09', '2026-11-09')).toBe(1);
  });

  it('una fine prima dell\'inizio non vale; oltre un mese si ferma a 30', () => {
    expect(spanBetween('2026-11-09', '2026-11-08')).toBeNull();
    expect(spanBetween('2026-11-01', '2027-01-01')).toBe(30);
  });
});

describe('toSearch', () => {
  it('scrive i parametri, e il filtro solo quando è acceso', () => {
    expect(toSearch({ room: 12, from: '2026-09-28', days: 7, onlyEmpty: false })).toBe('?room=12&from=2026-09-28&days=7');
    expect(toSearch({ room: 12, from: '2026-09-28', days: 1, onlyEmpty: true })).toBe('?room=12&from=2026-09-28&days=1&vuote=1');
  });
});

describe('shiftFrom', () => {
  it('va avanti e indietro di un periodo intero', () => {
    expect(shiftFrom('2026-09-28', 7, 1)).toBe('2026-10-05');
    expect(shiftFrom('2026-09-28', 1, -1)).toBe('2026-09-27');
  });
});

describe('il film da accendere', () => {
  it('arriva con ?tmdb=, come la Replica del vecchio pannello', () => {
    expect(parseQuery({ tmdb: '550', room: '12' }).tmdb).toBe('550');
    expect(parseQuery({ tmdb: '  ' }).tmdb).toBeNull();
  });
});
