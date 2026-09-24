import { describe, it, expect } from 'vitest';
import { dayLong, dayShort, periodLabel } from './labels';

describe('etichette', () => {
  it('giorno corto e lungo, in italiano', () => {
    expect(dayShort('2026-09-29')).toBe('Mar 29');
    expect(dayLong('2026-09-29')).toBe('martedì 29 settembre');
  });

  it('il periodo, con il mese solo dove serve', () => {
    expect(periodLabel('2026-09-28', 7)).toBe('28 set – 4 ott');
    expect(periodLabel('2026-10-05', 7)).toBe('5 – 11 ott');
    expect(periodLabel('2026-09-29', 1)).toBe('martedì 29 settembre');
  });
});
