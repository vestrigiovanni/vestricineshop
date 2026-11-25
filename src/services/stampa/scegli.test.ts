import { describe, it, expect } from 'vitest';
import { iBanner, laLocandina, laPagina, leFoto, misureDalNome, punteggio, slug, trailerVerticale, type File } from './scegli';

const ycse = { titoli: ['You Can See Everything'], regia: ['Nathan Fielder', 'Lance Oppenheim'] };

describe('slug', () => {
  it('come WordPress: minuscolo, senza accenti, con trattini', () => {
    expect(slug('L’alba sulla mietitura')).toBe('lalba-sulla-mietitura');
    expect(slug('Amélie & co.')).toBe('amelie-e-co');
  });
});

describe('punteggio', () => {
  it('I Wonder: titolo seguito da "di" e dal regista', () => {
    expect(punteggio('you-can-see-everything-di-nathan-fielder-lance-oppenheim', ycse)).toBe(3);
  });
  it('titolo esatto (Lucky Red, BIM, Notorious)', () => {
    expect(punteggio('barry-lyndon', { titoli: ['Barry Lyndon'], regia: ['Stanley Kubrick'] })).toBe(3);
  });
  it('un titolo corto non aggancia un film più lungo', () => {
    expect(punteggio('it-ends-di-alex-ullom-dal-29-ottobre-al-cinema', { titoli: ['It'], regia: ['Andy Muschietti'] })).toBe(0);
  });
  it('accetta il "di" anche senza il regista', () => {
    expect(punteggio('sorry-baby-di-eva-victor', { titoli: ['Sorry, Baby'], regia: [] })).toBe(2);
  });
  it('un altro film che comincia allo stesso modo vale poco', () => {
    expect(punteggio('primetime-2-il-ritorno', { titoli: ['Primetime'], regia: [] })).toBe(0);
  });
});

describe('laPagina', () => {
  const pagine = [
    { slug: 'it-ends-di-alex-ullom-dal-29-ottobre-al-cinema' },
    { slug: 'you-can-see-everything-di-nathan-fielder-lance-oppenheim' },
    { slug: 'primetime-di-lance-oppenheim-dal-15-ottobre-al-cinema' },
  ];
  it('trova quella giusta', () => {
    expect(laPagina(pagine, ycse)?.slug).toBe('you-can-see-everything-di-nathan-fielder-lance-oppenheim');
  });
  it('nessuna se non c’è', () => {
    expect(laPagina(pagine, { titoli: ['Barry Lyndon'], regia: ['Stanley Kubrick'] })).toBeNull();
  });
  it('nessuna se due si equivalgono', () => {
    expect(laPagina([{ slug: 'nosferatu' }, { slug: 'nosferatu-2' }, { slug: 'nosferatu' }], { titoli: ['Nosferatu'], regia: [] })?.slug).toBe('nosferatu');
    expect(laPagina([{ slug: 'la-luce-di-mario-rossi' }, { slug: 'la-luce-di-anna-bianchi' }], { titoli: ['La luce'], regia: [] })).toBeNull();
  });
});

describe('misureDalNome', () => {
  it('legge 1920x1080 e 70×100', () => {
    expect(misureDalNome('IWP_YCSE_1920x1080.jpg')).toEqual({ w: 1920, h: 1080 });
    expect(misureDalNome('IWP_YCSE_FBCOVER-1600x900.jpg')).toEqual({ w: 1600, h: 900 });
    expect(misureDalNome('Trailer_16x9.jpg')).toBeNull();
  });
});

const conMisure = (percorso: string): File => ({ percorso, ...misureDalNome(percorso) });

describe('iBanner', () => {
  const banner = ['1024x576', '1080x1080', '1080x1920', '1920x1080', '728x90', '720x1140', '960x100', 'FBCOVER-1600x900']
    .map(m => conMisure(`Banner Web/IWP_YCSE_${m}.jpg`));
  it('il 16:9 più grande e il 9:16 più alto', () => {
    const b = iBanner(banner);
    expect(b.orizzontale?.percorso).toBe('Banner Web/IWP_YCSE_1920x1080.jpg');
    expect(b.verticale?.percorso).toBe('Banner Web/IWP_YCSE_1080x1920.jpg');
  });
  it('niente banner fra le foto', () => {
    expect(iBanner([conMisure('Foto/scena_1920x1080.jpg')])).toEqual({ orizzontale: undefined, verticale: undefined });
  });
});

describe('laLocandina', () => {
  it('prima la web', () => {
    const f = laLocandina([
      { percorso: 'Poster quad/IWP_YCSE_poster_QUAD_web.jpg' },
      { percorso: 'Poster Instagram Feed/IWP_YCSE_poster_IG_web.jpg' },
      { percorso: 'Poster web/IWP_YCSE_poster_web.jpg' },
    ]);
    expect(f?.percorso).toBe('Poster web/IWP_YCSE_poster_web.jpg');
  });
  it('scarta i pdf da stampa e le orizzontali', () => {
    expect(laLocandina([{ percorso: 'Poster 70×100/x.pdf' }, { percorso: 'Poster/quad.jpg', w: 1600, h: 1200 }])).toBeUndefined();
  });
  it('Drive senza estensione', () => {
    expect(laLocandina([{ percorso: 'POSTER/WEB/Poster_Official_MarieClaire_70x100' }])?.percorso).toBe('POSTER/WEB/Poster_Official_MarieClaire_70x100');
  });
});

describe('leFoto', () => {
  it('le foto dello zip, senza il pdf dei crediti', () => {
    const f = leFoto([
      { percorso: 'Foto/Caption Credit - YOU CAN SEE EVERYTHING.pdf' },
      { percorso: 'Foto/IWP_YCSE_2_V8_PHASE 1_LOBTS.jpg' },
      { percorso: 'Foto/IWP_YCSE_4_YCSE BTS STILL.jpeg' },
      { percorso: 'Banner web/IWP_YCSE_1920x1080.jpg' },
    ]);
    expect(f.map(x => x.percorso)).toEqual(['Foto/IWP_YCSE_2_V8_PHASE 1_LOBTS.jpg', 'Foto/IWP_YCSE_4_YCSE BTS STILL.jpeg']);
  });
});

describe('trailerVerticale', () => {
  it('il 9:16, non il DCP', () => {
    const v = trailerVerticale([
      { etichetta: 'Trailer DCP', url: 'https://bit.ly/YCSE_TLR' },
      { etichetta: 'Trailer Verticale', url: 'https://bit.ly/YCSE_TRL_H264_916' },
    ]);
    expect(v?.url).toBe('https://bit.ly/YCSE_TRL_H264_916');
    expect(trailerVerticale([{ etichetta: 'Trailer social 9:16', url: 'x' }])?.url).toBe('x');
  });
});

describe('1SHT', () => {
  it('il "one sheet" è una locandina', () => {
    expect(laLocandina([{ percorso: 'Locandina/SOLSTICE_DIGI_1SHT_ARENA_ITA_P1_R2-1-scaled.jpg' }])?.percorso).toContain('1SHT');
  });
});
