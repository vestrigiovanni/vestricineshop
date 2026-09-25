import { describe, expect, it } from 'vitest';
import {
  bookLabel,
  heroLanguage,
  languageLabel,
  mainAwardLabel,
  pickInitialMovieId,
  pickInitialSubeventId,
  showtimeDays,
  type SubeventLike,
} from './heroData';

const se = (over: Partial<SubeventLike> & { id: number }): SubeventLike => ({
  date: '2026-09-25T19:15:00.000Z',
  dayLabel: 'Oggi',
  timeLabel: '21:15',
  isSoldOut: false,
  language: 'Lingua originale',
  subtitles: 'Italiano',
  specs: [],
  specsNote: '',
  ...over,
});

describe('languageLabel', () => {
  it('scrive lingua e sottotitoli come nella riga dei dati', () => {
    expect(languageLabel('Lingua originale', 'Italiano', '')).toBe('V.O. · SOTT. ITA');
  });
  it('ignora "Nessuno" e la versione originale', () => {
    expect(languageLabel('Italiano', 'NESSUNO', 'Versione Originale')).toBe('ITALIANO');
  });
  it('mostra una versione speciale', () => {
    expect(languageLabel('', '', '3D')).toBe('3D');
  });
});

describe('heroLanguage', () => {
  const fallback = { language: 'Italiano', subtitles: '' };
  it('usa la lingua degli spettacoli quando è la stessa per tutti', () => {
    expect(heroLanguage([se({ id: 1 }), se({ id: 2 })], fallback)).toEqual({ language: 'Lingua originale', subtitles: 'Italiano' });
  });
  it('torna alla scheda film quando gli spettacoli non sono d\'accordo', () => {
    expect(heroLanguage([se({ id: 1 }), se({ id: 2, language: 'Italiano', subtitles: '' })], fallback)).toEqual(fallback);
  });
  it('torna alla scheda film senza spettacoli o senza lingua', () => {
    expect(heroLanguage([], fallback)).toEqual(fallback);
    expect(heroLanguage([se({ id: 1, language: '', subtitles: '' })], fallback)).toEqual(fallback);
  });
});

describe('showtimeDays', () => {
  const lang = { language: 'Lingua originale', subtitles: 'Italiano' };

  it('raggruppa gli spettacoli per giorno, nell\'ordine in cui arrivano', () => {
    const days = showtimeDays([
      se({ id: 1, dayLabel: 'Oggi', timeLabel: '18:30' }),
      se({ id: 2, dayLabel: 'Oggi', timeLabel: '21:15' }),
      se({ id: 3, dayLabel: 'ven 26 set', timeLabel: '21:30' }),
    ], lang, []);
    expect(days.map(d => [d.dayLabel, d.shows.map(s => s.time)])).toEqual([
      ['Oggi', ['18:30', '21:15']],
      ['ven 26 set', ['21:30']],
    ]);
  });

  it('accende il primo spettacolo non esaurito', () => {
    const days = showtimeDays([
      se({ id: 1, isSoldOut: true }),
      se({ id: 2 }),
      se({ id: 3 }),
    ], lang, []);
    const flat = days.flatMap(d => d.shows);
    expect(flat.map(s => s.isNext)).toEqual([false, true, false]);
    expect(flat[0].isSoldOut).toBe(true);
  });

  it('mette accanto all\'orario solo quello che vale per quella replica', () => {
    const days = showtimeDays([
      se({ id: 1, specs: ['4K', 'ATMOS'] }),
      se({ id: 2, language: 'Italiano', subtitles: '', specs: ['4K'], specsNote: 'con il regista' }),
    ], lang, ['4K']);
    const [a, b] = days[0].shows;
    expect(a.tags).toEqual(['DOLBY ATMOS']);
    expect(b.tags).toEqual(['ITA', 'CON IL REGISTA']);
  });
});

describe('bookLabel', () => {
  const lang = { language: 'Lingua originale', subtitles: 'Italiano' };
  it('oggi dice solo l\'ora', () => {
    expect(bookLabel(showtimeDays([se({ id: 7, timeLabel: '21:15' })], lang, []))).toEqual({ id: 7, label: '21:15' });
  });
  it('un altro giorno dice anche il giorno', () => {
    const days = showtimeDays([
      se({ id: 1, isSoldOut: true }),
      se({ id: 2, dayLabel: 'ven 26 set', timeLabel: '18:30' }),
    ], lang, []);
    expect(bookLabel(days)).toEqual({ id: 2, label: 'ven 26 set 18:30' });
  });
  it('tutto esaurito: niente', () => {
    expect(bookLabel(showtimeDays([se({ id: 1, isSoldOut: true })], lang, []))).toBeNull();
  });
});

describe('mainAwardLabel', () => {
  it('sceglie il premio vinto al festival più prestigioso', () => {
    expect(mainAwardLabel([
      { type: 'oscar', details: 'Vincitore: Miglior film', year: 2025 },
      { type: 'cannes', details: "Vincitore: Palma d'Oro", year: 2024 },
    ])).toBe("Palma d'Oro · 2024");
  });
  it('le sole candidature non vanno in alto', () => {
    expect(mainAwardLabel([{ type: 'venice', details: "Candidatura: Leone d'Oro", year: 2024 }])).toBeNull();
    expect(mainAwardLabel([])).toBeNull();
    expect(mainAwardLabel(undefined)).toBeNull();
  });
});

describe('pickInitialMovieId', () => {
  const movies = [{ id: 10 }, { id: 20 }];
  it('apre il film chiesto se è in programmazione', () => {
    expect(pickInitialMovieId(movies, '20')).toBe(20);
    expect(pickInitialMovieId(movies, ['20', '10'])).toBe(20);
  });
  it('ignora un film che non c\'è o un valore sbagliato', () => {
    expect(pickInitialMovieId(movies, '99')).toBeNull();
    expect(pickInitialMovieId(movies, 'anora')).toBeNull();
    expect(pickInitialMovieId(movies, '')).toBeNull();
    expect(pickInitialMovieId(movies, undefined)).toBeNull();
  });
});

describe('pickInitialSubeventId', () => {
  const movies = [
    { id: 10, subevents: [{ id: 1, isSoldOut: false }, { id: 2, isSoldOut: true }] },
    { id: 20, subevents: [{ id: 3, isSoldOut: false }] },
  ];
  it('apre lo spettacolo chiesto se è del film e si può ancora prenotare', () => {
    expect(pickInitialSubeventId(movies, 10, '1')).toBe(1);
  });
  it('ignora uno spettacolo esaurito, di un altro film o sconosciuto', () => {
    expect(pickInitialSubeventId(movies, 10, '2')).toBeNull();
    expect(pickInitialSubeventId(movies, 10, '3')).toBeNull();
    expect(pickInitialSubeventId(movies, 10, '99')).toBeNull();
    expect(pickInitialSubeventId(movies, 10, 'abc')).toBeNull();
  });
  it('senza film o senza spettacolo non apre niente', () => {
    expect(pickInitialSubeventId(movies, null, '1')).toBeNull();
    expect(pickInitialSubeventId(movies, 10, undefined)).toBeNull();
  });
});
