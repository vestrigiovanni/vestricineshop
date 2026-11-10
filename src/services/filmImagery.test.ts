import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));

import { withExtraBackdrops, withTaglines } from './filmImagery';

const film = (id: number, extra: string[] = []) => ({ id, backdrop_path: '/main.jpg', extraBackdrops: extra });

afterEach(() => vi.unstubAllGlobals());

describe('withExtraBackdrops', () => {
  it('riempie i fondali mancanti da TMDB, saltando quello principale', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ backdrops: [
        { file_path: '/main.jpg', iso_639_1: null, vote_average: 9, vote_count: 9 },
        { file_path: '/a.jpg', iso_639_1: null, vote_average: 5, vote_count: 3 },
        { file_path: '/b.jpg', iso_639_1: null, vote_average: 7, vote_count: 3 },
      ] }),
    })));
    const [m] = await withExtraBackdrops([film(1)]);
    expect(m.extraBackdrops).toEqual(['/b.jpg', '/a.jpg']);
  });

  it('non tocca i film che hanno già fondali scelti a mano', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const [m] = await withExtraBackdrops([film(2, ['/manuale.jpg'])]);
    expect(m.extraBackdrops).toEqual(['/manuale.jpg']);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('se TMDB non risponde il film resta com\'era', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const [m] = await withExtraBackdrops([film(3)]);
    expect(m.extraBackdrops).toEqual([]);
  });
});

describe('withTaglines', () => {
  it('prende il motto da TMDB per i film che non ce l\'hanno', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ tagline: 'Il tempo distrugge tutto.', original_language: 'fr' }) })));
    const [m] = await withTaglines([{ id: 979, tagline: '' }]);
    expect(m.tagline).toBe('Il tempo distrugge tutto.');
  });

  it('non tocca un motto che c\'è già, e non chiama TMDB', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const [m] = await withTaglines([{ id: 1, tagline: 'Scritto a mano.' }]);
    expect(m.tagline).toBe('Scritto a mano.');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('se TMDB non risponde, o non ha un motto, il film resta senza', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));
    expect((await withTaglines([{ id: 2, tagline: undefined as string | undefined }]))[0].tagline).toBeUndefined();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ tagline: '', original_language: 'en' }) })));
    expect((await withTaglines([{ id: 3, tagline: '' }]))[0].tagline).toBe('');
  });
});
