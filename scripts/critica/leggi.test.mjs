import { describe, expect, it } from 'vitest';
import { accenta, citazioneDi, conAccento, gruppi, piuVotato, senzaFirma, sporgenza, testata, uniche } from './leggi.mjs';

// Righe come le restituisce Vision (y dall'alto), prese dal trailer italiano di Fjord.
const riga = (t, y, h = 0.05) => ({ t, x: 0.3, y, w: 0.4, h, c: 1 });

describe('testate lette dai loghi', () => {
  it('riconosce le testate anche lette a metà o storte', () => {
    expect(testata('R3 Reqer Ebert.om')).toBe('RogerEbert.com');
    expect(testata('™« RINGER')).toBe('The Ringer');
    expect(testata('CONTEND')).toBe('The Awards Contender');
    expect(testata('VOGUE')).toBe('Vogue');
    expect(testata('LA REPUBBLICA')).toBe('la Repubblica');
  });
  it('una testata sconosciuta resta com’è, con le maiuscole a posto', () => {
    expect(testata('BADLANDS')).toBe('Badlands');
  });
});

describe('citazioni nei fotogrammi', () => {
  it('frase su due righe, critico e testata', () => {
    const c = citazioneDi([
      riga('"Un film magistrale', 0.4),
      riga('da un maestro del cinema"', 0.47),
      riga('SEAN FENNESSEY, ™ RINGER', 0.545, 0.03),
    ]);
    expect(c).toMatchObject({ testo: 'Un film magistrale da un maestro del cinema', critico: 'Sean Fennessey', fonte: 'The Ringer' });
  });
  it('McQuade, e l’apostrofo tipografico nella frase', () => {
    expect(citazioneDi([riga('"Il film dell\'anno"', 0.4), riga('RYAN MCQUADE, AWARDSWATCH', 0.47, 0.03)]))
      .toMatchObject({ testo: 'Il film dell’anno', critico: 'Ryan McQuade', fonte: 'AwardsWatch' });
  });
  it('il logo sopra la firma conta per la testata', () => {
    const c = citazioneDi([riga('"Il film dell\'anno"', 0.4), riga('LE AWARI', 0.46, 0.02), riga('BRIAN ROWE, CONTENDE', 0.48, 0.03)]);
    expect(c?.fonte).toBe('The Awards Contender');
  });
  it('senza virgolette chiuse (dissolvenza) non è una citazione', () => {
    expect(citazioneDi([riga('"Ti tiene con il fiato sospeso', 0.4), riga('ino ai titoli di coda', 0.47)])).toBeNull();
    expect(citazioneDi([riga('PALMA D\'ORO', 0.4), riga('FESTIVAL DI CANNES', 0.47)])).toBeNull();
  });
});

describe('gruppi di fotogrammi', () => {
  it('una schermata è un gruppo solo, la dissolvenza letta male non ne fa un altro', () => {
    const intera = [riga('"Emozionante"', 0.4), riga('RYAN MCQUADE, AWARDSWATCH', 0.47, 0.03)];
    const g = gruppi([
      { i: 1, righe: [] },
      { i: 2, righe: intera }, { i: 3, righe: intera }, { i: 4, righe: intera },
      { i: 5, righe: [riga('"Emozion', 0.4), riga('nante"', 0.45)] },
      { i: 6, righe: [] },
    ]);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ primo: 2, ultimo: 5 });
    expect(piuVotato(g[0].interi.map(x => x.fonte))).toBe('AwardsWatch');
  });
});

describe('virgoletta di chiusura persa', () => {
  it('la frase finisce dove comincia la firma', () => {
    // Anora, «Dal 20 febbraio al cinema»: rosa sopra un volto, Vision perde la ” finale.
    const c = citazioneDi([riga('"UN\'ESPLOSIONE SELVAGGIA', 0.3, 0.1), riga('E PROFANA', 0.41, 0.1), riga('-VANITY FAIR', 0.53, 0.04)]);
    expect(c?.testo).toBe('UN’ESPLOSIONE SELVAGGIA E PROFANA');
    expect(c?.fonte).toBe('Vanity Fair');
  });
});

describe('accento della È', () => {
  it('E’ ed E\' diventano sempre È', () => {
    expect(accenta("IL FILM E' UN CAPOLAVORO")).toBe('IL FILM È UN CAPOLAVORO');
    expect(accenta('E’ IL FILM DELL’ANNO')).toBe('È IL FILM DELL’ANNO');
  });
  it('le parole che senza accento non esistono', () => {
    expect(accenta('E GIA UN CULT', [true])).toBe('È GIÀ UN CULT');
    expect(accenta('PIU VERO DELLA REALTA')).toBe('PIÙ VERO DELLA REALTÀ');
    expect(accenta('LA DONNA DA AMARE')).toBe('LA DONNA DA AMARE');
  });
  it('la E isolata prende l’accento solo dove sopra c’è il segno', () => {
    expect(accenta('MARGARET QUALLEY E SENSAZIONALE', [true])).toBe('MARGARET QUALLEY È SENSAZIONALE');
    expect(accenta('INTENSO E COMMOVENTE', [false])).toBe('INTENSO E COMMOVENTE');
    expect(accenta('BELLO E FOLLE E UN CAPOLAVORO', [false, true])).toBe('BELLO E FOLLE È UN CAPOLAVORO');
    expect(accenta('SENZA CONTROLLO E SENZA SEGNO')).toBe('SENZA CONTROLLO E SENZA SEGNO');
  });
  it('sporgenza: la cima piatta della E, e il cuneo stretto dell’accento', () => {
    // dal trailer di The Substance («È GIÀ UN CULT»): cima a 165, il cuneo a 158
    const conCuneo = [165, 165, 165, 165, 165, 165, 158, 163, 165, 165, 165, 165];
    expect(sporgenza(conCuneo)).toBe(7);
    expect(conAccento(sporgenza(conCuneo), 435)).toBe(true);
    expect(sporgenza([165, 165, 165, 164, 165, 165, 165])).toBe(1);
    expect(conAccento(1, 435)).toBe(false);
    // mezza lettera più in alto non è un accento (è un'altra cosa letta male)
    expect(sporgenza([150, 150, 150, 150, 165, 165, 165])).toBe(0);
    expect(sporgenza([-1, -1, 165])).toBe(0);
  });
});

describe('uniche', () => {
  it('Anora: la virgola finale e la firma attaccata non fanno un doppione', () => {
    const c = [
      { testo: 'UN’ESPLOSIONE SELVAGGIA E PROFANA,', fonte: 'Vanity Fair', fondale: 'a.jpg' },
      { testo: 'UN’ESPLOSIONE SELVAGGIA E PROFANA FAIR', fonte: 'Vanity Fair', fondale: 'b.jpg' },
    ];
    expect(uniche(c).map(x => x.testo)).toEqual(['UN’ESPLOSIONE SELVAGGIA E PROFANA']);
    expect(senzaFirma('BENTORNATO WENDERS', 'Il Messaggero')).toBe('BENTORNATO WENDERS');
  });

  it('toglie i doppioni e il cartello col titolo', () => {
    const c = [
      { testo: 'LO SPETTATORE RESTA IPNOTIZZATO', fonte: 'Avvenire', fondale: '' },
      { testo: 'LO SPETTATORE RESTA IPNOTIZZATO', fonte: 'Avvenire', fondale: 'b.jpg' },
      { testo: 'THE SUBSTANCE', fonte: 'Elle', fondale: 'c.jpg' },
      { testo: 'BENTORNATO WENDERS', fonte: 'Il Messaggero', fondale: '' },
    ];
    expect(uniche(c, ['The Substance']).map(x => [x.testo, x.fondale])).toEqual([
      ['LO SPETTATORE RESTA IPNOTIZZATO', 'b.jpg'],
      ['BENTORNATO WENDERS', ''],
    ]);
  });
});
