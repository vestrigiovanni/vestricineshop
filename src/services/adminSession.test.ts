import { describe, it, expect } from 'vitest';
import { passwordMatches, signSession, verifySession } from './adminSession';

const KEY = 'segreto-di-prova';
const NOW = Date.parse('2026-09-25T10:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

describe('la sessione firmata', () => {
  it('un token appena firmato è valido', () => {
    expect(verifySession(signSession(NOW, 30, KEY), NOW + DAY, KEY)).toBe(true);
  });

  it('scaduto non vale più', () => {
    expect(verifySession(signSession(NOW, 30, KEY), NOW + 31 * DAY, KEY)).toBe(false);
  });

  it('se qualcuno allunga la scadenza a mano, la firma non torna', () => {
    const [v, , sig] = signSession(NOW, 30, KEY).split('.');
    const forged = `${v}.${NOW + 3650 * DAY}.${sig}`;
    expect(verifySession(forged, NOW + DAY, KEY)).toBe(false);
  });

  it('firmato con un altro segreto non vale', () => {
    expect(verifySession(signSession(NOW, 30, 'altro'), NOW + DAY, KEY)).toBe(false);
  });

  it('il vecchio cookie fisso e i pasticci non valgono', () => {
    expect(verifySession('vestri_authorized_access_8923', NOW, KEY)).toBe(false);
    expect(verifySession(undefined, NOW, KEY)).toBe(false);
    expect(verifySession('v1.abc.def', NOW, KEY)).toBe(false);
    expect(verifySession('', NOW, KEY)).toBe(false);
  });
});

describe('la password', () => {
  it('confronta esattamente, anche con lunghezze diverse', () => {
    expect(passwordMatches('chiave', 'chiave')).toBe(true);
    expect(passwordMatches('chiav', 'chiave')).toBe(false);
    expect(passwordMatches('chiavE', 'chiave')).toBe(false);
    expect(passwordMatches('', 'chiave')).toBe(false);
  });
});
