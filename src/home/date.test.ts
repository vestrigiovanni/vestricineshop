import { describe, expect, it } from 'vitest';
import { formatShowDayLong, formatShowDayShort, formatShowTime, toCinemaDayKey } from './date';

describe('le date di sala, sul fuso di Roma', () => {
  it('il giorno è quello di Roma, non quello UTC', () => {
    // 23:30 UTC del 27 novembre sono già le 00:30 del 28 a Roma
    expect(toCinemaDayKey('2026-11-27T23:30:00Z')).toBe('2026-11-28');
    expect(formatShowTime('2026-11-27T23:30:00Z')).toBe('00:30');
  });

  it('anche con l\'ora legale', () => {
    expect(formatShowTime('2026-07-30T19:30:00Z')).toBe('21:30');
  });

  it('i giorni si scrivono in italiano, senza virgole né punti', () => {
    expect(formatShowDayLong('2026-11-27T19:30:00Z')).toBe('venerdì 27 novembre');
    expect(formatShowDayShort('2026-11-27T19:30:00Z')).toBe('ven 27 nov');
  });
});
