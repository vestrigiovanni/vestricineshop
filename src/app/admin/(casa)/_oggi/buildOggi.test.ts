import { describe, it, expect } from 'vitest';
import { romeToMs } from '@/services/scheduling/rome';
import { addDaysISO } from '@/services/scheduling/times';
import { buildOggi, type OggiRow } from './buildOggi';

/** Lunedì 28 settembre 2026. */
const DAY = '2026-09-28';
const at = (date: string, hh: number, mm = 0) => romeToMs(date, hh * 60 + mm);

let nextId = 1;
function row(date: string, hh: number, mm: number, title: string, minutes: number, extra: Partial<OggiRow> = {}): OggiRow {
  const start = at(date, hh, mm);
  return {
    id: nextId++,
    title,
    start,
    end: start + minutes * 60_000,
    roomName: 'CA GRANDA',
    available: 2,
    total: 2,
    soldOut: false,
    lingua: 'Inglese',
    sottotitoli: 'Italiano',
    director: null,
    hasTrailer: true,
    ...extra,
  };
}

const giornata = () => [
  row(DAY, 8, 0, "It's Never Over, Jeff Buckley", 106),
  row(DAY, 10, 30, 'Il sale della terra', 110, { lingua: 'Francese', director: 'Wim Wenders' }),
  row(DAY, 13, 0, 'Mystery train', 110),
  row(DAY, 15, 30, 'I predatori', 109, { lingua: 'Italiano' }),
  row('2026-09-29', 10, 30, 'The Look of Silence', 103),
];

describe('buildOggi — la giornata', () => {
  it('mette in sala il film che sta andando, con quanto manca', () => {
    const d = buildOggi(giornata(), at(DAY, 10, 45), false);
    expect(d.current?.title).toBe('Il sale della terra');
    expect(d.current?.start).toBe('10:30');
    expect(d.current?.end).toBe('12:20');
    expect(d.current?.progress).toBeCloseTo(15 / 110, 3);
    expect(d.current?.director).toBe('Wim Wenders');
  });

  it('dà a ogni spettacolo di oggi il suo stato, e lascia fuori domani', () => {
    const d = buildOggi(giornata(), at(DAY, 10, 45), false);
    expect(d.day.map((s) => [s.start, s.state])).toEqual([
      ['08:00', 'finito'],
      ['10:30', 'in-sala'],
      ['13:00', 'dopo'],
      ['15:30', 'dopo'],
    ]);
  });

  it('fra uno spettacolo e l’altro non c’è niente in sala, ma c’è il prossimo', () => {
    const d = buildOggi(giornata(), at(DAY, 12, 40), false);
    expect(d.current).toBeNull();
    expect(d.next?.title).toBe('Mystery train');
    expect(d.next?.when).toBe('oggi');
  });

  it('a giornata finita il prossimo è domani', () => {
    const d = buildOggi(giornata(), at(DAY, 23, 0), false);
    expect(d.next?.title).toBe('The Look of Silence');
    expect(d.next?.when).toBe('domani');
  });

  it('dopo mezzanotte, la coda di ieri è ancora in sala', () => {
    const rows = [row('2026-09-27', 23, 30, 'Arancia meccanica', 136)];
    const d = buildOggi(rows, at(DAY, 0, 30), false);
    expect(d.current?.title).toBe('Arancia meccanica');
    expect(d.day).toEqual([]);
  });

  it('scrive la data in italiano, con la maiuscola, e le sale di oggi', () => {
    const d = buildOggi(giornata(), at(DAY, 10, 45), false);
    expect(d.dateLabel).toBe('Lunedì 28 settembre');
    expect(d.rooms).toEqual(['CA GRANDA']);
  });
});

describe('buildOggi — i numeri', () => {
  it('conta gli spettacoli di oggi e della settimana', () => {
    const d = buildOggi(giornata(), at(DAY, 10, 45), false);
    expect(d.stats.showsToday).toBe(4);
    expect(d.stats.showsWeek).toBe(5);
  });

  it('somma i venduti che si conoscono', () => {
    const rows = [row(DAY, 13, 0, 'A', 100, { available: 1, total: 2 }), row(DAY, 16, 0, 'B', 100, { available: 0, total: 2 })];
    expect(buildOggi(rows, at(DAY, 9, 0), false).stats.soldToday).toBe(3);
  });

  it('se nessun posto è stato letto, i venduti sono sconosciuti, non zero', () => {
    const rows = [row(DAY, 13, 0, 'A', 100, { available: null, total: null })];
    expect(buildOggi(rows, at(DAY, 9, 0), false).stats.soldToday).toBeNull();
  });
});

describe('buildOggi — da guardare', () => {
  const ids = (d: ReturnType<typeof buildOggi>) => d.alerts.map((a) => a.id);

  it('una settimana in ordine non ha avvisi', () => {
    const rows = [0, 1, 2, 3, 4, 5, 6].map((i) => row(addDaysISO(DAY, i), 18, 0, 'Film', 100, { available: 1, total: 2 }));
    expect(buildOggi(rows, at(DAY, 9, 0), false).alerts).toEqual([]);
  });

  it('segnala i posti non letti da Pretix, con l’azione per rileggerli', () => {
    const rows = [row('2026-09-29', 17, 0, 'Arancia meccanica', 136, { available: null, total: null })];
    const a = buildOggi(rows, at(DAY, 9, 0), false).alerts.find((x) => x.id === 'posti');
    expect(a?.tone).toBe('alarm');
    expect(a?.text).toBe('1 spettacolo senza posti letti da Pretix, il primo domani alle 17:00.');
    expect(a?.action?.kind).toBe('sync-posti');
  });

  it('segnala gli spettacoli delle prossime 24 ore senza biglietti', () => {
    const rows = [row(DAY, 13, 0, 'Mystery train', 110, { available: 2, total: 2 })];
    const a = buildOggi(rows, at(DAY, 9, 0), false).alerts.find((x) => x.id === 'vuoti');
    expect(a?.text).toBe('1 spettacolo nelle prossime 24 ore senza biglietti venduti, il primo è «Mystery train» oggi alle 13:00.');
  });

  it('segnala i film senza lingua e senza trailer salvato, una volta per film', () => {
    const rows = [
      row(DAY, 13, 0, 'Duel', 90, { lingua: null, hasTrailer: false, available: 1 }),
      row('2026-09-29', 13, 0, 'Duel', 90, { lingua: null, hasTrailer: false, available: 1 }),
    ];
    const d = buildOggi(rows, at(DAY, 9, 0), false);
    expect(d.alerts.find((x) => x.id === 'lingua')?.text).toBe('Un film senza lingua: «Duel».');
    expect(d.alerts.find((x) => x.id === 'trailer')?.text).toBe('Un film senza trailer salvato: «Duel».');
  });

  it('segnala i giorni scoperti nei prossimi sei', () => {
    const rows = [row(DAY, 18, 0, 'Film', 100, { available: 1 })];
    const a = buildOggi(rows, at(DAY, 9, 0), false).alerts.find((x) => x.id === 'giorni');
    expect(a?.text).toBe('Nessuno spettacolo domani, mercoledì 30, giovedì 1, venerdì 2, sabato 3 e domenica 4.');
    expect(a?.action?.href).toBe('/admin/programma');
  });

  it('mette per prima la conferma rimasta a metà', () => {
    const rows = [row('2026-09-29', 17, 0, 'X', 100, { available: null, total: null })];
    const d = buildOggi(rows, at(DAY, 9, 0), true);
    expect(ids(d)[0]).toBe('conferma');
    expect(d.alerts[0].tone).toBe('alarm');
  });
});
