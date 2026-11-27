import { describe, expect, it } from 'vitest';
import { ogniGiorno, periodo, specialeInSala, type ProiezioneSpeciale } from './proiezioneSpeciale';

/** La prima, You Can See Everything (25 novembre 2026), come sta nel database. */
const YCSE: ProiezioneSpeciale = {
  tmdbId: 1765072,
  inizio: '2026-11-25',
  sopra: 'Un documentario di Nathan Fielder e Lance Oppenheim',
  casa: { nome: 'A24', logo: '/1ZXsGaFPgrgS6ZZGS37AqD5uU12.png' },
  fondale: '/rrbbzCyS45yooXpUGJatfptlHYI.jpg',
  citazioni: [{ testo: 'Un assoluto capolavoro', fonte: 'Awards Watch', fondale: '/gsSAPAcHDSQOSIDZVm1alSZpDCv.jpg' }],
};
const SPECIALI = [YCSE];

const film = (id: number, date: string[], esauriti: string[] = []) => ({
  id,
  title: `Film ${id}`,
  subevents: date.map((d, i) => ({ id: id * 100 + i, date: d, isSoldOut: esauriti.includes(d) })),
});

describe('specialeInSala', () => {
  const ycse = YCSE.tmdbId;
  // 16:00 e 21:00 a Roma, in UTC (novembre: +1).
  const date = ['2026-11-25T15:00:00.000Z', '2026-11-25T20:00:00.000Z', '2026-12-08T20:00:00.000Z'];

  it('si accende finché il film ha spettacoli futuri, con gli orari in ora di Roma', () => {
    const r = specialeInSala([film(1, ['2026-11-25T18:00:00.000Z']), film(ycse, date)], new Date('2026-11-25T09:00:00.000Z'), SPECIALI);
    expect(r?.movie.id).toBe(ycse);
    expect(r?.show.date).toBe(date[0]);
    expect(r?.orari).toEqual(['16:00', '21:00']);
  });

  it("salta gli esauriti per Prenota, ma tiene l'atto", () => {
    const r = specialeInSala([film(ycse, date, [date[0]])], new Date('2026-11-25T09:00:00.000Z'), SPECIALI);
    expect(r?.show.date).toBe(date[1]);
  });

  it("dopo l'ultimo spettacolo la home torna com'era", () => {
    expect(specialeInSala([film(ycse, date)], new Date('2026-12-08T21:00:00.000Z'), SPECIALI)).toBeNull();
  });

  it("senza il film in programma non c'è niente", () => {
    expect(specialeInSala([film(1, date)], new Date('2026-11-25T09:00:00.000Z'), SPECIALI)).toBeNull();
  });

  it('con due speciali vince quella col primo spettacolo più vicino', () => {
    const altra = { ...YCSE, tmdbId: 7 };
    const r = specialeInSala([film(ycse, [date[2]]), film(7, [date[1]])], new Date('2026-11-25T09:00:00.000Z'), [YCSE, altra]);
    expect(r?.movie.id).toBe(7);
  });
});

describe('periodo', () => {
  const fine = '2026-12-08T20:00:00.000Z';
  it('il primo giorno, le date intere del cinema', () => {
    expect(periodo('2026-11-25', fine, new Date('2026-11-25T09:00:00.000Z'))).toBe("Dal 25 novembre all'8 dicembre");
  });
  it('a rassegna cominciata, solo la fine', () => {
    expect(periodo('2026-11-25', fine, new Date('2026-11-26T09:00:00.000Z'))).toBe("Fino all'8 dicembre");
  });
  it('prima che cominci, le date intere', () => {
    expect(periodo('2026-11-25', fine, new Date('2026-11-20T09:00:00.000Z'))).toBe("Dal 25 novembre all'8 dicembre");
  });
  it('nello stesso mese il mese si dice una volta, e si elide davanti a 8 e 11', () => {
    expect(periodo('2026-12-08', '2026-12-11T20:00:00.000Z', new Date('2026-12-01T09:00:00.000Z'))).toBe("Dall'8 all'11 dicembre");
    expect(periodo('2026-12-02', '2026-12-20T20:00:00.000Z', new Date('2026-12-01T09:00:00.000Z'))).toBe('Dal 2 al 20 dicembre');
  });
  it('un giorno solo', () => {
    expect(periodo('2026-12-08', '2026-12-08T20:00:00.000Z', new Date('2026-12-01T09:00:00.000Z'))).toBe("L'8 dicembre");
  });
  it('a mezzanotte di Roma il giorno è già quello dopo', () => {
    // 23:30 UTC del 30 novembre = 00:30 del 1° dicembre a Roma.
    expect(periodo('2026-11-25', '2026-11-30T23:30:00.000Z', new Date('2026-11-26T09:00:00.000Z'))).toBe("Fino all'1 dicembre");
  });
  it('i dati veri del 25 novembre', () => {
    const r = specialeInSala([{ id: YCSE.tmdbId, title: 'x', subevents: [{ id: 1, date: '2026-11-25T15:00:00.000Z' }, { id: 2, date: fine }] }], new Date('2026-11-25T09:00:00.000Z'), SPECIALI);
    expect(r?.periodo).toBe("Dal 25 novembre all'8 dicembre");
  });
});

describe('ogniGiorno', () => {
  it('scrive gli orari come una frase', () => {
    expect(ogniGiorno(['16:00', '21:00'])).toBe('ogni giorno alle 16:00 e alle 21:00');
    expect(ogniGiorno(['21:00'])).toBe('ogni giorno alle 21:00');
    expect(ogniGiorno([])).toBe('');
  });
});
