import { describe, expect, it } from 'vitest';
import type { FilmTmdb } from '../tmdb/scelte';
import { STUB, cambiato, daModulo, moduloDa, prossima, riempi, tornaATmdb, type Scheda } from './scheda';

const tmdb: FilmTmdb = {
  tmdbId: '1', titolo: 'Titolo TMDB', titoloOriginale: 'Original', linguaOriginale: 'fr', trama: 'Trama TMDB', motto: 'Motto',
  locandina: '/p.jpg', fondale: '/f.jpg', logo: '/l.png', fondaliExtra: ['/x.jpg'], generi: ['Dramma'], voto: 7.4,
  divieto: '14+', uscita: '2025-03-01', durata: 118, regia: ['Agnès Varda'], cast: ['A', 'B'], trailer: ['abc12345678', 'zzz'],
};

describe('la sync riempie le schede da TMDB', () => {
  it('un film nuovo prende tutto da TMDB', () => {
    const d = riempi(null, tmdb);
    expect(d.customTitle).toBe('Titolo TMDB');
    expect(d.customOverview).toBe('Trama TMDB');
    expect(d.customTrailerUrl).toBe('https://www.youtube.com/watch?v=abc12345678');
    expect(d.customTrailerKeys).toEqual(['abc12345678', 'zzz']);
    expect(d.customDirector).toBe('Agnès Varda');
    expect(d.versionLanguage).toBe('FRANCESE');
    expect(d.subtitles).toBe('ITA');
    expect(d.runtime).toBe(118);
  });

  it('una scheda «Caricamento...» smette di esserlo', () => {
    expect(riempi({ customTitle: STUB, isManualOverride: false }, tmdb).customTitle).toBe('Titolo TMDB');
  });

  it('i testi di Gio vincono: la sync riempie solo i campi mai toccati', () => {
    const gio: Partial<Scheda> = { customTitle: 'Il titolo di Gio', customOverview: '', customLogoPath: 'none', customPosterPath: null, isManualOverride: true };
    const d = riempi(gio, tmdb);
    expect(d.customTitle).toBeUndefined();
    expect(d.customOverview).toBeUndefined(); // svuotata da Gio: resta vuota
    expect(d.customLogoPath).toBeUndefined(); // logo nascosto da Gio
    expect(d.customPosterPath).toBe('/p.jpg'); // mai toccata: arriva da TMDB
  });

  it('nemmeno «Rileggi da TMDB» tocca i testi di Gio', () => {
    expect(riempi({ customTitle: 'Il titolo di Gio', isManualOverride: true }, tmdb, true).customTitle).toBeUndefined();
  });

  it('una scheda della sync si completa nei buchi e si riscrive solo a richiesta', () => {
    const sync: Partial<Scheda> = { customTitle: 'Vecchio', customOverview: '', isManualOverride: false };
    expect(riempi(sync, tmdb).customTitle).toBeUndefined();
    expect(riempi(sync, tmdb).customOverview).toBe('Trama TMDB');
    expect(riempi(sync, tmdb, true).customTitle).toBe('Titolo TMDB');
  });

  it('quello che TMDB non sa non cancella niente', () => {
    const vuoto: FilmTmdb = { ...tmdb, logo: '', trailer: [], trama: '' };
    const d = riempi({ customLogoPath: '/mio.png', customTrailerKeys: ['k'], customOverview: 'x', isManualOverride: false }, vuoto, true);
    expect(d.customLogoPath).toBeUndefined();
    expect(d.customTrailerKeys).toBeUndefined();
    expect(d.customOverview).toBeUndefined();
  });

  it('niente da fare se è già tutto uguale', () => {
    const prima = { ...riempi(null, tmdb), isManualOverride: false };
    expect(riempi(prima, tmdb)).toEqual({});
  });

  it('un film italiano non ha sottotitoli', () => {
    expect(riempi(null, { ...tmdb, linguaOriginale: 'it' })).toMatchObject({ versionLanguage: 'ITALIANO', subtitles: 'NESSUNO' });
  });
});

describe('torna come su TMDB', () => {
  it('riscrive i testi ma tiene lingua e sottotitoli della copia in sala', () => {
    const d = tornaATmdb(tmdb);
    expect(d.customTitle).toBe('Titolo TMDB');
    expect(d.isManualOverride).toBe(false);
    expect(d).not.toHaveProperty('versionLanguage');
    expect(d).not.toHaveProperty('subtitles');
  });
});

describe('il modulo', () => {
  it('lo stub non si mostra come titolo', () => {
    expect(moduloDa({ customTitle: STUB }).customTitle).toBe('');
  });

  it('salvando la scheda diventa di Gio, con regia e cast in ordine', () => {
    const m = { ...moduloDa({ customTitle: '  Titolo  ' }), customDirector: 'A ,B,, C ', customCast: '' };
    expect(daModulo(m)).toMatchObject({ isManualOverride: true, customTitle: 'Titolo', customDirector: 'A, B, C', customCast: '' });
  });

  it('un titolo vuoto non si salva vuoto', () => {
    expect(daModulo(moduloDa({})).customTitle).toBeNull();
  });

  it('si accorge delle modifiche', () => {
    const a = moduloDa({ customTitle: 'A' });
    expect(cambiato(a, { ...a })).toBe(false);
    expect(cambiato(a, { ...a, manualSoldOut: true })).toBe(true);
  });
});

describe('la prossima proiezione', () => {
  it('guarda avanti, non all\'ultima', () => {
    const ora = Date.parse('2026-11-27T12:00:00Z');
    const p = [{ dateFrom: '2026-11-20T20:00:00Z' }, { dateFrom: new Date('2026-12-02T20:00:00Z') }, { dateFrom: '2026-11-28T20:00:00Z' }];
    expect(prossima(p, ora)).toEqual({ prossima: '2026-11-28T20:00:00Z', quante: 2 });
    expect(prossima([], ora)).toEqual({ prossima: null, quante: 0 });
  });
});
