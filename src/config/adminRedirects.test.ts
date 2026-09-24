import { describe, it, expect } from 'vitest';
import nextConfig from '../../next.config';
import { ROOMS } from '../components/cabina/rooms';

describe('redirects del gestionale', () => {
  it('portano ogni vecchio indirizzo alla sua stanza', async () => {
    const list = await nextConfig.redirects!();
    const map = Object.fromEntries(list.map((r) => [r.source, r.destination]));
    expect(map['/admin/programmazione']).toBe('/admin/programma');
    expect(map['/admin/planner']).toBe('/admin/programma');
    expect(map['/admin/movies-control']).toBe('/admin/film');
    expect(map['/admin/programma/wizard']).toBe('/admin/programma');
  });

  it('sono temporanei, così un domani si possono cambiare senza cache nei browser', async () => {
    const list = await nextConfig.redirects!();
    for (const r of list) expect(r.permanent).toBe(false);
  });

  it('puntano solo a stanze che esistono', async () => {
    const list = await nextConfig.redirects!();
    const hrefs = new Set(ROOMS.map((r) => r.href));
    for (const r of list) expect(hrefs.has(r.destination)).toBe(true);
  });
});
