import { describe, expect, it } from 'vitest';
import { SPECIALI, periodo, specialeInSala } from './proiezioneSpeciale';

const film = (id: number, date: string[], esauriti: string[] = []) => ({
  id,
  title: `Film ${id}`,
  subevents: date.map((d, i) => ({ id: id * 100 + i, date: d, isSoldOut: esauriti.includes(d) })),
});

describe('specialeInSala', () => {
  const ycse = SPECIALI[0].tmdbId;
  // 16:00 e 21:00 a Roma, in UTC (novembre: +1).
  const date = ['2026-11-25T15:00:00.000Z', '2026-11-25T20:00:00.000Z', '2026-12-08T20:00:00.000Z'];

  it('si accende finché il film ha spettacoli futuri, con gli orari in ora di Roma', () => {
    const r = specialeInSala([film(1, ['2026-11-25T18:00:00.000Z']), film(ycse, date)], new Date('2026-11-25T09:00:00.000Z'));
    expect(r?.movie.id).toBe(ycse);
    expect(r?.show.date).toBe(date[0]);
    expect(r?.orari).toEqual(['16:00', '21:00']);
  });

  it("salta gli esauriti per Prenota, ma tiene l'atto", () => {
    const r = specialeInSala([film(ycse, date, [date[0]])], new Date('2026-11-25T09:00:00.000Z'));
    expect(r?.show.date).toBe(date[1]);
  });

  it("dopo l'ultimo spettacolo la home torna com'era", () => {
    expect(specialeInSala([film(ycse, date)], new Date('2026-12-08T21:00:00.000Z'))).toBeNull();
  });

  it('senza il film in programma non c\'è niente', () => {
    expect(specialeInSala([film(1, date)], new Date('2026-11-25T09:00:00.000Z'))).toBeNull();
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
  it('i dati veri del 25 novembre', () => {
    const r = specialeInSala([{ id: SPECIALI[0].tmdbId, title: 'x', subevents: [{ id: 1, date: '2026-11-25T15:00:00.000Z' }, { id: 2, date: fine }] }], new Date('2026-11-25T09:00:00.000Z'));
    expect(r?.periodo).toBe("Dal 25 novembre all'8 dicembre");
  });
});
