import { describe, expect, test } from 'vitest';
import { cosaPrende, riassunto, verdetto, type Sondato } from './sonda';

const vuoto: Sondato = { foto: 0, zip: [], locandina: false, banner: false, rotti: [] };

describe('Chi ha le foto?', () => {
  test('foto sciolte o uno zip di foto: pronto', () => {
    expect(verdetto({ ...vuoto, foto: 2 })).toBe('pronto');
    expect(verdetto({ ...vuoto, zip: [{ etichetta: 'Foto', mb: 60 }] })).toBe('pronto');
  });
  test('solo Dropbox o solo la locandina: a mano', () => {
    expect(verdetto({ ...vuoto, dropbox: 'https://www.dropbox.com/scl/fo/x' })).toBe('a-mano');
    expect(verdetto({ ...vuoto, locandina: true })).toBe('a-mano');
  });
  test('link rotti e basta: niente', () => {
    expect(verdetto({ ...vuoto, rotti: ['Foto'] })).toBe('niente');
  });
  test('il riassunto dice quello che c’è', () => {
    expect(riassunto({ ...vuoto, foto: 4, locandina: true, banner: true })).toBe('4 foto · locandina · banner');
    expect(riassunto({ ...vuoto, zip: [{ etichetta: 'Foto web', mb: 20 }] })).toBe('zip «Foto web» (20 MB)');
    expect(riassunto(vuoto)).toBe('nessun file utile');
  });
  test('cosa prende «Riempi dal distributore»', () => {
    expect(cosaPrende({ ...vuoto, foto: 3 })).toBe('foto');
    expect(cosaPrende({ ...vuoto, foto: 3, locandina: true, banner: true })).toBe('foto, locandina e banner');
  });
});
