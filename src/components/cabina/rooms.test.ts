import { describe, it, expect } from 'vitest';
import { ROOMS, activeRoom, isCompactRoom } from './rooms';

describe('activeRoom', () => {
  it('riconosce la home del gestionale, anche con la barra finale', () => {
    expect(activeRoom('/admin')).toBe('oggi');
    expect(activeRoom('/admin/')).toBe('oggi');
  });

  it('riconosce ogni stanza e le sue sottopagine', () => {
    expect(activeRoom('/admin/programma')).toBe('programma');
    expect(activeRoom('/admin/programma/qualcosa')).toBe('programma');
    expect(activeRoom('/admin/film')).toBe('film');
    expect(activeRoom('/admin/cassa')).toBe('cassa');
    expect(activeRoom('/admin/pannello')).toBe('pannello');
    expect(activeRoom('/admin/catalogo')).toBe('catalogo');
  });

  it('non confonde un prefisso con una stanza', () => {
    // "programmazione" comincia con "programma" ma non è quella stanza
    expect(activeRoom('/admin/programmazione')).toBeNull();
    expect(activeRoom('/admin/filmografia')).toBeNull();
  });

  it('fuori dalle stanze non accende niente', () => {
    expect(activeRoom('/admin/login')).toBeNull();
    expect(activeRoom('/')).toBeNull();
  });
});

describe('isCompactRoom', () => {
  it('la cassa usa la barra compatta, le altre no', () => {
    expect(isCompactRoom('/admin/cassa')).toBe(true);
    expect(isCompactRoom('/admin/programma')).toBe(false);
    expect(isCompactRoom('/admin')).toBe(false);
  });
});

describe('ROOMS', () => {
  it('ha chiavi e indirizzi unici, tutti sotto /admin', () => {
    const keys = ROOMS.map((r) => r.key);
    const hrefs = ROOMS.map((r) => r.href);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const h of hrefs) expect(h === '/admin' || h.startsWith('/admin/')).toBe(true);
  });
});

describe('stanze provvisorie', () => {
  it('il pannello non sta sotto il pollice, ma nel foglio "Altro"', () => {
    expect(ROOMS.find((r) => r.key === 'pannello')?.mobile).toBe(false);
  });
});
