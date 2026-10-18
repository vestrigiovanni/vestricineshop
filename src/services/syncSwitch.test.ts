import { describe, it, expect } from 'vitest';
import { isSyncOff } from './syncSwitch';

describe('isSyncOff', () => {
  it('spegne il sync solo con VESTRI_SYNC_OFF=1', () => {
    expect(isSyncOff({ VESTRI_SYNC_OFF: '1' })).toBe(true);
  });

  it('lascia il sync acceso se la variabile manca o ha altri valori', () => {
    expect(isSyncOff({})).toBe(false);
    expect(isSyncOff({ VESTRI_SYNC_OFF: '0' })).toBe(false);
    expect(isSyncOff({ VESTRI_SYNC_OFF: 'true' })).toBe(false);
  });
});
