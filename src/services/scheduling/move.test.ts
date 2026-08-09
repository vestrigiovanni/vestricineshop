import { describe, it, expect } from 'vitest';
import { planMove } from './move';
import { MINUTES_PER_DAY, MIN_GAP_MINUTES } from './times';

/** Uno spettacolo in sala, con la pausa già inclusa nella fine. */
const inRoom = (pretixId: number, dayIndex: number, clockHour: number, runtime: number) => ({
  pretixId,
  start: dayIndex * MINUTES_PER_DAY + Math.round(clockHour * 60),
  end: dayIndex * MINUTES_PER_DAY + Math.round(clockHour * 60) + runtime + MIN_GAP_MINUTES,
});

const isMoving = (id: number) => (o: { pretixId: number }) => o.pretixId === id;

describe('planMove', () => {
  it('spostare di dieci minuti non è un conflitto con sé stessi', () => {
    const me = inRoom(1, 2, 21, 110);
    const res = planMove({
      runtime: 110, dayIndex: 2, clock: 21 * 60 + 10,
      occupied: [me], isMoving: isMoving(1),
    });

    expect(res.ok).toBe(true);
    expect(res.clashes).toEqual([]);
  });

  it('un altro spettacolo nello stesso posto torna indietro identificato', () => {
    const me = inRoom(1, 2, 15, 110);
    const other = inRoom(2, 2, 21, 130);
    const res = planMove({
      runtime: 110, dayIndex: 2, clock: 21 * 60,
      occupied: [me, other], isMoving: isMoving(1),
    });

    expect(res.ok).toBe(false);
    expect(res.problem).toBe('occupied');
    expect(res.clashes.map((c) => c.pretixId)).toEqual([2]);
  });

  it('le 00:30 scritte nella colonna di sabato sono la nottata di sabato', () => {
    const res = planMove({
      runtime: 30, dayIndex: 5, clock: 30,
      occupied: [], isMoving: isMoving(1),
    });

    // Il minuto cade nella data di calendario successiva…
    expect(res.startMinute).toBe(6 * MINUTES_PER_DAY + 30);
    // …ma la serata a cui appartiene resta quella di sabato.
    expect(res.dayIndex).toBe(5);
    expect(res.ok).toBe(true);
  });

  it('nella nottata la chiusura conta lo stesso: alle 00:30 un film intero non ci sta', () => {
    const res = planMove({
      runtime: 100, dayIndex: 5, clock: 30,
      occupied: [], isMoving: isMoving(1),
    });

    // Partendo alle 00:30 finirebbe alle 02:10, oltre la chiusura dell'01:00.
    expect(res.dayIndex).toBe(5);
    expect(res.problem).toBe('afterClosing');
  });

  it('le 03:00 non sono la nottata: sono la mattina, e il cinema apre alle 10', () => {
    const res = planMove({
      runtime: 100, dayIndex: 5, clock: 3 * 60,
      occupied: [], isMoving: isMoving(1),
    });

    expect(res.ok).toBe(false);
    expect(res.problem).toBe('beforeOpening');
  });

  it('un orario già passato è passato, e viene prima di ogni altra obiezione', () => {
    const res = planMove({
      runtime: 100, dayIndex: 0, clock: 21 * 60,
      occupied: [inRoom(2, 0, 21, 100)], isMoving: isMoving(1),
      notBefore: 3 * MINUTES_PER_DAY,
    });

    expect(res.problem).toBe('past');
  });
});
