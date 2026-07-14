import { describe, it, expect } from 'vitest';
import { buildStory, buildWeekend, excerptOverview, StoryChapter } from './storyBuilder';
import type { GroupedMovie } from '../MovieShowcase/MovieShowcase';

type TaglineChapter = Extract<StoryChapter, { kind: 'tagline' }>;
type MarqueeChapter = Extract<StoryChapter, { kind: 'marquee' }>;
type QuoteChapter = Extract<StoryChapter, { kind: 'quote' }>;
type StripesChapter = Extract<StoryChapter, { kind: 'stripes' }>;
type StatsChapter = Extract<StoryChapter, { kind: 'stats' }>;
type LogosChapter = Extract<StoryChapter, { kind: 'logos' }>;
type AwardsChapter = Extract<StoryChapter, { kind: 'awards' }>;
type MosaicChapter = Extract<StoryChapter, { kind: 'mosaic' }>;

const mk = (id: number, opts: Partial<GroupedMovie> = {}): GroupedMovie => ({
  id,
  title: `Film ${id}`,
  overview: '',
  poster_path: `/p${id}.jpg`,
  backdrop_path: `/b${id}.jpg`,
  logo_path: `/l${id}.png`,
  release_date: '2026-01-01',
  runtime: 120,
  subevents: [{}, {}],
  awards: [],
  genres: ['Dramma'],
  tagline: `Slogan ${id}`,
  extraBackdrops: [`/x${id}a.jpg`, `/x${id}b.jpg`],
  ...opts,
});

const kinds = (chapters: StoryChapter[]) => chapters.map(c => c.kind);

describe('excerptOverview', () => {
  it('prende la prima frase se breve', () => {
    expect(excerptOverview('Una storia epica. E poi altro ancora.')).toBe('Una storia epica.');
  });

  it('tronca a parola intera con ellissi se lunga', () => {
    const long = `${'parola '.repeat(40)}fine.`;
    const result = excerptOverview(long, 50);
    expect(result.length).toBeLessThanOrEqual(51);
    expect(result.endsWith('…')).toBe(true);
    expect(result).not.toContain('  ');
  });

  it('gestisce testo vuoto', () => {
    expect(excerptOverview('')).toBe('');
  });
});

describe('buildWeekend', () => {
  // 2026-07-17 è un venerdì; in luglio Roma è UTC+2.
  const wednesday = new Date('2026-07-15T10:00:00Z');

  it('raggruppa ven/sab/dom per film, deduplica gli orari identici e ordina', () => {
    const movies = [
      mk(1, {
        subevents: [
          { date: '2026-07-17T19:00:00.000Z', isSoldOut: false, roomName: 'Sala 1' },
          { date: '2026-07-17T19:00:00.000Z', isSoldOut: true, roomName: 'Sala 1' }, // duplicato identico
          { date: '2026-07-18T16:00:00.000Z', isSoldOut: true },
        ],
      }),
      mk(2, {
        subevents: [
          { date: '2026-07-19T14:30:00.000Z' },
          { date: '2026-07-20T19:00:00.000Z' }, // lunedì: fuori dal weekend
        ],
      }),
    ];
    const days = buildWeekend(movies, wednesday);

    expect(days.map(d => d.label)).toEqual(['Venerdì', 'Sabato', 'Domenica']);
    expect(days.map(d => d.isoDate)).toEqual(['2026-07-17', '2026-07-18', '2026-07-19']);

    // venerdì: un solo chip 21:00 (Roma), prenotabile perché una copia lo è
    expect(days[0].shows).toHaveLength(1);
    expect(days[0].shows[0].times).toEqual([{ time: '21:00', isSoldOut: false, roomName: 'Sala 1' }]);

    // sabato 18:00 sold out; domenica 16:30
    expect(days[1].shows[0].times[0]).toEqual({ time: '18:00', isSoldOut: true, roomName: undefined });
    expect(days[2].shows[0].times[0].time).toBe('16:30');
  });

  it('a weekend iniziato usa il venerdì corrente e omette i giorni vuoti', () => {
    const saturday = new Date('2026-07-18T10:00:00Z');
    const movies = [mk(1, { subevents: [{ date: '2026-07-19T14:30:00.000Z' }] })];
    const days = buildWeekend(movies, saturday);
    expect(days.map(d => d.label)).toEqual(['Domenica']);
  });

  it('ordina i film del giorno per primo orario', () => {
    const movies = [
      mk(1, { subevents: [{ date: '2026-07-17T20:00:00.000Z' }] }), // 22:00
      mk(2, { subevents: [{ date: '2026-07-17T15:00:00.000Z' }] }), // 17:00
    ];
    const days = buildWeekend(movies, wednesday);
    expect(days[0].shows.map(s => s.movie.id)).toEqual([2, 1]);
  });

  it('senza proiezioni nel weekend non produce giorni', () => {
    expect(buildWeekend([mk(1, { subevents: [{ date: '2026-07-21T19:00:00.000Z' }] })], wednesday)).toEqual([]);
    expect(buildWeekend([mk(1, { subevents: [{}] })], wednesday)).toEqual([]);
  });
});

describe('buildStory', () => {
  it('senza film non produce capitoli', () => {
    expect(buildStory([])).toEqual([]);
  });

  it('con 5 film completi produce la sequenza ricca', () => {
    const movies = [mk(1), mk(2), mk(3), mk(4), mk(5)];
    const chapters = buildStory(movies);
    expect(kinds(chapters)).toEqual([
      'tagline', 'stripes', 'stats', 'logos', 'calendar',
      'tagline', 'mosaic', 'marquee',
    ]);

    const t1 = chapters[0] as TaglineChapter;
    const stripes = chapters[1] as StripesChapter;
    const logos = chapters[3] as LogosChapter;
    const t2 = chapters[5] as TaglineChapter;
    expect(t1.movie.id).toBe(1);
    expect(stripes.movies.map(m => m.id)).toEqual([2, 3, 4]);
    expect(stripes.backdropIndex).toBe(0);
    expect(logos.movies).toHaveLength(5);
    expect(t2.movie.id).toBe(5);
  });

  it('con 6 film aggiunge la seconda serie di strisce (backdropIndex 1)', () => {
    const movies = [mk(1), mk(2), mk(3), mk(4), mk(5), mk(6)];
    const chapters = buildStory(movies);
    const stripeChapters = chapters.filter(c => c.kind === 'stripes') as StripesChapter[];
    expect(stripeChapters).toHaveLength(2);
    expect(stripeChapters[1].movies.map(m => m.id)).toEqual([6]);
    expect(stripeChapters[1].backdropIndex).toBe(1);
  });

  it('calcola le statistiche della programmazione', () => {
    const movies = [
      mk(1, { runtime: 120, awards: [{}, {}], genres: ['Dramma', 'Storia'], subevents: [{}, {}, {}] }),
      mk(2, { runtime: 90, awards: [{}], genres: ['Commedia'], subevents: [{}] }),
    ];
    const stats = (buildStory(movies).find(c => c.kind === 'stats') as StatsChapter).stats;
    expect(stats).toEqual({
      filmCount: 2,
      totalHours: 4,
      awardsCount: 3,
      projectionsCount: 4,
      genresCount: 3,
    });
  });

  it('usa una citazione dalla trama per i film senza tagline', () => {
    const overview = 'Una lunga storia di mare e di vento che attraversa tre generazioni di pescatori sulle isole Orcadi.';
    const movies = [mk(1), mk(2, { tagline: '', overview }), mk(3)];
    const chapters = buildStory(movies);
    const quote = chapters.find(c => c.kind === 'quote') as QuoteChapter;
    expect(quote.movie.id).toBe(2);
    expect(quote.text).toContain('Una lunga storia');
  });

  it('crea il capitolo premi solo se ci sono premiati, max 3', () => {
    const noAwards = buildStory([mk(1), mk(2), mk(3)]);
    expect(kinds(noAwards)).not.toContain('awards');

    const movies = [
      mk(1, { awards: [{}] }),
      mk(2, { awards: [{}, {}, {}] }),
      mk(3, { awards: [{}, {}] }),
      mk(4, { awards: [{}] }),
    ];
    const awards = buildStory(movies).find(c => c.kind === 'awards') as AwardsChapter;
    expect(awards.movies.map(m => m.id)).toEqual([1, 2, 3]);
  });

  it('con seed la rotazione è deterministica ma varia tra i refresh', () => {
    const now = new Date('2026-07-15T10:00:00Z');
    const movies = Array.from({ length: 8 }, (_, i) => mk(i + 1));

    const a = buildStory(movies, now, 12345);
    const b = buildStory(movies, now, 12345);
    expect((a[0] as TaglineChapter).movie.id).toBe((b[0] as TaglineChapter).movie.id);
    expect(kinds(a)).toEqual(kinds(b));

    const firstIds = new Set(
      [1, 2, 3, 4, 5, 6].map(seed => (buildStory(movies, now, seed)[0] as TaglineChapter).movie.id)
    );
    expect(firstIds.size).toBeGreaterThan(1);
  });

  it('con cataloghi grandi applica i tetti: 8 loghi, 12 mosaico, 16 marquee', () => {
    const now = new Date('2026-07-15T10:00:00Z');
    const movies = Array.from({ length: 20 }, (_, i) => mk(i + 1));
    const chapters = buildStory(movies, now, 42);
    expect((chapters.find(c => c.kind === 'logos') as LogosChapter).movies).toHaveLength(8);
    expect((chapters.find(c => c.kind === 'mosaic') as MosaicChapter).movies).toHaveLength(12);
    expect((chapters.find(c => c.kind === 'marquee') as MarqueeChapter).movies).toHaveLength(16);
  });

  it('chiude con la frase di un film, preferendo i premiati (niente messaggi commerciali)', () => {
    const movies = Array.from({ length: 10 }, (_, i) => mk(i + 1, i === 9 ? { awards: [{}] } : {}));
    const chapters = buildStory(movies);
    const last = chapters[chapters.length - 1] as TaglineChapter;
    expect(last.kind).toBe('tagline');
    expect(last.movie.id).toBe(10);
    expect(kinds(chapters)).not.toContain('outro');
  });

  it('salta loghi e marquee quando i film sono pochi', () => {
    const movies = [mk(1), mk(2, { logo_path: null }), mk(3)];
    const chapters = buildStory(movies);
    expect(kinds(chapters)).not.toContain('logos');
    expect(kinds(chapters)).not.toContain('marquee');
    expect(kinds(chapters)).toContain('mosaic');
  });

  it('con un solo film resta una sequenza minima senza capitoli vuoti', () => {
    const chapters = buildStory([mk(1)]);
    expect(kinds(chapters)).toEqual(['tagline', 'stats', 'calendar']);
  });

  it('film senza tagline non generano capitoli slogan', () => {
    const movies = [mk(1, { tagline: '' }), mk(2, { tagline: undefined }), mk(3, { tagline: '  ' })];
    const chapters = buildStory(movies);
    expect(kinds(chapters)).not.toContain('tagline');
    const stripes = chapters.find(c => c.kind === 'stripes') as StripesChapter;
    expect(stripes.movies).toHaveLength(3);
  });

  it('il mosaico esclude i film senza poster e richiede almeno 3 poster', () => {
    const conMosaico = buildStory([mk(1), mk(2), mk(3), mk(4, { poster_path: null })]);
    const mosaic = conMosaico.find(c => c.kind === 'mosaic') as MosaicChapter;
    expect(mosaic.movies).toHaveLength(3);

    const senzaMosaico = buildStory([mk(1), mk(2, { poster_path: null }), mk(3, { poster_path: null })]);
    expect(kinds(senzaMosaico)).not.toContain('mosaic');
  });

  it('inserisce il capitolo weekend subito prima del calendario', () => {
    const now = new Date('2026-07-15T10:00:00Z');
    const movies = [mk(1, { subevents: [{ date: '2026-07-17T19:00:00.000Z' }] }), mk(2), mk(3)];
    const k = kinds(buildStory(movies, now));
    expect(k).toContain('weekend');
    expect(k.indexOf('weekend')).toBe(k.indexOf('calendar') - 1);

    // senza proiezioni weekend il capitolo sparisce
    const senza = kinds(buildStory([mk(1), mk(2), mk(3)], now));
    expect(senza).not.toContain('weekend');
  });

  it('film senza alcun backdrop non entrano nelle strisce', () => {
    const movies = [mk(1), mk(2, { backdrop_path: null, extraBackdrops: [] }), mk(3)];
    const chapters = buildStory(movies);
    const stripes = chapters.find(c => c.kind === 'stripes') as StripesChapter;
    expect(stripes.movies.map(m => m.id)).toEqual([3]);
  });
});
