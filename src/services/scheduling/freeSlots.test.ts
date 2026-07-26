import { describe, it, expect } from 'vitest';
import { findFreeSlots, SLOT_SPACING } from './freeSlots';
import { CLOSING_MINUTE, MINUTES_PER_DAY, MIN_GAP_MINUTES, OPENING_MINUTE, formatClock } from './times';

/** Intervallo del giorno 0 espresso in ore decimali. */
const at = (fromHour: number, toHour: number) => ({
  start: Math.round(fromHour * 60),
  end: Math.round(toHour * 60),
});

/** Uno spettacolo già in sala, con la pausa già inclusa nella fine. */
const busy = (fromHour: number, runtime: number) => ({
  start: Math.round(fromHour * 60),
  end: Math.round(fromHour * 60) + runtime + MIN_GAP_MINUTES,
});

const clocks = (slots: { startMinute: number }[]) => slots.map((s) => formatClock(s.startMinute));

describe('findFreeSlots', () => {
  it('in una giornata vuota propone orari sparsi da mattina a sera', () => {
    const slots = findFreeSlots({ runtime: 110, dayIndex: 0, occupied: [] });

    expect(slots.length).toBeGreaterThan(1);
    // Il primo non può precedere l'apertura, l'ultimo deve finire entro la chiusura.
    expect(slots[0].startMinute).toBeGreaterThanOrEqual(OPENING_MINUTE);
    expect(slots[slots.length - 1].endMinute).toBeLessThanOrEqual(CLOSING_MINUTE);
    // Distribuiti, non tutti ammassati in matinée.
    expect(new Set(slots.map((s) => s.band)).size).toBeGreaterThan(1);
  });

  it('propone solo orari eleganti, e preferisce i più tondi', () => {
    const slots = findFreeSlots({ runtime: 100, dayIndex: 0, occupied: [] });
    for (const s of slots) expect(s.startMinute % 5).toBe(0);
    // Con la giornata libera non c'è motivo di scendere sotto le :00 e le :30.
    // L'eccezione è l'ultimo spettacolo: lì comanda l'ora di chiusura, e il
    // tondo può semplicemente non esserci più.
    expect(slots.slice(0, -1).every((s) => s.rank === 0)).toBe(true);
    expect(slots[slots.length - 1].rank).toBeLessThanOrEqual(1);
  });

  it('rispetta la pausa minima prima e dopo ciò che è già in sala', () => {
    // Un film 15:00–16:50, quindi occupato fino alle 17:00 con la pausa.
    const occupied = [busy(15, 110)];
    // Senza raggruppamento né tetto: qui si controlla la regola, non la scelta.
    const slots = findFreeSlots({ runtime: 110, dayIndex: 0, occupied, limit: 1000, spacing: 5 });

    for (const s of slots) {
      // O finisce (più pausa) prima che l'altro cominci, o comincia dopo la sua pausa.
      const okBefore = s.endMinute + MIN_GAP_MINUTES <= occupied[0].start;
      const okAfter = s.startMinute >= occupied[0].end;
      expect(okBefore || okAfter).toBe(true);
    }
    // Le 15:00 sono ovviamente escluse, le 13:00 (finisce 14:50) ci stanno.
    expect(clocks(slots)).not.toContain('15:00');
    expect(clocks(slots)).toContain('13:00');
  });

  it('non propone niente se la giornata è piena', () => {
    const slots = findFreeSlots({
      runtime: 110,
      dayIndex: 0,
      occupied: [{ start: OPENING_MINUTE, end: CLOSING_MINUTE }],
    });
    expect(slots).toEqual([]);
  });

  it('non propone niente se il film è più lungo delle ore utili', () => {
    expect(findFreeSlots({ runtime: 1000, dayIndex: 0, occupied: [] })).toEqual([]);
  });

  it('un film lungo entra solo dove c\'è davvero spazio', () => {
    // Libero 10:00–14:00 (240′) e 20:00–01:00 (300′): un film di 250′ più la
    // pausa non sta nella mattina, sta solo nella seconda finestra.
    const occupied = [at(14, 20)];
    const slots = findFreeSlots({ runtime: 250, dayIndex: 0, occupied, limit: 1000, spacing: 5 });

    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) expect(s.startMinute).toBeGreaterThanOrEqual(20 * 60);
    // L'ultimo possibile: 250′ che finiscono entro l'01:00 partono alle 20:50.
    expect(clocks(slots)).toContain('20:50');
    expect(clocks(slots)).not.toContain('21:00');
  });

  it('non propone orari già passati', () => {
    // Sono le 17:20: prima non si programma.
    const notBefore = 17 * 60 + 20;
    const slots = findFreeSlots({ runtime: 110, dayIndex: 0, occupied: [], notBefore, limit: 40 });
    for (const s of slots) expect(s.startMinute).toBeGreaterThanOrEqual(notBefore);
    // Le 17:20 sarebbero valide, ma a portata di mano ci sono le 17:30.
    expect(clocks(slots)[0]).toBe('17:30');
  });

  it('la fascia richiesta è un vincolo, non una preferenza', () => {
    const slots = findFreeSlots({ runtime: 110, dayIndex: 0, occupied: [], band: 'evening', limit: 40, spacing: 5 });
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) expect(s.band).toBe('evening');
  });

  it('due orari troppo vicini sono la stessa occasione: ne resta uno', () => {
    const slots = findFreeSlots({ runtime: 110, dayIndex: 0, occupied: [], limit: 40 });
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].startMinute - slots[i - 1].startMinute).toBeGreaterThanOrEqual(SLOT_SPACING);
    }
  });

  it('lavora sul giorno giusto quando l\'indice non è zero', () => {
    const day = 4;
    const base = day * MINUTES_PER_DAY;
    const slots = findFreeSlots({ runtime: 110, dayIndex: day, occupied: [] });
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      expect(s.startMinute).toBeGreaterThanOrEqual(base + OPENING_MINUTE);
      expect(s.endMinute).toBeLessThanOrEqual(base + CLOSING_MINUTE);
    }
  });

  it('la coda dopo la mezzanotte appartiene ancora alla stessa serata', () => {
    // Occupato fino alle 22:00; un film di 130′ ci sta ancora, finendo alle 00:10.
    const slots = findFreeSlots({
      runtime: 130,
      dayIndex: 0,
      occupied: [{ start: OPENING_MINUTE, end: 22 * 60 }],
      limit: 40,
      spacing: 5,
    });
    expect(clocks(slots)).toContain('22:00');
    expect(slots[0].endMinute).toBeGreaterThan(MINUTES_PER_DAY);
  });

  it('una durata assurda non produce proposte', () => {
    expect(findFreeSlots({ runtime: 0, dayIndex: 0, occupied: [] })).toEqual([]);
    expect(findFreeSlots({ runtime: Number.NaN, dayIndex: 0, occupied: [] })).toEqual([]);
  });
});
