import { describe, expect, it } from 'vitest';
import { formatDuration, pickShows, sideFor, sideValue, stageFor, stageLabel, timerFor } from './displayState';

// Tre spettacoli: 18:00–20:00, 21:15–23:34, 23:40–01:30 (ora di Roma = UTC+2).
const A = { id: 1, title: 'Vermiglio', date_from: '2026-09-25T16:00:00.000Z', date_to: '2026-09-25T18:00:00.000Z' };
const B = { id: 2, title: 'Anora', date_from: '2026-09-25T19:15:00.000Z', date_to: '2026-09-25T21:34:00.000Z' };
const C = { id: 3, title: 'Perfect Days', date_from: '2026-09-25T21:40:00.000Z', date_to: '2026-09-25T23:30:00.000Z' };
const SHOWS = [A, B, C];
const at = (iso: string) => new Date(iso);
const PREROLL = 600; // 10 minuti

describe('pickShows', () => {
  it('durante un film: quello è in corso, poi i due dopo', () => {
    const r = pickShows(SHOWS, at('2026-09-25T20:00:00.000Z'), PREROLL);
    expect([r.current?.id, r.next?.id, r.following?.id]).toEqual([2, 3, undefined]);
  });
  it('il preroll conta già come "in corso"', () => {
    expect(pickShows(SHOWS, at('2026-09-25T19:06:00.000Z'), PREROLL).current?.id).toBe(2);
  });
  it('fra un film e l\'altro: niente in corso, il prossimo e quello dopo', () => {
    const r = pickShows(SHOWS, at('2026-09-25T18:30:00.000Z'), PREROLL);
    expect([r.current, r.next?.id, r.following?.id]).toEqual([null, 2, 3]);
  });
  it('a fine serata: niente', () => {
    expect(pickShows(SHOWS, at('2026-09-26T00:00:00.000Z'), PREROLL)).toEqual({ current: null, next: null, following: null });
  });
});

describe('formatDuration', () => {
  it('scrive ore e minuti a parole, arrotondando per eccesso', () => {
    expect(formatDuration(72 * 60_000)).toBe('1 ora e 12 minuti');
    expect(formatDuration(2 * 3_600_000)).toBe('2 ore');
    expect(formatDuration(60_000)).toBe('1 minuto');
    expect(formatDuration(90_000)).toBe('2 minuti');
  });
});

describe('timerFor', () => {
  it('senza spettacolo: in attesa', () => {
    expect(timerFor(null, at('2026-09-25T18:30:00.000Z'), PREROLL)).toMatchObject({ type: 'idle', label: 'In attesa di proiezioni' });
  });
  it('prima del preroll: "Inizio tra" fino all\'inizio del preroll', () => {
    // B inizia alle 19:15Z, il preroll alle 19:05Z: alle 18:30Z mancano 35 minuti.
    expect(timerFor(B, at('2026-09-25T18:30:00.000Z'), PREROLL)).toMatchObject({ type: 'preroll-countdown', label: 'Inizio tra', value: '35 minuti' });
  });
  it('l\'ultimo minuto prima del preroll è il conto finale, in secondi', () => {
    expect(timerFor(B, at('2026-09-25T19:04:18.000Z'), PREROLL)).toMatchObject({ type: 'final-countdown', label: 'Inizio fra', value: '42' });
  });
  it('durante il preroll, e "Buona visione" nell\'ultimo minuto', () => {
    expect(timerFor(B, at('2026-09-25T19:08:00.000Z'), PREROLL)).toMatchObject({ type: 'preroll-active', value: 'Il film inizierà a breve' });
    expect(timerFor(B, at('2026-09-25T19:14:30.000Z'), PREROLL)).toMatchObject({ type: 'preroll-active', value: 'Buona visione' });
  });
  it('durante il film: "Fine tra" e l\'avanzamento', () => {
    const t = timerFor(B, at('2026-09-25T20:22:00.000Z'), PREROLL);
    expect(t).toMatchObject({ type: 'playing', label: 'Fine tra', value: '1 ora e 12 minuti' });
    expect(Math.round(t.progress)).toBe(48);
  });
});

describe('stageFor, stageLabel, sideFor, sideValue', () => {
  const now = at('2026-09-25T20:00:00.000Z');
  const { current, next, following } = pickShows(SHOWS, now, PREROLL);

  it('in automatico il palco è il film in corso, e a lato il prossimo', () => {
    const stage = stageFor({ selected: null, current, next, swapped: false });
    expect(stage?.id).toBe(2);
    expect(stageLabel(stage, current)).toBe('In sala adesso');
    expect(sideFor({ selected: null, current, next, following, swapped: false })).toEqual({ show: C, label: 'Prossimo spettacolo' });
    expect(sideValue(C, false, now)).toBe('23:40');
  });

  it('scambiati: il prossimo sul palco, quello in corso a lato con i minuti che mancano', () => {
    const stage = stageFor({ selected: null, current, next, swapped: true });
    expect(stage?.id).toBe(3);
    expect(stageLabel(stage, current)).toBe('Prossimo spettacolo · 23:40');
    expect(sideFor({ selected: null, current, next, following, swapped: true })).toEqual({ show: B, label: 'Proiezione in corso' });
    expect(sideValue(B, true, now)).toBe('Fine tra 94 min');
  });

  it('fra un film e l\'altro, a lato c\'è quello dopo il prossimo', () => {
    const r = pickShows(SHOWS, at('2026-09-25T18:30:00.000Z'), PREROLL);
    expect(sideFor({ selected: null, ...r, swapped: false })).toEqual({ show: C, label: 'A seguire' });
  });

  it('scelto a mano: il palco è quello scelto', () => {
    expect(stageFor({ selected: A, current, next, swapped: false })?.id).toBe(1);
    expect(sideFor({ selected: A, current, next, following, swapped: false })?.show.id).toBe(2);
  });
});
