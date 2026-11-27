import { describe, expect, it } from 'vitest';
import { NEUTRA, luceDa, oklab, oklchHex, stanzaDa, tintaDa } from './tinta';

/** Un'immagine finta: n pixel tutti uguali. */
const tinta = (rgb: [number, number, number], n = 64) => Array.from({ length: n }, () => [...rgb, 255]).flat();

describe('la luce del film', () => {
  it('converte avanti e indietro senza perdere il colore', () => {
    const [L, a, b] = oklab(200, 80, 40);
    const h = (Math.atan2(b, a) * 180) / Math.PI;
    expect(oklchHex(L, Math.hypot(a, b), h)).toBe('#c85028');
  });

  it('un fondale rosso dà una stanza rossa', () => {
    const t = tintaDa(tinta([190, 40, 35]));
    expect(t.c).toBeGreaterThan(0.1);
    expect(t.h).toBeGreaterThan(15);
    expect(t.h).toBeLessThan(40);
  });

  it('un film in bianco e nero dà una stanza senza colore', () => {
    expect(tintaDa(tinta([120, 120, 120]))).toEqual(NEUTRA);
    // Le ombre e i bianchi bruciati non contano.
    expect(tintaDa([...tinta([5, 5, 5]), ...tinta([255, 255, 255])])).toEqual(NEUTRA);
  });

  it('vince il colore che c\'è di più, non quello più acceso', () => {
    const t = tintaDa([...tinta([40, 90, 170], 200), ...tinta([230, 200, 30], 20)]);
    expect(t.h).toBeGreaterThan(230);
    expect(t.h).toBeLessThan(280);
  });

  it('la stanza resta leggibile con qualsiasi film', () => {
    for (const t of [NEUTRA, { h: 30, c: 0.2 }, { h: 140, c: 0.15 }, { h: 260, c: 0.3 }]) {
      const s = stanzaDa(t);
      for (const v of Object.values(s)) expect(v).toMatch(/^#[0-9a-f]{6}$/);
      // Il fondo è scuro e l'accento è chiaro: il contrasto non dipende dal film.
      expect(parseInt(s.fondo.slice(1, 3), 16)).toBeLessThan(40);
      expect(parseInt(s.accento.slice(3, 5), 16)).toBeGreaterThan(190);
    }
  });
});

describe('luceDa (tema Fornace)', () => {
  const rel = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrasto = (a: string, b: string) => { const [x, y] = [rel(a), rel(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

  it('un film in bianco e nero non ha luce sua', () => {
    expect(luceDa(NEUTRA)).toBeNull();
    expect(luceDa({ h: 200, c: 0.01 })).toBeNull();
  });

  it('Prenota resta leggibile per ogni tono', () => {
    for (let h = 0; h < 360; h += 15) {
      const l = luceDa({ h, c: 0.2 })!;
      expect(contrasto(l.accento, l.accentoInk)).toBeGreaterThan(7);
      expect(contrasto(l.accento, l.fondo)).toBeGreaterThan(7);
    }
  });
});
