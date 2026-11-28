import { describe, expect, it } from 'vitest';
import { pagine, perGiorno, postiRimasti, spettacoliDa, type RigaDisplay, type SpettacoloDisplay } from './display';

// Sabato 28 novembre 2026, le 18:00 a Roma (17:00 UTC: è ora solare).
const NOW = new Date('2026-11-28T17:00:00Z');

const riga = (id: number, dalle: string, o: Partial<RigaDisplay> = {}): RigaDisplay => ({
  pretixId: id,
  dateFrom: new Date(dalle),
  dateTo: new Date(new Date(dalle).getTime() + 2 * 3600_000),
  roomName: 'SALA 1',
  isSoldOut: false,
  availableSeats: 40,
  totalSeats: 80,
  metaLingua: 'Italiano',
  metaSottotitoli: null,
  movie: { tmdbId: String(id), customTitle: `Film ${id}`, customPosterPath: '/p.jpg', customBackdropPath: '/b.jpg', customRating: 'T', customRoomName: null, manualSoldOut: false },
  ...o,
});

const spett = (id: number, inizio: string, o: Partial<SpettacoloDisplay> = {}): SpettacoloDisplay => ({
  id, film: id, titolo: `Film ${id}`, poster: '', fondale: '', divieto: 'T',
  inizio, fine: new Date(new Date(inizio).getTime() + 2 * 3600_000).toISOString(),
  sala: 'Sala 1', lingua: 'Italiano', posti: { stato: 'liberi', liberi: 10, totale: 20 }, ...o,
});

describe('i posti rimasti, dalle quote di Pretix', () => {
  it('con posti ce n\'è il conto, e basta', () => {
    expect(postiRimasti({ availableSeats: 40, totalSeats: 80 })).toEqual({ stato: 'liberi', liberi: 40, totale: 80 });
  });

  it('un quarto della sala o meno sono gli ultimi posti, un posto in più no', () => {
    expect(postiRimasti({ availableSeats: 20, totalSeats: 80 }).stato).toBe('ultimi');
    expect(postiRimasti({ availableSeats: 21, totalSeats: 80 }).stato).toBe('liberi');
  });

  it('zero posti è esaurito, e un conto negativo (ordini oltre la quota) non esce mai', () => {
    expect(postiRimasti({ availableSeats: 0, totalSeats: 80 })).toEqual({ stato: 'esaurito', liberi: 0, totale: 80 });
    expect(postiRimasti({ availableSeats: -3, totalSeats: 80 })).toEqual({ stato: 'esaurito', liberi: 0, totale: 80 });
  });

  it('Pretix che dice esaurito vince sul conto, e così l\'esaurito messo a mano nel gestionale', () => {
    expect(postiRimasti({ isSoldOut: true, availableSeats: 5, totalSeats: 80 }).stato).toBe('esaurito');
    expect(postiRimasti({ manualSoldOut: true, availableSeats: 40, totalSeats: 80 })).toMatchObject({ stato: 'esaurito', liberi: 0 });
  });

  it('senza conto non si inventa niente: né posti, né esaurito', () => {
    expect(postiRimasti({ availableSeats: null, totalSeats: null })).toEqual({ stato: 'ignoti', liberi: null, totale: null });
    expect(postiRimasti({})).toMatchObject({ stato: 'ignoti' });
  });

  it('senza il totale della sala si dice quanti posti restano, ma non «ultimi»', () => {
    expect(postiRimasti({ availableSeats: 2, totalSeats: null })).toEqual({ stato: 'liberi', liberi: 2, totale: null });
  });

  it('Ca Granda ha due posti, ed è voluto: 2 su 2 liberi, 1 ultimo posto, 0 esaurito', () => {
    expect(postiRimasti({ availableSeats: 2, totalSeats: 2 })).toEqual({ stato: 'liberi', liberi: 2, totale: 2 });
    expect(postiRimasti({ availableSeats: 1, totalSeats: 2 })).toEqual({ stato: 'ultimi', liberi: 1, totale: 2 });
    expect(postiRimasti({ availableSeats: 0, totalSeats: 2 })).toEqual({ stato: 'esaurito', liberi: 0, totale: 2 });
  });
});

describe('quali spettacoli arrivano al display', () => {
  it('tiene quello in corso e quelli di oggi e dei due giorni dopo, dal più vicino', () => {
    const righe = [
      riga(4, '2026-11-30T19:00:00Z'),
      riga(1, '2026-11-28T15:30:00Z'), // 16:30, finisce 18:30: in corso
      riga(3, '2026-11-29T19:00:00Z'),
      riga(2, '2026-11-28T19:30:00Z'),
    ];
    expect(spettacoliDa(righe, NOW).map(s => s.id)).toEqual([1, 2, 3, 4]);
  });

  it('toglie quello già finito e quello oltre i giorni mostrati', () => {
    const righe = [
      riga(1, '2026-11-28T10:00:00Z'), // finito alle 13:00
      riga(2, '2026-11-28T19:30:00Z'),
      riga(3, '2026-12-01T19:00:00Z'), // il quarto giorno
    ];
    expect(spettacoliDa(righe, NOW).map(s => s.id)).toEqual([2]);
    expect(spettacoliDa(righe, NOW, 4).map(s => s.id)).toEqual([2, 3]);
  });

  it('i giorni si contano a Roma: dopo mezzanotte è già un altro giorno', () => {
    // 23:30 UTC del 30 novembre sono le 00:30 del 1° dicembre a Roma: il quarto giorno.
    expect(spettacoliDa([riga(1, '2026-11-30T23:30:00Z')], NOW)).toEqual([]);
  });

  it('senza orario di fine si conta un film da due ore', () => {
    const r = riga(1, '2026-11-28T15:30:00Z', { dateTo: null });
    expect(spettacoliDa([r], NOW)).toHaveLength(1); // 16:30 + 2 h = 18:30, ancora in corso
    expect(spettacoliDa([r], new Date('2026-11-28T17:31:00Z'))).toHaveLength(0);
  });

  it('una proiezione senza scheda del film non si mostra, come nella Home', () => {
    expect(spettacoliDa([riga(1, '2026-11-28T19:30:00Z', { movie: null })], NOW)).toEqual([]);
  });

  it('scrive le parole come la Home: la sala, la lingua, il divieto, e i posti dal conto', () => {
    const [s] = spettacoliDa([riga(7, '2026-11-28T19:30:00Z', {
      roomName: 'CA GRANDA', metaLingua: 'Inglese', metaSottotitoli: 'Italiano', availableSeats: 1, totalSeats: 2,
      movie: { tmdbId: '7', customTitle: '  Triangle of Sadness ', customPosterPath: '/p', customBackdropPath: null, customRating: '14', customRoomName: null, manualSoldOut: false },
    })], NOW);
    expect(s).toMatchObject({
      id: 7, film: 7, titolo: 'Triangle of Sadness', poster: '/p', fondale: '', divieto: '14+',
      sala: 'Sala Ca Granda', lingua: 'Inglese, sottotitoli in italiano',
      posti: { stato: 'ultimi', liberi: 1, totale: 2 },
    });
  });

  it('la sala scritta da Gio sulla scheda vince su quella di Pretix, e l\'esaurito a mano su tutto', () => {
    const [s] = spettacoliDa([riga(1, '2026-11-28T19:30:00Z', {
      movie: { tmdbId: '1', customTitle: 'X', customPosterPath: null, customBackdropPath: null, customRating: null, customRoomName: 'Sala Rossa', manualSoldOut: true },
    })], NOW);
    expect(s.sala).toBe('Sala Rossa');
    expect(s.posti.stato).toBe('esaurito');
  });

  it('un titolo che manca non lascia un buco', () => {
    const [s] = spettacoliDa([riga(1, '2026-11-28T19:30:00Z', { movie: { tmdbId: '1', customTitle: null, customPosterPath: null, customBackdropPath: null, customRating: null, customRoomName: null, manualSoldOut: false } })], NOW);
    expect(s.titolo).toBe('Senza titolo');
  });
});

describe('gli spettacoli, giorno per giorno', () => {
  const tutti = [
    spett(1, '2026-11-28T15:30:00Z'), // 16:30, in corso alle 18:00
    spett(2, '2026-11-28T19:30:00Z'),
    spett(3, '2026-11-29T15:00:00Z'),
    spett(4, '2026-11-30T19:00:00Z'),
  ];

  it('Oggi, Domani e poi il giorno per esteso, con la data a parte', () => {
    const g = perGiorno(tutti, NOW);
    expect(g.map(x => x.etichetta)).toEqual(['Oggi', 'Domani', 'Lunedì 30 novembre']);
    expect(g.map(x => x.data)).toEqual(['sabato 28 novembre', 'domenica 29 novembre', 'lunedì 30 novembre']);
    expect(g.map(x => x.spettacoli.map(s => s.id))).toEqual([[1, 2], [3], [4]]);
  });

  it('quello cominciato è «in corso», e quello finito sparisce da solo senza aspettare il server', () => {
    expect(perGiorno(tutti, NOW)[0].spettacoli.map(s => s.inCorso)).toEqual([true, false]);
    const piuTardi = new Date('2026-11-28T18:45:00Z'); // 19:45: il primo è finito
    expect(perGiorno(tutti, piuTardi)[0].spettacoli.map(s => s.id)).toEqual([2]);
  });

  it('un giorno senza più spettacoli non resta come titolo vuoto', () => {
    const tardi = new Date('2026-11-28T22:30:00Z');
    expect(perGiorno(tutti, tardi).map(x => x.etichetta)).toEqual(['Domani', 'Lunedì 30 novembre']);
    expect(perGiorno([], NOW)).toEqual([]);
  });
});

describe('le pagine dello schermo', () => {
  const giorno = (etichetta: string, n: number, da = 1) => ({
    chiave: etichetta, etichetta, data: '', spettacoli: Array.from({ length: n }, (_, i) => ({ ...spett(da + i, '2026-11-28T19:30:00Z'), inCorso: false })),
  });

  it('se ci sta tutto è una pagina sola', () => {
    const p = pagine([giorno('Oggi', 3), giorno('Domani', 2, 10)], 8);
    expect(p).toHaveLength(1);
    expect(p[0].map(b => [b.etichetta, b.spettacoli.length])).toEqual([['Oggi', 3], ['Domani', 2]]);
  });

  it('il titolo del giorno occupa una riga e non resta mai solo in fondo alla pagina', () => {
    // 5 righe di Oggi + titolo = 6; ne restano 2: il titolo di Domani (1) più una riga ci stanno.
    const p = pagine([giorno('Oggi', 5), giorno('Domani', 3, 10)], 8);
    expect(p.map(pg => pg.map(b => [b.etichetta, b.spettacoli.map(s => s.id)]))).toEqual([
      [['Oggi', [1, 2, 3, 4, 5]], ['Domani', [10]]],
      [['Domani', [11, 12]]],
    ]);
    // Con una riga sola libera il titolo di Domani passa alla pagina dopo.
    const q = pagine([giorno('Oggi', 6), giorno('Domani', 1, 10)], 8);
    expect(q.map(pg => pg.map(b => b.etichetta))).toEqual([['Oggi'], ['Domani']]);
  });

  it('un giorno lungo si spezza e ogni pezzo ha il suo titolo, e nessuno spettacolo si perde', () => {
    const p = pagine([giorno('Oggi', 12)], 6);
    expect(p.map(pg => pg[0].spettacoli.length)).toEqual([5, 5, 2]);
    expect(p.flat().flatMap(b => b.spettacoli.map(s => s.id))).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(p.every(pg => pg[0].etichetta === 'Oggi')).toBe(true);
  });

  it('senza spettacoli non ci sono pagine', () => {
    expect(pagine([], 8)).toEqual([]);
  });
});
