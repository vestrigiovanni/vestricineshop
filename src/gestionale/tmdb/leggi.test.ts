import { afterEach, describe, expect, it, vi } from 'vitest';
import { cercaTmdb } from './leggi';

afterEach(() => vi.unstubAllGlobals());

describe('la ricerca su TMDB', () => {
  it('un titolo fatto di cifre è anche un titolo, non solo un id', async () => {
    process.env.TMDB_API_KEY = 'prova';
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => {
      const json = url.pathname.endsWith('/search/movie')
        ? { results: [{ id: 530915, title: '1917', release_date: '2019-12-25' }, { id: 1917, title: 'Doppione' }, { id: 2, title: 'Altro 1917' }] }
        : { id: 1917, title: 'Qui a tué Bambi ?', release_date: '2003-12-24' };
      return new Response(JSON.stringify(json), { status: 200 });
    }));
    expect((await cercaTmdb('1917')).map(t => t.id)).toEqual([530915, 1917, 2]);
  });
});
