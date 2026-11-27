import { describe, it, expect } from 'vitest';
import {
  ELEGANT_TIERS,
  addDaysISO,
  bandOf,
  ceilToElegant,
  daysBetweenISO,
  elegantMinutesByPreference,
  elegantMinutesBetween,
  elegantRank,
  floorToElegant,
  formatClock,
  isElegant,
  isWeekend,
  isoWeekday,
  minuteOfDay,
  nearestElegant,
} from './times';

const at = (h: number, m: number) => h * 60 + m;

describe('classifica di eleganza', () => {
  it('mette :00 e :30 davanti a tutto', () => {
    expect(elegantRank(at(21, 0))).toBe(0);
    expect(elegantRank(at(21, 30))).toBe(0);
    expect(elegantRank(at(21, 15))).toBe(1);
    expect(elegantRank(at(21, 45))).toBe(1);
    expect(elegantRank(at(21, 20))).toBe(2);
    expect(elegantRank(at(21, 35))).toBe(3);
  });

  it('ammette tutti i multipli di cinque e nient\'altro', () => {
    for (let m = 0; m < 60; m++) {
      expect(isElegant(at(14, m)), `minuto ${m}`).toBe(m % 5 === 0);
    }
  });

  it('copre ogni multiplo di cinque esattamente una volta', () => {
    const all = ELEGANT_TIERS.flat();
    expect(new Set(all).size).toBe(12);
    expect([...all].sort((a, b) => a - b)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
  });

  it('preferisce un :30 poco più avanti a un :35 immediato', () => {
    // Il primo candidato a partire dalle 21:32 non è 21:35 ma 22:00.
    const best = elegantMinutesByPreference(at(21, 32), at(22, 30))[0];
    expect(formatClock(best)).toBe('22:00');
  });

  it('con tolleranza bassa privilegia invece la vicinanza', () => {
    const best = elegantMinutesByPreference(at(21, 32), at(22, 30), 2)[0];
    expect(formatClock(best)).toBe('21:35');
  });

  it('restituisce tutti i candidati dell\'intervallo, senza perderne', () => {
    const ordered = elegantMinutesByPreference(at(14, 0), at(15, 0));
    expect(new Set(ordered).size).toBe(ordered.length);
    expect(ordered).toHaveLength(elegantMinutesBetween(at(14, 0), at(15, 0)).length);
  });
});

describe('arrotondamento', () => {
  it('sale al minuto ammesso successivo', () => {
    expect(ceilToElegant(at(14, 0))).toBe(at(14, 0));
    expect(ceilToElegant(at(14, 1))).toBe(at(14, 5));
    expect(ceilToElegant(at(14, 56))).toBe(at(15, 0));
  });

  it('scende al minuto ammesso precedente', () => {
    expect(floorToElegant(at(14, 9))).toBe(at(14, 5));
    expect(floorToElegant(at(14, 59))).toBe(at(14, 55));
  });

  it('trova il più vicino, preferendo il successivo a parità', () => {
    expect(nearestElegant(at(14, 12))).toBe(at(14, 10));
    expect(nearestElegant(at(14, 13))).toBe(at(14, 15));
  });

  it('enumera l\'intervallo estremi inclusi', () => {
    expect(elegantMinutesBetween(at(14, 0), at(14, 20))).toEqual([
      at(14, 0), at(14, 5), at(14, 10), at(14, 15), at(14, 20),
    ]);
  });
});

describe('orologio', () => {
  it('formatta gli orari dopo la mezzanotte senza andare a 24 e oltre', () => {
    expect(formatClock(at(21, 30))).toBe('21:30');
    expect(formatClock(at(24, 30))).toBe('00:30');
    expect(formatClock(at(25, 0))).toBe('01:00');
  });

  it('riporta il minuto dentro il proprio giorno', () => {
    expect(minuteOfDay(at(25, 0))).toBe(at(1, 0));
    expect(minuteOfDay(at(21, 0))).toBe(at(21, 0));
  });

  it('assegna le fasce con le soglie del cinema', () => {
    expect(bandOf(at(11, 0))).toBe('matinee');
    expect(bandOf(at(13, 0))).toBe('afternoon');
    expect(bandOf(at(18, 30))).toBe('evening');
    expect(bandOf(at(21, 50))).toBe('night');
    expect(bandOf(at(24, 30))).toBe('matinee'); // 00:30 letto come orario del giorno
  });
});

describe('date di calendario', () => {
  it('somma giorni attraverso i confini di mese e anno', () => {
    expect(addDaysISO('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('non scivola nel giorno del cambio di ora legale', () => {
    // 25 ottobre 2026: in Italia si torna all'ora solare. Con l'aritmetica su
    // istanti locali questo giorno dura 25 ore e le date slittano.
    expect(addDaysISO('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDaysISO('2026-10-25', 1)).toBe('2026-10-26');
    expect(daysBetweenISO('2026-10-24', '2026-10-27')).toBe(3);
    // E in primavera, quando il giorno dura 23 ore.
    expect(addDaysISO('2026-03-29', 1)).toBe('2026-03-30');
    expect(daysBetweenISO('2026-03-28', '2026-03-31')).toBe(3);
  });

  it('conta i giorni fra due date', () => {
    expect(daysBetweenISO('2026-08-01', '2026-08-08')).toBe(7);
    expect(daysBetweenISO('2026-08-08', '2026-08-01')).toBe(-7);
    expect(daysBetweenISO('2026-08-01', '2026-08-01')).toBe(0);
  });

  it('riconosce i giorni della settimana e il weekend del cinema', () => {
    expect(isoWeekday('2026-07-27')).toBe(1); // lunedì
    expect(isoWeekday('2026-08-02')).toBe(7); // domenica
    expect(isWeekend('2026-07-30')).toBe(false); // giovedì
    expect(isWeekend('2026-07-31')).toBe(true);  // venerdì
    expect(isWeekend('2026-08-02')).toBe(true);  // domenica
  });
});
