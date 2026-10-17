import { describe, expect, it } from 'vitest';
import { judgeTaste, normTitle, type TasteData } from './taste';

const data: TasteData = {
  ratings: [
    ['Call Me by Your Name', 2017, 5, 1],
    ['Bones and All', 2022, 5, 0],
    ['Knives Out', 2019, 1.5, 0],
    ['Elephant', 2003, 5, 0],
    ['Anora', 2024, null, 1],
  ],
  watchlist: [['Fjord', 2026]],
  lists: {
    sala: [['Aftersun', 2022]],
    canone: [['The Graduate', 1967]],
  },
};

const f = (tmdbId: string, title: string, year: number | null, extra: Record<string, string> = {}) => ({
  tmdbId, title, year, ...extra,
});

describe('judgeTaste', () => {
  it('riconosce il film col titolo originale e premia le cinque stelle', () => {
    const v = judgeTaste(data, [f('1', 'Chiamami col tuo nome', 2017, { originalTitle: 'Call Me by Your Name' })]);
    expect(v.get('1')!.score).toBeGreaterThan(1.5);
    expect(v.get('1')!.note).toBe('Cinque stelle per te');
  });

  it('perdona un anno di scarto fra festival e sala', () => {
    const v = judgeTaste(data, [f('1', 'Bones and All', 2023)]);
    expect(v.get('1')!.score).toBeGreaterThan(1.5);
  });

  it('un voto basso spinge il film indietro', () => {
    const v = judgeTaste(data, [f('1', 'Cena con delitto', 2019, { originalTitle: 'Knives Out' })]);
    expect(v.get('1')!.score).toBeLessThan(-1);
  });

  it('il cuore senza stelle vale come un quattro', () => {
    const v = judgeTaste(data, [f('1', 'Anora', 2024)]);
    expect(v.get('1')!.score).toBeGreaterThan(0.8);
  });

  it('il film mai visto di un regista amato prende il voto del regista', () => {
    const v = judgeTaste(data, [
      f('1', 'Elephant', 2003, { director: 'Gus Van Sant' }),
      f('2', 'Paranoid Park', 2007, { director: 'Gus Van Sant' }),
    ]);
    expect(v.get('2')!.score).toBeGreaterThan(0.5);
    expect(v.get('2')!.note).toBe('Di Gus Van Sant, che ami');
  });

  it('i registi di riferimento valgono anche senza un film votato', () => {
    const v = judgeTaste(data, [f('1', 'Climax', 2018, { director: 'Gaspar Noé' })]);
    expect(v.get('1')!.score).toBeGreaterThan(0.5);
  });

  it('watchlist, lista VestriCinema e canone contano', () => {
    const v = judgeTaste(data, [f('1', 'Fjord', 2026), f('2', 'Aftersun', 2022), f('3', 'Il laureato', 1967, { originalTitle: 'The Graduate' })]);
    expect(v.get('1')!.note).toBe('Nella tua watchlist');
    expect(v.get('2')!.score).toBeGreaterThan(0);
    expect(v.get('3')!.canon).toBe(true);
  });

  it('un film sconosciuto resta neutro', () => {
    const v = judgeTaste(data, [f('1', 'Un film qualunque', 2015)]);
    expect(v.get('1')).toEqual({ score: 0, note: null, canon: false });
  });

  it('normalizza accenti e punteggiatura', () => {
    expect(normTitle('Amélie: Le Fabuleux Destin!')).toBe('amelie le fabuleux destin');
  });
});
