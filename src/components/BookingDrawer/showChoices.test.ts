import { describe, expect, it } from 'vitest';
import { formatShowDayLabel } from '@/utils/cinemaDate';
import { choicesFromCalendar, choicesFromShowcase } from './showChoices';

const NOW = new Date('2026-09-25T10:00:00.000Z');

describe('choicesFromShowcase', () => {
  it('usa le etichette già scritte dal server', () => {
    expect(choicesFromShowcase([
      { id: 1, date: '2026-09-25T19:15:00.000Z', dayLabel: 'Oggi', timeLabel: '21:15', isSoldOut: false },
      { id: 2, date: '2026-09-26T16:30:00.000Z', dayLabel: 'sab 26 set', timeLabel: '18:30', isSoldOut: true },
    ])).toEqual([
      { id: 1, day: 'Oggi', time: '21:15', isSoldOut: false },
      { id: 2, day: 'sab 26 set', time: '18:30', isSoldOut: true },
    ]);
  });
});

describe('choicesFromCalendar', () => {
  const all = [
    { id: 3, date_from: '2026-09-26T16:30:00.000Z', isSoldOut: false, tmdbId: '100' },
    { id: 1, date_from: '2026-09-25T19:15:00.000Z', isSoldOut: false, tmdbId: '100' },
    { id: 2, date_from: '2026-09-25T17:00:00.000Z', isSoldOut: false, tmdbId: '200' },
    { id: 4, date_from: '2026-09-27T19:00:00.000Z', isSoldOut: true, tmdbId: '100' },
  ];

  it('tiene solo gli spettacoli dello stesso film, in ordine di data', () => {
    const choices = choicesFromCalendar(all, 1, NOW);
    expect(choices.map(c => c.id)).toEqual([1, 3, 4]);
    expect(choices[0]).toEqual({ id: 1, day: 'Oggi', time: '21:15', isSoldOut: false });
    expect(choices[1].day).toBe(formatShowDayLabel('2026-09-26T16:30:00.000Z', NOW));
    expect(choices[2].isSoldOut).toBe(true);
  });

  it('senza film o con uno spettacolo sconosciuto non propone niente', () => {
    expect(choicesFromCalendar(all, 99, NOW)).toEqual([]);
    expect(choicesFromCalendar([{ id: 5, date_from: '2026-09-25T19:15:00.000Z', tmdbId: null }], 5, NOW)).toEqual([]);
  });
});
