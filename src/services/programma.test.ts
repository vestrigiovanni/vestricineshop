import { describe, it, expect } from 'vitest';
import { perGiorno } from './programma';

const p = (id: number, iso: string, titolo = 'Film') => ({ id, inizio: new Date(iso), titolo });

describe('perGiorno', () => {
  const ora = new Date('2026-11-27T15:00:00Z');

  it('mostra solo le proiezioni future, dalla più vicina', () => {
    const giorni = perGiorno([p(1, '2026-11-28T20:00:00Z'), p(2, '2026-11-27T10:00:00Z'), p(3, '2026-11-27T19:00:00Z')], ora);
    expect(giorni.flatMap((g) => g.proiezioni.map((x) => x.id))).toEqual([3, 1]);
  });

  it('divide i giorni secondo l\'ora di Roma, non quella UTC', () => {
    // 23:30 UTC del 27 è già il 28 a Roma
    const giorni = perGiorno([p(1, '2026-11-27T23:30:00Z'), p(2, '2026-11-28T18:00:00Z')], ora);
    expect(giorni).toHaveLength(1);
    expect(giorni[0].giorno).toBe('2026-11-28');
  });

  it('senza proiezioni future non restituisce giorni', () => {
    expect(perGiorno([p(1, '2026-11-01T20:00:00Z')], ora)).toEqual([]);
  });
});
