import { describe, expect, it } from 'vitest';
import {
  cartellino, crediti, divieto, divietoEsteso, durata, generi, giornoDi, lingua, mancanti, posti, premi, premio, premioInRiga,
  quando, sala, tecnica, titoloOriginale, unisci, voto, type Film, type Show,
} from './metadati';

const NOW = new Date('2026-11-10T09:00:00Z');

const show = (extra: Partial<Show> = {}): Show => ({ id: 1, date: '2026-11-10T19:30:00Z', ...extra });
const film = (extra: Partial<Film> = {}): Film => ({ id: 1, title: 'Triangle of Sadness', subevents: [], ...extra });

/** Il film pieno, come lo dà il catalogo quando non manca niente. */
const PIENO = film({
  director: 'Ruben Östlund', release_year: '2022', runtime: 147, genres: ['Commedia', 'Dramma', 'Satira'], voteAverage: 7.049, rating: '14+',
  originalTitle: 'Triangle of Sadness',
  awards: [
    { type: 'cannes', year: 2022, details: "Vincitore: Palma d'oro" },
    { type: 'oscar', year: 2023, details: 'Candidatura: Miglior film, Miglior regista' },
    { type: 'toronto', year: 2022, details: 'Selezione Ufficiale' },
  ],
});
const SERA = show({ language: 'Inglese', subtitles: 'Italiano', roomName: 'CA GRANDA', specs: ['4K', 'ATMOS'], availableSeats: 40, totalSeats: 60 });

describe('le parole dei metadati', () => {
  it('la durata si scrive come si dice', () => {
    expect(durata(147)).toBe('2\u00a0h\u00a027\u00a0min');
    expect(durata(65)).toBe('1\u00a0h\u00a005\u00a0min');
    expect(durata(52)).toBe('52\u00a0min');
    expect(durata(120)).toBe('2\u00a0h');
  });

  it('una durata che manca non si scrive', () => {
    for (const m of [0, null, undefined, -5, NaN]) expect(durata(m)).toBe('');
  });

  it('la sala torna minuscola, con "Sala" davanti una volta sola', () => {
    expect(sala(show({ roomName: 'CA GRANDA' }))).toBe('Sala Ca Granda');
    expect(sala(show({ roomName: 'SALA 1' }))).toBe('Sala 1');
    expect(sala(show({ roomName: 'Sala Fellini' }))).toBe('Sala Fellini');
    expect(sala(show({ roomName: "CA' GRANDA" }))).toBe("Sala Ca' Granda");
  });

  it('"Sala" da sola è il segnaposto della pagina: non si mostra', () => {
    expect(sala(show({ roomName: 'Sala' }))).toBe('');
    expect(sala(show({ roomName: '' }))).toBe('');
    expect(sala(show())).toBe('');
  });

  it('la lingua dice anche i sottotitoli, e "Nessuno" non è una lingua', () => {
    expect(lingua(show({ language: 'Francese', subtitles: 'Italiano' }))).toBe('Francese, sottotitoli in italiano');
    expect(lingua(show({ language: 'Italiano', subtitles: 'Nessuno' }))).toBe('Italiano');
    expect(lingua(show({ language: 'Originale', subtitles: 'ITALIANO' }))).toBe('Versione originale, sottotitoli in italiano');
    expect(lingua(show({ subtitles: 'Italiano' }))).toBe('Sottotitoli in italiano');
    expect(lingua(show())).toBe('');
  });

  it('come si proietta: i bollini, poi la riga libera', () => {
    expect(tecnica(show({ specs: ['4K', 'DOLBY_VISION', 'ATMOS'], specsNote: 'copia 35mm restaurata' }))).toEqual(['4K', 'Dolby Vision', 'Dolby Atmos', 'copia 35mm restaurata']);
    expect(tecnica(show())).toEqual([]);
  });

  it('il voto ha la virgola, e zero vuol dire nessun voto', () => {
    expect(voto(film({ voteAverage: 6.961 }))).toBe('7,0');
    expect(voto(film({ voteAverage: 7.44 }))).toBe('7,4');
    for (const v of [0, null, undefined]) expect(voto(film({ voteAverage: v }))).toBe('');
  });

  it('i generi sono al massimo due', () => {
    expect(generi(PIENO)).toEqual(['Commedia', 'Dramma']);
    expect(generi(film())).toEqual([]);
    expect(generi(film({ genres: ['', ' Dramma '] }))).toEqual(['Dramma']);
  });

  it('il divieto si scrive solo se c\'è', () => {
    expect(divieto(film({ rating: '14+' }))).toBe('14+');
    expect(divietoEsteso(film({ rating: '18+' }))).toBe('Vietato ai minori di 18 anni');
    expect(divieto(film({ rating: 'T' }))).toBe('');
    expect(divieto(film())).toBe('');
    expect(divietoEsteso(film({ rating: 'T' }))).toBe('');
  });

  it('il titolo originale solo quando è un altro titolo', () => {
    expect(titoloOriginale(film({ title: 'Chiamami col tuo nome', originalTitle: 'Call Me by Your Name' }))).toBe('Call Me by Your Name');
    expect(titoloOriginale(film({ title: 'Malèna', originalTitle: 'Malena' }))).toBe('');
    expect(titoloOriginale(film({ title: '8½', originalTitle: '8½' }))).toBe('');
    expect(titoloOriginale(film())).toBe('');
  });

  it('il giorno si dice come lo si dice in sala', () => {
    expect(giornoDi('2026-11-10T19:30:00Z', NOW)).toBe('Oggi');
    expect(giornoDi('2026-11-11T19:30:00Z', NOW)).toBe('Domani');
    expect(giornoDi('2026-11-13T19:30:00Z', NOW)).toBe('Venerdì 13 novembre');
    expect(quando(show(), NOW)).toBe('Oggi alle 20:30');
  });
});

describe('i posti', () => {
  it('esaurito vince su tutto', () => {
    expect(posti(show({ isSoldOut: true, availableSeats: 3, totalSeats: 60 }))).toEqual({ stato: 'esaurito', testo: 'Esaurito' });
  });

  it('"ultimi posti" solo quando il conto c\'è ed è basso', () => {
    expect(posti(show({ availableSeats: 1, totalSeats: 2 })).testo).toBe('Ultimo posto');
    expect(posti(show({ availableSeats: 9, totalSeats: 60 })).testo).toBe('Ultimi 9 posti');
    expect(posti(show({ availableSeats: 2, totalSeats: 2 })).stato).toBe('liberi');
    expect(posti(show({ availableSeats: 40, totalSeats: 60 })).stato).toBe('liberi');
  });

  it('senza conto dei posti si dice soltanto che ci sono', () => {
    expect(posti(show())).toEqual({ stato: 'liberi', testo: 'Posti disponibili' });
    expect(posti(show({ availableSeats: 1 })).stato).toBe('liberi');
    expect(posti(show({ availableSeats: null, totalSeats: null })).stato).toBe('liberi');
  });
});

describe('i premi', () => {
  it('in ordine d\'importanza, ognuno col suo festival', () => {
    const p = premi(PIENO);
    expect(p.map(x => x.festival.key)).toEqual(['cannes', 'oscar', 'toronto']);
    expect(p[0]).toMatchObject({ titolo: "Palma d'oro", dove: 'Cannes 2022', vinto: true });
  });

  it('una candidatura non è un premio: si scrive "Candidatura"', () => {
    const [, oscar, toronto] = premi(PIENO);
    expect(oscar).toMatchObject({ titolo: 'Candidatura', dove: 'Miglior film, Oscar 2023', vinto: false });
    expect(toronto).toMatchObject({ titolo: 'Selezione ufficiale', dove: 'Toronto 2022', vinto: false });
  });

  it('il premio in una riga, per le schede piccole', () => {
    expect(premioInRiga(premio(PIENO))).toBe("Palma d'oro · Cannes 2022");
    expect(premioInRiga(premio(film({ awards: [{ type: 'cannes', year: 2002, details: "Candidatura: Palma d'oro" }] })))).toBe("Candidatura · Palma d'oro, Cannes 2002");
  });

  it('un film senza premi non ne ha, e non lascia righe vuote', () => {
    expect(premi(film())).toEqual([]);
    expect(premio(film())).toBeNull();
    expect(premioInRiga(premio(film()))).toBe('');
    expect(premio(film({ awards: [{ type: 'venice', details: 'Selezione Ufficiale' }] }))).toMatchObject({ titolo: 'Selezione ufficiale', dove: 'Venezia' });
  });
});

describe('il cartellino: che cosa si mostra quando un dato manca', () => {
  it('col film pieno ci sono tutte le righe', () => {
    expect(cartellino(PIENO, SERA, NOW)).toMatchObject({
      quando: 'Oggi alle 20:30',
      sala: 'Sala Ca Granda',
      film: 'Ruben Östlund · 2022 · 2\u00a0h\u00a027\u00a0min',
      versione: 'Inglese, sottotitoli in italiano · 4K · Dolby Atmos',
      generi: 'Commedia · Dramma',
      divieto: '14+',
      posti: { stato: 'liberi' },
    });
    expect(mancanti(PIENO, SERA)).toEqual([]);
  });

  it('senza regia, anno o durata la riga del film si accorcia, senza separatori orfani', () => {
    expect(cartellino(film({ director: 'Ruben Östlund', runtime: 147 }), SERA, NOW).film).toBe('Ruben Östlund · 2\u00a0h\u00a027\u00a0min');
    expect(cartellino(film({ release_year: '2022' }), SERA, NOW).film).toBe('2022');
    expect(cartellino(film({ director: '  ', runtime: 0 }), SERA, NOW).film).toBe('');
    expect(unisci(['', null, undefined, false, '  '])).toBe('');
    expect(crediti(film({ director: ' ' }))).toEqual([]);
  });

  it('un film nudo ha solo il quando: tutto il resto è vuoto, niente è inventato', () => {
    const c = cartellino(film(), show(), NOW);
    expect(c).toMatchObject({ quando: 'Oggi alle 20:30', sala: '', film: '', versione: '', generi: '', divieto: '', premio: null });
    expect(Object.values(c).filter(v => typeof v === 'string').join('')).not.toMatch(/undefined|null|NaN|·\s*$|^\s*·/);
    expect(mancanti(film(), show())).toEqual(['sala', 'lingua', 'durata', 'regia', 'anno']);
  });

  it('senza lingua resta come si proietta, e viceversa', () => {
    expect(cartellino(PIENO, show({ specs: ['4K'] }), NOW).versione).toBe('4K');
    expect(cartellino(PIENO, show({ language: 'Italiano', subtitles: 'Nessuno' }), NOW).versione).toBe('Italiano');
  });
});
