import { describe, expect, it } from 'vitest';
import { fondaliExtra, linguaVersione, nonLatino, normalizzaDivieto, ordineTrailer, sceltaDivieto, sceltaFondale, sceltaLogo, sceltaMotto, type Immagine } from './scelte';

const img = (file_path: string, iso: string | null, voto = 5, width = 1920): Immagine => ({ file_path, iso_639_1: iso, vote_average: voto, vote_count: 10, width });

describe('il logo', () => {
  it('italiano, poi inglese, poi la lingua originale', () => {
    expect(sceltaLogo([img('/fr', 'fr'), img('/en', 'en'), img('/it', 'it')], 'fr')).toBe('/it');
    expect(sceltaLogo([img('/fr', 'fr'), img('/en', 'en')], 'fr')).toBe('/en');
    expect(sceltaLogo([img('/fr', 'fr')], 'fr')).toBe('/fr');
  });
  it('mai un logo in un\'altra lingua: meglio il titolo scritto', () => {
    expect(sceltaLogo([img('/ru', 'ru'), img('/zh', 'zh')], 'fr')).toBe('');
  });
});

describe('il fondale', () => {
  it('senza scritte e in Full HD, sempre lo stesso per lo stesso film', () => {
    const f = [img('/scritta', 'en', 9), img('/piccolo', null, 9, 1280), img('/a', null, 8), img('/b', null, 6)];
    expect(sceltaFondale(f, '/tmdb', '2')).toBe('/a');
    expect(sceltaFondale(f, '/tmdb', '3')).toBe('/b');
    expect(sceltaFondale(f, '/tmdb', '3')).toBe(sceltaFondale(f, '/tmdb', '3'));
  });
  it('senza fondali resta quello di TMDB', () => {
    expect(sceltaFondale([], '/tmdb', '1')).toBe('/tmdb');
  });
});

describe('i fondali in più', () => {
  it('escludono il principale e i doppioni, prima quelli senza scritte', () => {
    expect(fondaliExtra([img('/main', null), img('/en', 'en', 9), img('/a', null, 6), img('/a', null, 6), img('/b', null, 8)], '/main'))
      .toEqual(['/b', '/a', '/en']);
  });
});

describe('il motto', () => {
  it('italiano, poi originale in latino, poi inglese', () => {
    const tr = (l: string, t: string) => ({ iso_639_1: l, data: { tagline: t } });
    expect(sceltaMotto({ tagline: 'Ciao' })).toBe('Ciao');
    expect(sceltaMotto({ tagline: '', original_language: 'fr', translations: { translations: [tr('fr', 'Salut'), tr('en', 'Hi')] } })).toBe('Salut');
    expect(sceltaMotto({ tagline: '', original_language: 'ja', translations: { translations: [tr('ja', 'こんにちは'), tr('en', 'Hi')] } })).toBe('Hi');
    expect(sceltaMotto(null)).toBe('');
  });
});

describe('il divieto', () => {
  it('normalizza i codici come la v1', () => {
    expect(normalizzaDivieto('VM14')).toBe('14+');
    expect(normalizzaDivieto('PG-13')).toBe('14+');
    expect(normalizzaDivieto('12')).toBe('10+');
    expect(normalizzaDivieto('16')).toBe('18+');
    expect(normalizzaDivieto('')).toBe('T');
  });
  it('l\'Italia vince, prima l\'uscita in sala', () => {
    const u = { results: [{ iso_3166_1: 'IT', release_dates: [{ certification: '', type: 1 }, { certification: 'VM14', type: 3 }] }, { iso_3166_1: 'US', release_dates: [{ certification: 'G' }] }] };
    expect(sceltaDivieto(u)).toBe('14+');
  });
  it('senza Italia ascolta i vicini europei', () => {
    expect(sceltaDivieto({ results: [{ iso_3166_1: 'DE', release_dates: [{ certification: '12' }] }, { iso_3166_1: 'US', release_dates: [{ certification: 'PG' }] }] })).toBe('14+');
  });
  it('un divieto alto altrove pesa', () => {
    expect(sceltaDivieto({ results: [{ iso_3166_1: 'KR', release_dates: [{ certification: '19' }] }, { iso_3166_1: 'US', release_dates: [{ certification: 'PG' }] }] })).toBe('18+');
  });
  it('poi gli Stati Uniti', () => {
    expect(sceltaDivieto({ results: [{ iso_3166_1: 'US', release_dates: [{ certification: 'R' }] }] })).toBe('14+');
  });
  it('horror senza dati mai per tutti, documentario sì', () => {
    expect(sceltaDivieto({ results: [] }, [{ name: 'Horror' }])).toBe('14+');
    expect(sceltaDivieto({ results: [{ iso_3166_1: 'US', release_dates: [{ certification: 'PG-13' }] }] }, [{ id: 99, name: 'Documentario' }])).toBe('T');
  });
});

describe('i trailer', () => {
  const v = (key: string, lingua: string, type = 'Trailer', official = true) => ({ key, iso_639_1: lingua, type, official, site: 'YouTube' });
  it('film francese: prima l\'originale, poi l\'inglese, poi l\'italiano', () => {
    expect(ordineTrailer([v('it', 'it'), v('en', 'en'), v('fr', 'fr')], 'fr')).toEqual(['fr', 'en', 'it']);
  });
  it('film giapponese: prima l\'italiano', () => {
    expect(ordineTrailer([v('ja', 'ja'), v('en', 'en'), v('it', 'it')], 'ja')).toEqual(['it', 'en', 'ja']);
  });
  it('i trailer prima dei teaser, niente doppioni né video non YouTube', () => {
    expect(ordineTrailer([v('t', 'it', 'Teaser'), v('a', 'it'), v('a', 'en'), { key: 'x', site: 'Vimeo', type: 'Trailer' }], 'it')).toEqual(['a', 't']);
  });
});

describe('la lingua', () => {
  it('come la scrive la v1', () => {
    expect(linguaVersione('en')).toBe('INGLESE');
    expect(linguaVersione('it')).toBe('ITALIANO');
    expect(linguaVersione('xx')).toBe('XX');
  });
  it('riconosce i titoli non latini', () => {
    expect(nonLatino('Il ragazzo e l’airone')).toBe(false);
    expect(nonLatino('君たちはどう生きるか')).toBe(true);
  });
});
