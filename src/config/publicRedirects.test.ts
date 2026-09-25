import { describe, it, expect } from 'vitest';
import nextConfig from '../../next.config';

describe('redirects del sito pubblico', () => {
  it('la vecchia pagina del film apre la home su quel film', async () => {
    const list = await nextConfig.redirects!();
    const movie = list.find((r) => r.source === '/movie/:id');
    // `?subevent=` passa da solo: Next porta avanti la query della richiesta.
    expect(movie).toMatchObject({ destination: '/?film=:id', permanent: false });
  });
});
