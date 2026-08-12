import { describe, it, expect } from 'vitest';
import {
  PROJECTION_SPECS,
  commonProjectionSpecs,
  isProjectionSpecCode,
  normalizeProjectionSpecs,
  normalizeProjectionSpecsNote,
  projectionSpecLabels,
} from './projectionSpecs';

describe('normalizeProjectionSpecs', () => {
  it('tiene solo i codici del vocabolario', () => {
    expect(normalizeProjectionSpecs(['4K', 'DOLBY_SURROUND', 'IMAX'])).toEqual(['4K', 'IMAX']);
  });

  it('scarta invece di far fallire: una riga vecchia in database non blocca uno spettacolo', () => {
    expect(normalizeProjectionSpecs(['ROBA_CHE_NON_ESISTE'])).toEqual([]);
    expect(normalizeProjectionSpecs(null)).toEqual([]);
    expect(normalizeProjectionSpecs('4K')).toEqual([]);
    expect(normalizeProjectionSpecs([42, null, undefined, {}])).toEqual([]);
  });

  it('rimette in ordine canonico, qualunque sia quello d\'arrivo', () => {
    expect(normalizeProjectionSpecs(['IMAX', 'ATMOS', '4K', 'DOLBY_VISION'])).toEqual([
      '4K',
      'DOLBY_VISION',
      'ATMOS',
      'IMAX',
    ]);
  });

  it('toglie i doppioni e accetta il minuscolo', () => {
    expect(normalizeProjectionSpecs(['4k', '4K', ' imax '])).toEqual(['4K', 'IMAX']);
  });
});

describe('normalizeProjectionSpecsNote', () => {
  it('taglia gli spazi e trasforma il vuoto in null, come lo vuole il database', () => {
    expect(normalizeProjectionSpecsNote('  copia 35mm  ')).toBe('copia 35mm');
    expect(normalizeProjectionSpecsNote('   ')).toBeNull();
    expect(normalizeProjectionSpecsNote(undefined)).toBeNull();
    expect(normalizeProjectionSpecsNote(12)).toBeNull();
  });

  it('tronca a 120 caratteri: è un bollino, non un comunicato', () => {
    expect(normalizeProjectionSpecsNote('x'.repeat(300))).toHaveLength(120);
  });
});

describe('commonProjectionSpecs', () => {
  it('tiene solo ciò che vale per tutti gli spettacoli', () => {
    expect(commonProjectionSpecs([
      ['4K', 'DOLBY_VISION'],
      ['4K'],
    ])).toEqual(['4K']);
  });

  it('un solo spettacolo: le sue specifiche sono anche quelle del film', () => {
    expect(commonProjectionSpecs([['4K', 'IMAX']])).toEqual(['4K', 'IMAX']);
  });

  it('senza spettacoli non promette niente', () => {
    expect(commonProjectionSpecs([])).toEqual([]);
  });

  it('uno spettacolo senza specifiche azzera la promessa del film', () => {
    // È il caso che conta: la replica del pomeriggio in copia normale non deve
    // far comparire "DOLBY VISION" sulla locandina del film.
    expect(commonProjectionSpecs([['4K', 'DOLBY_VISION'], []])).toEqual([]);
  });
});

describe('projectionSpecLabels', () => {
  it('traduce i codici nelle etichette pubbliche', () => {
    expect(projectionSpecLabels(['4K', 'DOLBY_VISION'])).toEqual(['4K', 'DOLBY VISION']);
  });

  it('IMAX al pubblico si dichiara come versione del film, non come sala', () => {
    expect(projectionSpecLabels(['IMAX'])).toEqual(['VERSIONE IMAX']);
  });

  it('la riga libera va in coda, in maiuscolo come gli altri bollini', () => {
    expect(projectionSpecLabels(['4K'], 'copia 35mm restaurata')).toEqual([
      '4K',
      'COPIA 35MM RESTAURATA',
    ]);
  });

  it('una riga libera vuota non produce un bollino vuoto', () => {
    expect(projectionSpecLabels(['4K'], '   ')).toEqual(['4K']);
  });
});

describe('il vocabolario', () => {
  it('non ha codici doppi', () => {
    const codes = PROJECTION_SPECS.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('ogni voce ha etichette e spiegazione', () => {
    for (const spec of PROJECTION_SPECS) {
      expect(spec.adminLabel.trim()).not.toBe('');
      expect(spec.publicLabel.trim()).not.toBe('');
      expect(spec.description.trim()).not.toBe('');
      expect(isProjectionSpecCode(spec.code)).toBe(true);
    }
  });
});
