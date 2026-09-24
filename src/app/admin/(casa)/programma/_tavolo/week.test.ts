import { describe, it, expect } from 'vitest';
import { buildWeek, findBlock, type OccupancyLike } from './week';

const show = (pretixId: number | null, title: string, time: string, startMinute: number, runtime: number) => ({
  pretixId,
  title,
  time,
  endTime: '',
  runtime,
  startMinute,
  endMinute: startMinute + runtime,
  tmdbId: pretixId ? `t${pretixId}` : null,
  posterPath: null,
});

const occupancy: OccupancyLike = {
  totalShows: 3,
  daysDetail: [
    {
      date: '2026-09-28',
      isPast: false,
      isWeekend: false,
      shows: [show(1, 'Born to Be Wild', '10:00', 600, 97), show(2, 'Jeff Buckley', '12:00', 720, 106)],
      gaps: [
        { from: '14:00', to: '14:30', minutes: 30, startMinute: 840 },
        { from: '16:30', to: '19:30', minutes: 180, startMinute: 990 },
      ],
    },
    {
      date: '2026-09-29',
      isPast: false,
      isWeekend: false,
      shows: [show(null, 'Evento esterno', '21:00', 1440 + 1260, 120)],
      gaps: [],
    },
  ],
};

describe('buildWeek', () => {
  it('porta ogni spettacolo nei minuti del suo giorno', () => {
    const w = buildWeek(occupancy, {});
    expect(w.days[1].blocks[0].start).toBe(1260);
    expect(w.days[0].blocks.map((b) => b.key)).toEqual(['1', '2']);
  });

  it('attacca i posti dal database, e senza dati li lascia sconosciuti', () => {
    const w = buildWeek(occupancy, { 1: { available: 1, total: 2, soldOut: false } });
    expect(w.days[0].blocks[0].sold).toBe(1);
    expect(w.days[0].blocks[1].sold).toBeNull();
  });

  it('tiene solo i buchi dove ci sta un film', () => {
    const w = buildWeek(occupancy, {});
    expect(w.days[0].gaps).toEqual([{ start: 990, end: 1170, from: '16:30', to: '19:30', minutes: 180 }]);
    expect(w.filmGaps).toBe(1);
  });

  it('non lascia toccare ciò che non è nato qui', () => {
    const w = buildWeek(occupancy, {});
    expect(w.days[1].blocks[0].touchable).toBe(false);
    expect(w.days[1].blocks[0].key).toBe('2026-09-29-0');
  });

  it('trova un blocco dalla sua chiave', () => {
    const w = buildWeek(occupancy, {});
    expect(findBlock(w, '2')?.block.title).toBe('Jeff Buckley');
    expect(findBlock(w, '99')).toBeNull();
  });
});
