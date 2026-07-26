import { describe, it, expect } from 'vitest';
import { buildSchedule, snapShowTo, type ScheduledShow, type SchedulingFilm } from './engine';
import {
  MIN_GAP_MINUTES,
  elegantRank,
  CLOSING_MINUTE,
  MINUTES_PER_DAY,
  OPENING_MINUTE,
  isElegant,
  minuteOfDay,
  toGlobal,
} from './times';

// 2026-07-27 è un lunedì: la finestra parte in settimana e prende il weekend.
const START = '2026-07-27';

const film = (over: Partial<SchedulingFilm> & { tmdbId: string }): SchedulingFilm => ({
  title: `Film ${over.tmdbId}`,
  runtime: 100,
  ...over,
});

const at = (h: number, m: number) => h * 60 + m;
const onDay = (day: number, h: number, m: number) => toGlobal(day, at(h, m));

/** Il giorno di programmazione a cui appartiene uno spettacolo, in minuti. */
function programmingDayStart(show: ScheduledShow): number {
  const calendarDay = Math.floor(show.startMinute / MINUTES_PER_DAY);
  const dayIndex = minuteOfDay(show.startMinute) < OPENING_MINUTE ? calendarDay - 1 : calendarDay;
  return dayIndex * MINUTES_PER_DAY;
}

describe('buildSchedule — invarianti che non devono mai rompersi', () => {
  const result = buildSchedule({
    window: { startDate: START, days: 7 },
    films: [
      film({ tmdbId: '1', title: 'Perfect Days', runtime: 124 }),
      film({ tmdbId: '2', title: 'La Chimera', runtime: 130 }),
      film({ tmdbId: '3', title: 'Anatomia di una caduta', runtime: 151 }),
      film({ tmdbId: '4', title: 'Il ragazzo e l\'airone', runtime: 124 }),
      film({ tmdbId: '5', title: 'Past Lives', runtime: 105 }),
    ],
    intensity: 'normal',
    seed: 7,
  });

  it('produce un piano non vuoto', () => {
    expect(result.shows.length).toBeGreaterThan(0);
  });

  it('ogni spettacolo inizia a un orario elegante', () => {
    for (const s of result.shows) {
      expect(isElegant(s.startMinute), `${s.title} alle ${s.time}`).toBe(true);
    }
  });

  it('fra un film e il successivo ci sono almeno 10 minuti', () => {
    const sorted = [...result.shows].sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].startMinute - sorted[i - 1].endMinute;
      expect(
        gap,
        `${sorted[i - 1].title} finisce alle ${sorted[i - 1].endTime}, ${sorted[i].title} parte alle ${sorted[i].time}`
      ).toBeGreaterThanOrEqual(MIN_GAP_MINUTES);
    }
  });

  it('nessuno spettacolo inizia prima delle 10:00', () => {
    for (const s of result.shows) {
      expect(s.startMinute - programmingDayStart(s), `${s.title} alle ${s.time}`)
        .toBeGreaterThanOrEqual(OPENING_MINUTE);
    }
  });

  it('nessun film finisce dopo l\'01:00', () => {
    // Le pulizie non contano sulla chiusura: dopo l'ultimo spettacolo si chiude.
    // Nella programmazione reale si arriva a finire alle 00:58.
    for (const s of result.shows) {
      const end = s.endMinute - programmingDayStart(s);
      expect(end, `${s.title} finisce alle ${s.endTime}`).toBeLessThanOrEqual(CLOSING_MINUTE);
    }
  });

  it('riempie la giornata come la riempiresti a mano', () => {
    const perDay = new Map<string, number>();
    for (const s of result.shows) perDay.set(s.day, (perDay.get(s.day) ?? 0) + 1);
    // Le settimane reali stanno fra 5 e 8 spettacoli al giorno.
    for (const [day, n] of perDay) {
      expect(n, `il ${day}`).toBeGreaterThanOrEqual(5);
      expect(n, `il ${day}`).toBeLessThanOrEqual(8);
    }
  });

  it('la grande maggioranza degli inizi cade su :00 o :30', () => {
    // Nella programmazione reale gli orari tondi dominano nettamente; gli altri
    // compaiono solo quando la catena della giornata non lascia scelta.
    const round = result.shows.filter((s) => elegantRank(s.startMinute) === 0).length;
    expect(round / result.shows.length).toBeGreaterThan(0.6);
  });

  it('la data di calendario coincide col giorno di programmazione, salvo dopo la mezzanotte', () => {
    for (const s of result.shows) {
      const afterMidnight = minuteOfDay(s.startMinute) < OPENING_MINUTE;
      if (afterMidnight) expect(s.date).not.toBe(s.day);
      else expect(s.date).toBe(s.day);
    }
  });
});

describe('buildSchedule — somiglianza alla programmazione reale', () => {
  // Misure prese dalle settimane 2026-W18 e 2026-W24 del Vestri (solo i giorni
  // a sala singola). Servono da guardrail: se un domani il motore si allontana
  // da questo profilo, il piano smette di somigliare a come programmi davvero.
  const week = buildSchedule({
    window: { startDate: START, days: 7 },
    films: [
      film({ tmdbId: '1', title: 'Marty Supreme', runtime: 150 }),
      film({ tmdbId: '2', title: "L'agente segreto", runtime: 161 }),
      film({ tmdbId: '3', title: 'Nouvelle Vague', runtime: 106 }),
      film({ tmdbId: '4', title: 'La voce di Hind Rajab', runtime: 89 }),
      film({ tmdbId: '5', title: 'Ennio', runtime: 150 }),
      film({ tmdbId: '6', title: 'Urchin', runtime: 99 }),
      film({ tmdbId: '7', title: 'Children of the stars', runtime: 19 }),
      film({ tmdbId: '8', title: 'Il maestro', runtime: 125 }),
    ],
    intensity: 'normal',
    seed: 2026,
  });

  const sorted = [...week.shows].sort((a, b) => a.startMinute - b.startMinute);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].day === sorted[i - 1].day) gaps.push(sorted[i].startMinute - sorted[i - 1].endMinute);
  }
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];

  it('tiene le pause nell\'ordine di grandezza reale', () => {
    // Reale: minimo 10′, mediana intorno ai 25′.
    expect(median).toBeGreaterThanOrEqual(15);
    expect(median).toBeLessThanOrEqual(40);
  });

  it('apre verso le 10:00 e riempie fino a sera', () => {
    const perDay = new Map<string, typeof sorted>();
    for (const s of sorted) perDay.set(s.day, [...(perDay.get(s.day) ?? []), s]);
    for (const [day, shows] of perDay) {
      expect(shows[0].time.slice(0, 2), `apertura del ${day}`).toBe('10');
      const lastEnd = shows[shows.length - 1].endMinute;
      const dayStart = programmingDayStart(shows[shows.length - 1]);
      // L'ultimo film finisce a notte fonda, non alle otto di sera.
      expect(lastEnd - dayStart, `chiusura del ${day}`).toBeGreaterThan(22 * 60);
    }
  });

  it('dà a ogni giornata la sua prima serata', () => {
    const days = new Set(sorted.map((s) => s.day));
    for (const d of days) {
      expect(sorted.some((s) => s.day === d && s.band === 'evening'), `il ${d}`).toBe(true);
    }
  });
});

describe('buildSchedule — proiezioni già esistenti', () => {
  it('non si sovrappone mai a ciò che è già in sala', () => {
    // Il martedì (giorno 1) la sala è occupata dalle 15:00 alle 23:00.
    const occupied = [{ start: onDay(1, 15, 0), end: onDay(1, 23, 0) }];
    const result = buildSchedule({
      window: { startDate: START, days: 3 },
      films: [film({ tmdbId: '1', runtime: 120 }), film({ tmdbId: '2', runtime: 95 })],
      occupied,
      seed: 3,
    });

    for (const s of result.shows) {
      const block = { start: s.startMinute, end: s.endMinute + MIN_GAP_MINUTES };
      for (const o of occupied) {
        expect(
          block.start < o.end && o.start < block.end,
          `${s.title} il ${s.day} alle ${s.time} finisce dentro un'occupazione`
        ).toBe(false);
      }
    }
  });

  it('rispetta la pausa anche verso una proiezione esistente', () => {
    // Occupazione che finisce alle 17:45 (pausa inclusa): il film successivo
    // non può iniziare prima, e l'intervallo esistente la comprende già.
    const occupied = [{ start: onDay(0, 15, 30), end: onDay(0, 17, 45) }];
    const result = buildSchedule({
      window: { startDate: START, days: 1 },
      films: [film({ tmdbId: '1', runtime: 100 })],
      occupied,
      seed: 11,
    });

    for (const s of result.shows) {
      if (s.startMinute > occupied[0].start) {
        expect(s.startMinute).toBeGreaterThanOrEqual(occupied[0].end);
      }
    }
  });

  it('non programma nulla se la sala è piena tutto il giorno', () => {
    const result = buildSchedule({
      window: { startDate: START, days: 1 },
      films: [film({ tmdbId: '1', runtime: 120 })],
      occupied: [{ start: onDay(0, 10, 0), end: onDay(1, 1, 0) }],
      seed: 5,
    });
    expect(result.shows).toHaveLength(0);
    expect(result.warnings.join(' ')).toContain('non è entrato nel piano');
  });
});

describe('buildSchedule — determinismo', () => {
  const input = {
    window: { startDate: START, days: 5 },
    films: [
      film({ tmdbId: '1', runtime: 120 }),
      film({ tmdbId: '2', runtime: 95 }),
      film({ tmdbId: '3', runtime: 140 }),
    ],
    intensity: 'normal' as const,
  };

  it('lo stesso seed produce lo stesso piano', () => {
    const a = buildSchedule({ ...input, seed: 42 });
    const b = buildSchedule({ ...input, seed: 42 });
    expect(b.shows).toEqual(a.shows);
  });

  it('un seed diverso produce un piano diverso', () => {
    const a = buildSchedule({ ...input, seed: 1 });
    const b = buildSchedule({ ...input, seed: 999 });
    const key = (r: typeof a) => r.shows.map((s) => `${s.day} ${s.time} ${s.tmdbId}`).join('|');
    expect(key(b)).not.toBe(key(a));
  });
});

describe('buildSchedule — repliche', () => {
  it('rispetta il numero di repliche richiesto', () => {
    const result = buildSchedule({
      window: { startDate: START, days: 7 },
      films: [
        film({ tmdbId: '1', runtime: 100, replicas: 4 }),
        film({ tmdbId: '2', runtime: 110, replicas: 2 }),
      ],
      intensity: 'festival',
      seed: 8,
    });
    const count = (id: string) => result.shows.filter((s) => s.tmdbId === id).length;
    expect(count('1')).toBe(4);
    expect(count('2')).toBe(2);
  });

  it('avvisa quando le repliche richieste non ci stanno', () => {
    const result = buildSchedule({
      window: { startDate: START, days: 1 },
      films: [film({ tmdbId: '1', title: 'Fitzcarraldo', runtime: 158, replicas: 6 })],
      intensity: 'soft',
      seed: 2,
    });
    expect(result.shows.length).toBeLessThan(6);
    expect(result.warnings.join(' ')).toContain('Fitzcarraldo');
  });

  it('distribuisce equamente quando le repliche non sono specificate', () => {
    const result = buildSchedule({
      window: { startDate: START, days: 7 },
      films: [
        film({ tmdbId: '1', runtime: 100 }),
        film({ tmdbId: '2', runtime: 100 }),
        film({ tmdbId: '3', runtime: 100 }),
      ],
      intensity: 'normal',
      seed: 4,
    });
    const counts = ['1', '2', '3'].map((id) => result.shows.filter((s) => s.tmdbId === id).length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('riempie la prima serata anche con pochi film in cartellone', () => {
    const result = buildSchedule({
      window: { startDate: START, days: 3 },
      films: [film({ tmdbId: '1', runtime: 100 }), film({ tmdbId: '2', runtime: 100 })],
      intensity: 'normal',
      seed: 17,
    });
    const days = new Set(result.shows.map((s) => s.day));
    for (const d of days) {
      expect(
        result.shows.some((s) => s.day === d && s.band === 'evening'),
        `nessuna prima serata il ${d}`
      ).toBe(true);
    }
  });

  it('ripete volentieri un film nella stessa giornata, ma mai due volte di fila', () => {
    // Con 6-7 spettacoli al giorno e pochi titoli le repliche in giornata sono
    // inevitabili — ed è quello che fai davvero (Sirāt alle 10:00 e alle 16:10).
    // Quello che non deve succedere è lo stesso film in due slot consecutivi.
    const result = buildSchedule({
      window: { startDate: START, days: 7 },
      films: [
        film({ tmdbId: '1', runtime: 100 }),
        film({ tmdbId: '2', runtime: 100 }),
        film({ tmdbId: '3', runtime: 100 }),
      ],
      intensity: 'normal',
      seed: 6,
    });

    const sorted = [...result.shows].sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].day !== sorted[i - 1].day) continue;
      expect(
        sorted[i].tmdbId,
        `${sorted[i].title} di fila a sé stesso il ${sorted[i].day}`
      ).not.toBe(sorted[i - 1].tmdbId);
    }
    // …e le repliche in giornata devono esserci per davvero.
    const perDay = new Map<string, string[]>();
    for (const s of sorted) perDay.set(s.day, [...(perDay.get(s.day) ?? []), s.tmdbId]);
    const hasRepeat = [...perDay.values()].some((ids) => new Set(ids).size < ids.length);
    expect(hasRepeat).toBe(true);
  });
});

describe('buildSchedule — spettacoli bloccati', () => {
  it('non li sposta di un minuto', () => {
    const locked: ScheduledShow = {
      tmdbId: '9',
      title: 'Bloccato',
      runtime: 90,
      day: '2026-07-28',
      date: '2026-07-28',
      time: '16:00',
      endTime: '17:30',
      startMinute: onDay(1, 16, 0),
      endMinute: onDay(1, 17, 30),
      band: 'afternoon',
      locked: true,
    };

    const result = buildSchedule({
      window: { startDate: START, days: 5 },
      films: [film({ tmdbId: '1', runtime: 120 }), film({ tmdbId: '9', title: 'Bloccato', runtime: 90 })],
      locked: [locked],
      seed: 13,
    });

    const kept = result.shows.find((s) => s.locked);
    expect(kept).toBeDefined();
    expect(kept!.day).toBe('2026-07-28');
    expect(kept!.time).toBe('16:00');
    expect(kept!.tmdbId).toBe('9');
  });

  it('tratta lo spettacolo bloccato come spazio occupato', () => {
    const locked: ScheduledShow = {
      tmdbId: '9',
      title: 'Bloccato',
      runtime: 90,
      day: '2026-07-27',
      date: '2026-07-27',
      time: '18:00',
      endTime: '19:30',
      startMinute: onDay(0, 18, 0),
      endMinute: onDay(0, 19, 30),
      band: 'afternoon',
      locked: true,
    };

    const result = buildSchedule({
      window: { startDate: START, days: 1 },
      films: [film({ tmdbId: '1', runtime: 120 })],
      locked: [locked],
      seed: 21,
    });

    const sorted = [...result.shows].sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].startMinute - sorted[i - 1].endMinute).toBeGreaterThanOrEqual(MIN_GAP_MINUTES);
    }
  });

  it('conserva un blocco fuori periodo come vincolo, con avviso', () => {
    const locked: ScheduledShow = {
      tmdbId: '9',
      title: 'Fuori periodo',
      runtime: 90,
      day: '2026-08-20',
      date: '2026-08-20',
      time: '18:00',
      endTime: '19:30',
      startMinute: onDay(24, 18, 0),
      endMinute: onDay(24, 19, 30),
      band: 'afternoon',
      locked: true,
    };

    const result = buildSchedule({
      window: { startDate: START, days: 3 },
      films: [film({ tmdbId: '1', runtime: 100 })],
      locked: [locked],
      seed: 1,
    });

    expect(result.shows.some((s) => s.tmdbId === '9')).toBe(false);
    expect(result.warnings.join(' ')).toContain('fuori dal periodo');
  });
});

describe('buildSchedule — preferenze e casi limite', () => {
  it('onora la fascia preferita con un cartellone normale', () => {
    // La fascia preferita è una precedenza: chi ne ha chiesta una viene preso in
    // considerazione solo negli slot di quella fascia, finché ci sono alternative.
    for (const seed of [15, 3, 77]) {
      const result = buildSchedule({
        window: { startDate: START, days: 7 },
        films: [
          film({ tmdbId: '1', runtime: 100, preferredBand: 'evening', replicas: 3 }),
          film({ tmdbId: '2', runtime: 95 }),
          film({ tmdbId: '3', runtime: 120 }),
          film({ tmdbId: '4', runtime: 105 }),
          film({ tmdbId: '5', runtime: 130 }),
          film({ tmdbId: '6', runtime: 90 }),
        ],
        intensity: 'normal',
        seed,
      });
      const mine = result.shows.filter((s) => s.tmdbId === '1');
      expect(mine, `seed ${seed}`).toHaveLength(3);
      for (const s of mine) {
        expect(s.band, `seed ${seed}, ${s.day} ${s.time}`).toBe('evening');
      }
    }
  });

  it('con pochissimi titoli tiene la fascia e sacrifica la varietà', () => {
    // Due film per 42 spettacoli: senza repliche consecutive l'alternanza è
    // forzata, quindi il film "solo di sera" finisce per forza anche altrove.
    // È un caso degenere, e va segnalato invece che subìto in silenzio.
    const result = buildSchedule({
      window: { startDate: START, days: 7 },
      films: [
        film({ tmdbId: '1', title: 'Solo di sera', runtime: 100, preferredBand: 'evening', replicas: 3 }),
        film({ tmdbId: '2', runtime: 100 }),
      ],
      intensity: 'normal',
      seed: 15,
    });
    // La fascia richiesta viene comunque rispettata; ciò che si perde è la
    // varietà, e di quello il motore avvisa.
    const mine = result.shows.filter((s) => s.tmdbId === '1');
    expect(mine).toHaveLength(3);
    for (const s of mine) expect(s.band).toBe('evening');
    expect(result.warnings.join(' ')).toContain('Aggiungi titoli');

    // E la giornata non deve restare bucata per far posto alla preferenza.
    const perDay = new Map<string, number>();
    for (const s of result.shows) perDay.set(s.day, (perDay.get(s.day) ?? 0) + 1);
    for (const [day, n] of perDay) expect(n, `il ${day}`).toBeGreaterThanOrEqual(5);
  });

  it('esclude i film senza durata e lo dice', () => {
    const result = buildSchedule({
      window: { startDate: START, days: 3 },
      films: [
        film({ tmdbId: '1', title: 'Senza durata', runtime: 0 }),
        film({ tmdbId: '2', runtime: 100 }),
      ],
      seed: 1,
    });
    expect(result.shows.some((s) => s.tmdbId === '1')).toBe(false);
    expect(result.warnings.join(' ')).toContain('Senza durata');
  });

  it('non programma prima di notBefore', () => {
    const notBefore = onDay(0, 19, 0);
    const result = buildSchedule({
      window: { startDate: START, days: 2 },
      films: [film({ tmdbId: '1', runtime: 100 })],
      notBefore,
      seed: 9,
    });
    for (const s of result.shows) {
      expect(s.startMinute).toBeGreaterThanOrEqual(notBefore);
    }
  });

  it('scarta i duplicati nella lista dei film', () => {
    const result = buildSchedule({
      window: { startDate: START, days: 3 },
      films: [film({ tmdbId: '1', runtime: 100 }), film({ tmdbId: '1', runtime: 100 })],
      seed: 1,
    });
    expect(result.stats.films).toBe(1);
  });

  it('non fa nulla di strano senza film', () => {
    const result = buildSchedule({ window: { startDate: START, days: 3 }, films: [], seed: 1 });
    expect(result.shows).toHaveLength(0);
    expect(result.warnings.join(' ')).toContain('Nessun film valido');
  });

  it('regge un film più lungo della giornata di programmazione', () => {
    const result = buildSchedule({
      window: { startDate: START, days: 2 },
      films: [film({ tmdbId: '1', title: 'Interminabile', runtime: 16 * 60 })],
      seed: 1,
    });
    expect(result.shows).toHaveLength(0);
    expect(result.warnings.join(' ')).toContain('Interminabile');
  });
});

describe('snapShowTo — trascinamento nel calendario', () => {
  const base: ScheduledShow = {
    tmdbId: '1',
    title: 'Perfect Days',
    runtime: 124,
    day: '2026-07-27',
    date: '2026-07-27',
    time: '18:00',
    endTime: '20:04',
    startMinute: onDay(0, 18, 0),
    endMinute: onDay(0, 20, 4),
    band: 'afternoon',
    locked: false,
  };

  it('aggancia a un orario tondo quando è a portata', () => {
    // Rilasciato alle 16:37 finisce alle 16:30, non alle 16:35: mezz'ora tonda
    // batte cinque minuti di precisione.
    const moved = snapShowTo(base, onDay(0, 16, 37), { occupied: [] });
    expect(moved).not.toBeNull();
    expect(moved!.time).toBe('16:30');
    expect(isElegant(moved!.startMinute)).toBe(true);
  });

  it('sale all\'ora tonda successiva quando il rilascio è a ridosso', () => {
    const moved = snapShowTo(base, onDay(0, 16, 52), { occupied: [] });
    expect(moved!.time).toBe('17:00');
  });

  it('non stravolge un rilascio già elegante', () => {
    expect(snapShowTo(base, onDay(0, 16, 15), { occupied: [] })!.time).toBe('16:15');
    expect(snapShowTo(base, onDay(0, 16, 0), { occupied: [] })!.time).toBe('16:00');
  });

  it('scavalca uno spazio occupato invece di sovrapporsi', () => {
    const occupied = [{ start: onDay(0, 16, 0), end: onDay(0, 18, 0) }];
    const moved = snapShowTo(base, onDay(0, 16, 30), { occupied });
    expect(moved).not.toBeNull();
    const block = { start: moved!.startMinute, end: moved!.endMinute + MIN_GAP_MINUTES };
    expect(block.start < occupied[0].end && occupied[0].start < block.end).toBe(false);
  });

  it('rifiuta di uscire dall\'orario di apertura', () => {
    const moved = snapShowTo(base, onDay(0, 6, 0), { occupied: [], searchRadius: 30 });
    expect(moved).toBeNull();
  });

  it('rifiuta di sforare la chiusura', () => {
    const moved = snapShowTo(base, onDay(0, 23, 30), { occupied: [], searchRadius: 20 });
    expect(moved).toBeNull();
  });

  it('restituisce null se non c\'è spazio nel raggio di ricerca', () => {
    const occupied = [{ start: onDay(0, 10, 0), end: onDay(1, 1, 0) }];
    const moved = snapShowTo(base, onDay(0, 18, 0), { occupied });
    expect(moved).toBeNull();
  });

  it('mantiene il giorno di programmazione per uno spostamento dopo la mezzanotte', () => {
    // Solo un corto può stare dopo la mezzanotte: il film deve *finire* entro
    // l'01:00. Le pulizie no: dopo l'ultimo spettacolo il cinema chiude.
    const corto: ScheduledShow = { ...base, title: 'Corto di mezzanotte', runtime: 30 };
    const moved = snapShowTo(corto, onDay(1, 0, 10), { occupied: [], searchRadius: 60 });
    expect(moved).not.toBeNull();
    expect(moved!.time).toBe('00:00'); // la mezzanotte tonda batte le 00:10
    expect(moved!.day).toBe('2026-07-27');   // la serata di lunedì
    expect(moved!.date).toBe('2026-07-28');  // ma la data di calendario è martedì
  });

  it('non fa entrare un lungometraggio dopo la mezzanotte', () => {
    // 124 minuti dalle 00:10 finirebbero alle 02:14: nessuno spazio legale.
    const moved = snapShowTo(base, onDay(1, 0, 10), { occupied: [], searchRadius: 60 });
    expect(moved).toBeNull();
  });

  // Il caso limite dove si annidava un difetto vero: la validazione a valle
  // confrontava la chiusura con la fine delle *pulizie*, e rifiutava
  // spettacoli che finivano alle 00:59. Qui si presidia il confine esatto.
  it('accetta un film che finisce esattamente all\'01:00', () => {
    // 23:45 + 75′ = 01:00 in punto.
    const film: ScheduledShow = { ...base, title: 'Angst', runtime: 75 };
    const moved = snapShowTo(film, onDay(0, 23, 45), { occupied: [], searchRadius: 5 });
    expect(moved).not.toBeNull();
    expect(moved!.time).toBe('23:45');
    expect(moved!.endTime).toBe('01:00');
  });

  it('accetta un film che finisce alle 00:59, pulizie oltre la chiusura', () => {
    // 22:45 + 134′ = 00:59; con i 10 minuti di pausa si andrebbe all'01:09,
    // ma dopo l'ultimo spettacolo il cinema chiude e nessuno le aspetta.
    const film: ScheduledShow = { ...base, title: 'Brokeback Mountain', runtime: 134 };
    const moved = snapShowTo(film, onDay(0, 22, 45), { occupied: [], searchRadius: 5 });
    expect(moved).not.toBeNull();
    expect(moved!.endTime).toBe('00:59');
  });

  it('rifiuta comunque un film che sfora davvero la chiusura', () => {
    // 23:45 + 90′ = 01:15: oltre la chiusura, e resta illegale.
    const film: ScheduledShow = { ...base, title: 'Troppo lungo', runtime: 90 };
    expect(snapShowTo(film, onDay(0, 23, 45), { occupied: [], searchRadius: 5 })).toBeNull();
  });

  it('conserva lo stato di blocco', () => {
    const moved = snapShowTo({ ...base, locked: true }, onDay(0, 15, 0), { occupied: [] });
    expect(moved!.locked).toBe(true);
  });
});
