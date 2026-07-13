import { describe, it, expect } from 'vitest';
import { buildStory, excerptOverview, StoryChapter } from './storyBuilder';
import type { GroupedMovie } from '../MovieShowcase/MovieShowcase';

type TaglineChapter = Extract<StoryChapter, { kind: 'tagline' }>;
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

describe('buildStory', () => {
  it('senza film non produce capitoli', () => {
    expect(buildStory([])).toEqual([]);
  });

  it('con 5 film completi produce la sequenza ricca', () => {
    const movies = [mk(1), mk(2), mk(3), mk(4), mk(5)];
    const chapters = buildStory(movies);
    expect(kinds(chapters)).toEqual([
      'intro', 'tagline', 'stripes', 'stats', 'logos', 'calendar',
      'tagline', 'mosaic', 'marquee', 'outro',
    ]);

    const t1 = chapters[1] as TaglineChapter;
    const stripes = chapters[2] as StripesChapter;
    const logos = chapters[4] as LogosChapter;
    const t2 = chapters[6] as TaglineChapter;
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

  it('crea il capitolo premi solo se ci sono premiati, ordinati e max 3', () => {
    const noAwards = buildStory([mk(1), mk(2), mk(3)]);
    expect(kinds(noAwards)).not.toContain('awards');

    const movies = [
      mk(1, { awards: [{}] }),
      mk(2, { awards: [{}, {}, {}] }),
      mk(3, { awards: [{}, {}] }),
      mk(4, { awards: [{}] }),
    ];
    const awards = buildStory(movies).find(c => c.kind === 'awards') as AwardsChapter;
    expect(awards.movies.map(m => m.id)).toEqual([2, 3, 1]);
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
    expect(kinds(chapters)).toEqual(['intro', 'tagline', 'stats', 'calendar', 'outro']);
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

  it('film senza alcun backdrop non entrano nelle strisce', () => {
    const movies = [mk(1), mk(2, { backdrop_path: null, extraBackdrops: [] }), mk(3)];
    const chapters = buildStory(movies);
    const stripes = chapters.find(c => c.kind === 'stripes') as StripesChapter;
    expect(stripes.movies.map(m => m.id)).toEqual([3]);
  });
});
