import { describe, it, expect } from 'vitest';
import { estimateFreeSlots, mergeIntervals, summarizeDay, USABLE_MINUTES } from './occupancy';
import { CLOSING_MINUTE, MINUTES_PER_DAY, OPENING_MINUTE } from './times';

/** Comodità: intervallo del giorno 0 espresso in ore decimali. */
const at = (fromHour: number, toHour: number) => ({
  start: Math.round(fromHour * 60),
  end: Math.round(toHour * 60),
});

describe('mergeIntervals', () => {
  it('unisce ciò che si sovrappone e lascia stare il resto', () => {
    expect(mergeIntervals([at(10, 12), at(11, 13), at(15, 16)]))
      .toEqual([at(10, 13), at(15, 16)]);
  });

  it('unisce anche gli intervalli che si toccano appena', () => {
    expect(mergeIntervals([at(10, 12), at(12, 14)])).toEqual([at(10, 14)]);
  });

  it('non si fa ingannare dall\'ordine di arrivo', () => {
    expect(mergeIntervals([at(20, 22), at(10, 12), at(15, 16)]))
      .toEqual([at(10, 12), at(15, 16), at(20, 22)]);
  });

  it('scarta gli intervalli vuoti o invertiti', () => {
    expect(mergeIntervals([at(12, 12), at(14, 13)])).toEqual([]);
  });
});

describe('summarizeDay', () => {
  it('una giornata vuota è un unico buco lungo tutte le ore utili', () => {
    const s = summarizeDay([], 0);
    expect(s.busyMinutes).toBe(0);
    expect(s.saturation).toBe(0);
    expect(s.gaps).toHaveLength(1);
    expect(s.gaps[0]).toMatchObject({ from: '10:00', to: '01:00', minutes: USABLE_MINUTES });
  });

  it('trova il buco fra due proiezioni e quelli ai bordi', () => {
    // 14:00–16:00 e 18:00–20:00 occupati
    const s = summarizeDay([at(14, 16), at(18, 20)], 0);
    expect(s.gaps.map((g) => `${g.from}–${g.to}`)).toEqual(['10:00–14:00', '16:00–18:00', '20:00–01:00']);
    expect(s.busyMinutes).toBe(240);
  });

  it('ignora i buchi troppo stretti per starci un film', () => {
    // Fra le 16:00 e le 16:50 ci sono 50 minuti: non basta.
    const s = summarizeDay([at(10, 16), at(16 + 50 / 60, 22)], 0);
    expect(s.gaps.map((g) => g.from)).toEqual(['22:00']);
  });

  it('la saturazione è la quota delle ore utili, mai oltre il 100%', () => {
    expect(summarizeDay([at(10, 17.5)], 0).saturation).toBeCloseTo(450 / USABLE_MINUTES, 5);
    // Un blocco che deborda dalle ore utili viene ritagliato, non fa sforare.
    expect(summarizeDay([{ start: 0, end: MINUTES_PER_DAY + 600 }], 0).saturation).toBe(1);
  });

  it('ritaglia ciò che sta fuori dagli orari di apertura', () => {
    // Un blocco 08:00–11:00 conta solo per l'ora dentro l'apertura.
    const s = summarizeDay([at(8, 11)], 0);
    expect(s.busyMinutes).toBe(60);
    expect(s.gaps[0].from).toBe('11:00');
  });

  it('tiene la coda dopo la mezzanotte attaccata alla sua serata', () => {
    // Uno spettacolo 23:00–00:50 appartiene alla serata del giorno 0.
    const s = summarizeDay([{ start: 23 * 60, end: 24 * 60 + 50 }], 0);
    expect(s.busyMinutes).toBe(110);
    // Resta libero solo il tratto 10:00–23:00; dopo, i 10 minuti fino all'01:00
    // sono troppo pochi per comparire.
    expect(s.gaps.map((g) => `${g.from}–${g.to}`)).toEqual(['10:00–23:00']);
  });

  it('lavora sul giorno giusto quando l\'indice non è zero', () => {
    const day = 3;
    const base = day * MINUTES_PER_DAY;
    const s = summarizeDay([{ start: base + 14 * 60, end: base + 16 * 60 }], day);
    expect(s.busyMinutes).toBe(120);
    expect(s.gaps[0]).toMatchObject({ from: '10:00', startMinute: base + OPENING_MINUTE });
    expect(s.gaps[1]).toMatchObject({ from: '16:00', to: '01:00' });
    expect(s.gaps[1].startMinute + s.gaps[1].minutes).toBe(base + CLOSING_MINUTE);
  });

  it('una giornata piena non lascia buchi', () => {
    const s = summarizeDay([{ start: OPENING_MINUTE, end: CLOSING_MINUTE }], 0);
    expect(s.gaps).toEqual([]);
    expect(s.saturation).toBe(1);
  });

  it('gli intervalli disordinati e sovrapposti non gonfiano il conto', () => {
    // Due proiezioni sovrapposte (succede: override manuali) contano una volta.
    const s = summarizeDay([at(18, 20), at(14, 16), at(15, 19)], 0);
    expect(s.busyMinutes).toBe(6 * 60); // 14:00–20:00
    expect(s.gaps.map((g) => g.from)).toEqual(['10:00', '20:00']);
  });
});

describe('estimateFreeSlots', () => {
  it('conta quanti film tipici entrano nei buchi', () => {
    const gaps = summarizeDay([at(14, 16)], 0).gaps; // 10:00–14:00 e 16:00–01:00
    // 240 minuti → 2 spettacoli, 540 minuti → 4
    expect(estimateFreeSlots(gaps)).toBe(6);
  });

  it('un buco più corto di uno spettacolo non conta', () => {
    expect(estimateFreeSlots([{ from: '10:00', to: '11:30', minutes: 90, startMinute: 600 }])).toBe(0);
  });
});
