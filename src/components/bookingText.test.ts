import { describe, expect, it } from 'vitest';
import { ageNotice, seatsTakenNotice, shortSeat } from './bookingText';

describe('ageNotice', () => {
  it('18+ è un divieto, in rosso', () => {
    expect(ageNotice('VM18')).toEqual({ alarm: true, text: "L'accesso a questa proiezione è limitato ai maggiori di 18 anni." });
  });
  it('14+ è un limite, non un allarme', () => {
    expect(ageNotice('14')).toEqual({ alarm: false, text: "L'accesso a questa proiezione è limitato ai maggiori di 14 anni." });
  });
  it('6+ e 10+ sono consigli', () => {
    expect(ageNotice('6+')).toEqual({ alarm: false, text: 'La visione di questo film è consigliata dai 6 anni in su.' });
    expect(ageNotice('10')).toEqual({ alarm: false, text: 'La visione di questo film è consigliata dai 10 anni in su.' });
  });
  it('per tutti: niente avviso', () => {
    expect(ageNotice('T')).toBeNull();
    expect(ageNotice(undefined)).toBeNull();
  });
});

describe('shortSeat', () => {
  it('"Fila B - Posto 5" diventa B5', () => {
    expect(shortSeat('Fila B - Posto 5')).toBe('B5');
    expect(shortSeat('Fila 12 - Posto 3')).toBe('12·3');
  });
  it('un nome libero resta com\'è', () => {
    expect(shortSeat('Poltrona 7')).toBe('Poltrona 7');
  });
});

describe('seatsTakenNotice', () => {
  it('un posto solo', () => {
    expect(seatsTakenNotice(['Fila B - Posto 5'])).toBe('Il posto Fila B - Posto 5 è stato appena prenotato da qualcun altro. Scegline un altro.');
  });
  it('più posti', () => {
    expect(seatsTakenNotice(['Fila B - Posto 5', 'Fila B - Posto 6'])).toBe('Questi posti sono stati appena prenotati da altri: Fila B - Posto 5, Fila B - Posto 6. Scegline altri.');
  });
});
