import { describe, expect, it } from 'vitest';
import { chiaveGiusta, chiavi, creaFreno, firmaSessione, sessioneValida } from './sessione';

const SEGRETO = 'segreto-di-prova-lungo-almeno-trentadue-caratteri';
const ORA = Date.parse('2026-11-27T10:00:00Z');
const GIORNO = 24 * 60 * 60 * 1000;

describe('la sessione firmata', () => {
  it('un token appena firmato è valido', () => {
    expect(sessioneValida(firmaSessione(ORA, SEGRETO, 30), ORA + GIORNO, SEGRETO)).toBe(true);
  });

  it('scaduto non vale più', () => {
    expect(sessioneValida(firmaSessione(ORA, SEGRETO, 30), ORA + 31 * GIORNO, SEGRETO)).toBe(false);
  });

  it('se qualcuno allunga la scadenza a mano, la firma non torna', () => {
    const [v, , f] = firmaSessione(ORA, SEGRETO, 30).split('.');
    expect(sessioneValida(`${v}.${ORA + 3650 * GIORNO}.${f}`, ORA + GIORNO, SEGRETO)).toBe(false);
  });

  it('firmato con un altro segreto non vale', () => {
    expect(sessioneValida(firmaSessione(ORA, 'un-altro-segreto-lungo-trentadue-caratteri!', 30), ORA + GIORNO, SEGRETO)).toBe(false);
  });

  it('senza segreto non vale niente', () => {
    expect(sessioneValida(firmaSessione(ORA, SEGRETO, 30), ORA, undefined)).toBe(false);
  });

  it('il vecchio cookie fisso e i pasticci non valgono', () => {
    expect(sessioneValida('vestri_authorized_access_8923', ORA, SEGRETO)).toBe(false);
    expect(sessioneValida(undefined, ORA, SEGRETO)).toBe(false);
    expect(sessioneValida('v1.abc.def', ORA, SEGRETO)).toBe(false);
    expect(sessioneValida('', ORA, SEGRETO)).toBe(false);
  });
});

describe('le chiavi', () => {
  it('senza password o senza segreto il gestionale resta chiuso', () => {
    expect(chiavi({})).toBeNull();
    expect(chiavi({ ADMIN_PASSWORD: 'x' })).toBeNull();
    expect(chiavi({ ADMIN_SESSION_SECRET: SEGRETO })).toBeNull();
  });

  it('un segreto corto non basta', () => {
    expect(chiavi({ ADMIN_PASSWORD: 'x', ADMIN_SESSION_SECRET: 'corto' })).toBeNull();
  });

  it('con tutte e due si entra', () => {
    expect(chiavi({ ADMIN_PASSWORD: 'x', ADMIN_SESSION_SECRET: SEGRETO })).toEqual({ password: 'x', segreto: SEGRETO });
  });

  it('confronta la chiave esattamente, anche con lunghezze diverse', () => {
    expect(chiaveGiusta('chiave', 'chiave')).toBe(true);
    expect(chiaveGiusta('chiav', 'chiave')).toBe(false);
    expect(chiaveGiusta('chiavE', 'chiave')).toBe(false);
    expect(chiaveGiusta('', 'chiave')).toBe(false);
  });
});

describe('il freno', () => {
  it('dopo troppi errori ferma, poi dopo la finestra riapre', () => {
    const f = creaFreno(3, 1000);
    for (let i = 0; i < 3; i++) f.sbagliata('ip', ORA + i);
    expect(f.fermo('ip', ORA + 10)).toBe(true);
    expect(f.fermo('altro', ORA + 10)).toBe(false);
    expect(f.fermo('ip', ORA + 2000)).toBe(false);
  });

  it('la chiave giusta azzera gli errori', () => {
    const f = creaFreno(2, 1000);
    f.sbagliata('ip', ORA);
    f.giusta('ip');
    f.sbagliata('ip', ORA + 1);
    expect(f.fermo('ip', ORA + 2)).toBe(false);
  });
});
