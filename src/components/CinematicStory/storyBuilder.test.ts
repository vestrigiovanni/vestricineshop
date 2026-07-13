import { describe, it, expect } from 'vitest';
import { buildStory, StoryChapter } from './storyBuilder';
import type { GroupedMovie } from '../MovieShowcase/MovieShowcase';

type TaglineChapter = Extract<StoryChapter, { kind: 'tagline' }>;
type StripesChapter = Extract<StoryChapter, { kind: 'stripes' }>;
type MosaicChapter = Extract<StoryChapter, { kind: 'mosaic' }>;

const mk = (id: number, opts: Partial<GroupedMovie> = {}): GroupedMovie => ({
  id,
  title: `Film ${id}`,
  overview: '',
  poster_path: `/p${id}.jpg`,
  backdrop_path: `/b${id}.jpg`,
  release_date: '2026-01-01',
  subevents: [],
  tagline: `Slogan ${id}`,
  extraBackdrops: [`/x${id}.jpg`],
  ...opts,
});

const kinds = (chapters: ReturnType<typeof buildStory>) => chapters.map(c => c.kind);

describe('buildStory', () => {
  it('senza film non produce capitoli', () => {
    expect(buildStory([])).toEqual([]);
  });

  it('con 5 film completi produce la sequenza intera', () => {
    const movies = [mk(1), mk(2), mk(3), mk(4), mk(5)];
    const chapters = buildStory(movies);
    expect(kinds(chapters)).toEqual(['tagline', 'stripes', 'calendar', 'tagline', 'mosaic', 'outro']);

    const t1 = chapters[0] as TaglineChapter;
    const stripes = chapters[1] as StripesChapter;
    const t2 = chapters[3] as TaglineChapter;
    const mosaic = chapters[4] as MosaicChapter;
    expect(t1.movie.id).toBe(1);
    expect(stripes.movies).toHaveLength(3);
    expect(stripes.movies.map((m: GroupedMovie) => m.id)).not.toContain(1);
    expect(t2.movie.id).not.toBe(1);
    expect(mosaic.movies).toHaveLength(5);
  });

  it('film senza tagline non generano capitoli slogan', () => {
    const movies = [mk(1, { tagline: '' }), mk(2, { tagline: undefined }), mk(3, { tagline: '  ' })];
    const chapters = buildStory(movies);
    expect(kinds(chapters)).toEqual(['stripes', 'calendar', 'mosaic', 'outro']);
  });

  it('con un solo film completo evita strisce duplicate e mosaico', () => {
    const chapters = buildStory([mk(1)]);
    expect(kinds(chapters)).toEqual(['tagline', 'calendar', 'outro']);
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
    expect(stripes.movies.map((m: GroupedMovie) => m.id)).toEqual([3]);
  });
});
