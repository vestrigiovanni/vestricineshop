import { describe, expect, it } from 'vitest';
import { citazioneDi, gruppi, piuVotato, testata } from './leggi.mjs';

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
