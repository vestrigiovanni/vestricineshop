/**
 * Il confine fra minuti d'orologio e istanti reali è il punto in cui l'ora
 * legale può entrare a rovinare tutto. Questi test lo presidiano.
 */

import { describe, it, expect } from 'vitest';
import {
  globalMinuteToMs,
  msToGlobalMinute,
  romeClock,
  romeDate,
  romeParts,
  romeToMs,
} from './rome';

describe('romeParts / romeToMs', () => {
  it('legge un istante come lo leggerebbe un orologio a Roma', () => {
    // 25 luglio 2026, 14:30 a Roma = 12:30 UTC (ora legale, +02:00)
    const ms = Date.UTC(2026, 6, 25, 12, 30);
    expect(romeParts(ms)).toEqual({ date: '2026-07-25', minute: 14 * 60 + 30 });
    expect(romeClock(ms)).toBe('14:30');
    expect(romeDate(ms)).toBe('2026-07-25');
  });

  it('d\'inverno usa +01:00, non il +02:00 scritto a mano altrove', () => {
    // 15 gennaio 2026, 14:30 a Roma = 13:30 UTC (ora solare)
    const ms = Date.UTC(2026, 0, 15, 13, 30);
    expect(romeParts(ms)).toEqual({ date: '2026-01-15', minute: 14 * 60 + 30 });
  });

  it('romeToMs è l\'inverso di romeParts, in entrambe le stagioni', () => {
    for (const date of ['2026-01-15', '2026-07-25', '2026-03-29', '2026-10-25']) {
      for (const minute of [10 * 60, 15 * 60 + 45, 21 * 60 + 30]) {
        const ms = romeToMs(date, minute);
        expect(romeParts(ms)).toEqual({ date, minute });
      }
    }
  });

  it('oltre le 24 ore scivola al giorno dopo: le 25:10 sono l\'01:10 dell\'indomani', () => {
    const ms = romeToMs('2026-07-25', 25 * 60 + 10);
    expect(romeParts(ms)).toEqual({ date: '2026-07-26', minute: 70 });
  });
});

describe('minuti globali', () => {
  const windowStart = '2026-07-25';

  it('il minuto 0 è la mezzanotte del primo giorno della finestra', () => {
    expect(msToGlobalMinute(romeToMs('2026-07-25', 0), windowStart)).toBe(0);
  });

  it('un\'ora del terzo giorno vale 2×1440 + minuti', () => {
    const ms = romeToMs('2026-07-27', 21 * 60);
    expect(msToGlobalMinute(ms, windowStart)).toBe(2 * 1440 + 21 * 60);
  });

  it('andata e ritorno non perdono nulla', () => {
    for (const minute of [600, 1290, 1440 + 630, 5 * 1440 + 21 * 60 + 15]) {
      expect(msToGlobalMinute(globalMinuteToMs(minute, windowStart), windowStart)).toBe(minute);
    }
  });

  it('sopravvive al giorno di 25 ore (fine ora legale)', () => {
    // Il 25 ottobre 2026 le 03:00 tornano alle 02:00: quel giorno dura 25 ore.
    // Le 21:00 del 26 restano le 21:00, e devono valere 1440 + 1260 minuti —
    // una sottrazione fra istanti darebbe 1500 + 1260 e sposterebbe tutto.
    const start = '2026-10-25';
    const ms = romeToMs('2026-10-26', 21 * 60);
    expect(msToGlobalMinute(ms, start)).toBe(1440 + 21 * 60);
    expect(romeClock(globalMinuteToMs(1440 + 21 * 60, start))).toBe('21:00');
  });

  it('sopravvive al giorno di 23 ore (inizio ora legale)', () => {
    // Il 29 marzo 2026 le 02:00 diventano le 03:00: quel giorno dura 23 ore.
    const start = '2026-03-29';
    const ms = romeToMs('2026-03-30', 10 * 60);
    expect(msToGlobalMinute(ms, start)).toBe(1440 + 10 * 60);
    expect(romeClock(globalMinuteToMs(1440 + 10 * 60, start))).toBe('10:00');
  });

  it('una serata che sconfina resta attaccata al suo giorno di programmazione', () => {
    // Spettacolo delle 23:30 che finisce all'01:20: il minuto globale della
    // fine appartiene al giorno dopo, ma l'orologio dice 01:20.
    const start = '2026-07-25';
    const inizio = 23 * 60 + 30;
    const fine = inizio + 110;
    expect(romeClock(globalMinuteToMs(fine, start))).toBe('01:20');
    expect(romeDate(globalMinuteToMs(fine, start))).toBe('2026-07-26');
  });
});
