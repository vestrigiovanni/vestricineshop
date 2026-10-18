import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));

import { withExtraBackdrops } from './filmImagery';

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
