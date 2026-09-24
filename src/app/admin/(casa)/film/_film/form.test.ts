import { describe, it, expect } from 'vitest';
import { EMPTY_FORM, formFrom, isDirty, movieIdOf, tmdbImage, toPayload, youtubeThumb } from './form';

const DUEL = {
  id: 839,
  title: 'Duel',
  overview: 'Un camionista insegue un automobilista.',
  original_language: 'en',
  poster_path: '/duel.jpg',
  backdrop_path: '/duel-bg.jpg',
  logo_path: null,
  director: ['Steven Spielberg'],
  cast: ['Dennis Weaver', 'Jacqueline Scott'],
  rating: 'T',
  trailerKey: 'abc123XYZ_-',
  mubiId: 'duel',
};

describe('formFrom', () => {
  it('senza personalizzazioni prende tutto da TMDB', () => {
    const f = formFrom(DUEL, {}, 'CA GRANDA');
    expect(f.customTitle).toBe('Duel');
    expect(f.customDirector).toBe('Steven Spielberg');
    expect(f.customCast).toBe('Dennis Weaver, Jacqueline Scott');
    expect(f.subtitles).toBe('ITA');
    expect(f.customRoomName).toBe('CA GRANDA');
    expect(f.customTrailerUrl).toBe('https://www.youtube.com/watch?v=abc123XYZ_-');
  });

  it('le personalizzazioni vincono, anche quando sono vuote di proposito', () => {
    const f = formFrom(DUEL, { customTitle: 'Duel (versione restaurata)', customOverview: '', manualSoldOut: true });
    expect(f.customTitle).toBe('Duel (versione restaurata)');
    expect(f.customOverview).toBe('');
    expect(f.manualSoldOut).toBe(true);
  });

  it('un film italiano non ha sottotitoli, e senza sala si usa quella di sempre', () => {
    const f = formFrom({ ...DUEL, original_language: 'it' }, {});
    expect(f.subtitles).toBe('NESSUNO');
    expect(f.customRoomName).toBe('SALA CA GRANDA');
  });
});

describe('toPayload', () => {
  it('regia e cast tornano elenchi, e i campi vuoti non inventano nomi', () => {
    const p = toPayload({ ...EMPTY_FORM, customDirector: 'Coen,  Coen ', customCast: '' });
    expect(p.customDirector).toEqual(['Coen', 'Coen']);
    expect(p.customCast).toBeUndefined();
  });
});

describe('isDirty', () => {
  it('si accorge di una modifica, anche piccola', () => {
    const a = formFrom(DUEL, {});
    expect(isDirty(a, { ...a })).toBe(false);
    expect(isDirty(a, { ...a, customRating: '14+' })).toBe(true);
  });
});

describe('immagini e trailer', () => {
  it('un percorso TMDB diventa un indirizzo, un indirizzo resta com’è, “none” non si mostra', () => {
    expect(tmdbImage('/duel.jpg', 'w92')).toBe('https://image.tmdb.org/t/p/w92/duel.jpg');
    expect(tmdbImage('https://esempio.it/a.jpg', 'w92')).toBe('https://esempio.it/a.jpg');
    expect(tmdbImage('none', 'w92')).toBeNull();
    expect(tmdbImage('', 'w92')).toBeNull();
  });

  it('la miniatura di YouTube viene dall’indirizzo del trailer', () => {
    expect(youtubeThumb('https://www.youtube.com/watch?v=abc123XYZ_-')).toBe('https://img.youtube.com/vi/abc123XYZ_-/mqdefault.jpg');
    expect(youtubeThumb('non è un trailer')).toBeNull();
  });

  it('l’identità del film viene dall’id o dal tmdbId', () => {
    expect(movieIdOf({ id: 839 })).toBe('839');
    expect(movieIdOf({ tmdbId: '839' })).toBe('839');
  });
});

describe('le date in sala', () => {
  it('la prossima è la prima futura, e si contano solo quelle future', async () => {
    const { nextShowing } = await import('./form');
    const now = Date.parse('2026-09-29T12:00:00Z');
    const p = [
      { pretixId: 1, dateFrom: '2026-09-28T19:00:00Z' },
      { pretixId: 2, dateFrom: '2026-10-02T19:00:00Z' },
      { pretixId: 3, dateFrom: '2026-09-30T19:00:00Z' },
    ];
    expect(nextShowing(p, now)).toEqual({ next: '2026-09-30T19:00:00Z', upcoming: 2 });
    expect(nextShowing([{ pretixId: 1, dateFrom: '2026-09-28T19:00:00Z' }], now)).toEqual({ next: null, upcoming: 0 });
  });
});
