import { describe, expect, it } from 'vitest';
import { calculatePretixDateTime } from './dateUtils';

describe('calculatePretixDateTime', () => {
  it('d’estate scrive +02:00', () => {
    expect(calculatePretixDateTime('2026-10-20', '22:30')).toBe('2026-10-20T22:30:00+02:00');
  });

  it('dopo il cambio d’ora scrive +01:00, non anticipa lo spettacolo', () => {
    expect(calculatePretixDateTime('2026-10-28', '22:30')).toBe('2026-10-28T22:30:00+01:00');
  });

  it('la domenica del cambio, la sera è già ora solare', () => {
    expect(calculatePretixDateTime('2026-10-25', '22:00')).toBe('2026-10-25T22:00:00+01:00');
  });

  it('la fine oltre mezzanotte passa al giorno dopo', () => {
    expect(calculatePretixDateTime('2026-10-28', '22:30', 110)).toBe('2026-10-29T00:20:00+01:00');
    expect(calculatePretixDateTime('2026-12-31', '23:00', 120)).toBe('2027-01-01T01:00:00+01:00');
  });
});
