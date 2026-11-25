import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { STAMPA, logoTestata } from './loghiStampa';

describe('loghi delle testate', () => {
  it('ogni logo dell’elenco esiste in public/loghi/stampa', () => {
    for (const s of STAMPA) expect(fs.existsSync(path.resolve('public/loghi/stampa', `${s}.png`)), s).toBe(true);
  });
  it('riconosce le testate come le scrive «Critica dal trailer»', () => {
    expect(logoTestata('The Hollywood Reporter')).toBe('/loghi/stampa/the-hollywood-reporter.png');
    expect(logoTestata('Vogue')).toBe('/loghi/stampa/vogue.png');
    expect(logoTestata('Elle')).toBe('/loghi/stampa/elle.png');
    expect(logoTestata('VANITY FAIR')).toBe('/loghi/stampa/vanity-fair.png');
    expect(logoTestata('Sight & Sound')).toBe('/loghi/stampa/sight-and-sound.png');
    expect(logoTestata('RogerEbert.com')).toBeNull();
    expect(logoTestata('The Ringer')).toBeNull();
  });
});
