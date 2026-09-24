import { describe, it, expect } from 'vitest';
import { axisFor, minuteAt, place, ticks } from './geometry';

const DEFAULT = { start: 600, end: 1500 };

describe('axisFor', () => {
  it('senza spettacoli fuori orario, va dall’apertura (10:00) alla chiusura (01:00)', () => {
    expect(axisFor([{ start: 600, end: 700 }])).toEqual(DEFAULT);
  });

  it('si allarga all’ora intera per chi sfora', () => {
    expect(axisFor([{ start: 570, end: 700 }, { start: 1400, end: 1506 }])).toEqual({ start: 540, end: 1560 });
  });
});

describe('place', () => {
  it('trasforma minuti in percentuali', () => {
    expect(place(600, 690, DEFAULT)).toEqual({ left: 0, width: 10 });
    expect(place(1050, 1140, DEFAULT)).toEqual({ left: 50, width: 10 });
  });

  it('taglia ciò che esce dall’asse', () => {
    expect(place(1440, 1560, DEFAULT)).toEqual({ left: 93.33333333333333, width: 6.666666666666667 });
  });
});

describe('minuteAt', () => {
  it('aggancia il quarto d’ora', () => {
    expect(minuteAt(0, DEFAULT)).toBe(600);
    expect(minuteAt(0.5, DEFAULT)).toBe(1050);
    expect(minuteAt(0.505, DEFAULT)).toBe(1050);
    expect(minuteAt(0.52, DEFAULT)).toBe(1065);
  });

  it('non esce dall’asse', () => {
    expect(minuteAt(-1, DEFAULT)).toBe(600);
    expect(minuteAt(2, DEFAULT)).toBe(1485);
  });
});

describe('ticks', () => {
  it('segna un’ora sì e una no, e dopo mezzanotte riparte da 00', () => {
    expect(ticks(DEFAULT).map((t) => t.label)).toEqual(['10', '12', '14', '16', '18', '20', '22', '00']);
    expect(ticks(DEFAULT)[0].left).toBe(0);
  });
});
