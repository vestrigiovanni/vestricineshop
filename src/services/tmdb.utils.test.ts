import { describe, it, expect } from 'vitest';
import { pickExtraBackdrops, pickTagline, TMDBBackdrop } from './tmdb.utils';

const bd = (file_path: string, iso: string | null, vote = 5, votes = 10): TMDBBackdrop => ({
  file_path,
  iso_639_1: iso,
  vote_average: vote,
  vote_count: votes,
});

describe('pickExtraBackdrops', () => {
  it('esclude il backdrop principale già in uso', () => {
    const result = pickExtraBackdrops([bd('/main.jpg', null), bd('/alt.jpg', null)], '/main.jpg');
    expect(result).toEqual(['/alt.jpg']);
  });

  it('preferisce i backdrop senza lingua, ordinati per voto', () => {
    const result = pickExtraBackdrops(
      [bd('/en.jpg', 'en', 9), bd('/a.jpg', null, 6), bd('/b.jpg', null, 8)],
      '/main.jpg'
    );
    expect(result).toEqual(['/b.jpg', '/a.jpg', '/en.jpg']);
  });

  it('rispetta il massimo di 3 e scarta i duplicati', () => {
    const result = pickExtraBackdrops(
      [bd('/a.jpg', null, 9), bd('/a.jpg', null, 9), bd('/b.jpg', null, 8), bd('/c.jpg', null, 7), bd('/d.jpg', null, 6)],
      null
    );
    expect(result).toEqual(['/a.jpg', '/b.jpg', '/c.jpg']);
  });

  it('a parità di voto ordina per numero di voti', () => {
    const result = pickExtraBackdrops([bd('/pochi.jpg', null, 7, 3), bd('/tanti.jpg', null, 7, 50)], null);
    expect(result).toEqual(['/tanti.jpg', '/pochi.jpg']);
  });

  it('restituisce array vuoto senza candidati', () => {
    expect(pickExtraBackdrops([], '/main.jpg')).toEqual([]);
    expect(pickExtraBackdrops([bd('/main.jpg', null)], '/main.jpg')).toEqual([]);
  });
});

describe('pickTagline', () => {
  const con = (tagline: string, original_language: string, tradotti: Record<string, string>) => ({
    tagline,
    original_language,
    translations: { translations: Object.entries(tradotti).map(([iso_639_1, t]) => ({ iso_639_1, data: { tagline: t } })) },
  });

  it('preferisce il motto italiano', () => {
    expect(pickTagline(con('Ogni famiglia ha i suoi segreti.', 'en', { en: 'Every family has its secrets.' }))).toBe('Ogni famiglia ha i suoi segreti.');
  });

  it('senza italiano prende la lingua originale, poi l\'inglese', () => {
    expect(pickTagline(con('', 'fr', { fr: 'Le temps détruit tout.', en: 'Time destroys everything.' }))).toBe('Le temps détruit tout.');
    expect(pickTagline(con('  ', 'sv', { en: 'A film by Ingmar Bergman.' }))).toBe('A film by Ingmar Bergman.');
  });

  it('una lingua che non si scrive in caratteri latini lascia il posto all\'inglese', () => {
    expect(pickTagline(con('', 'ja', { ja: '生きろ。', en: 'The fate of the world rests on the courage of one warrior.' }))).toBe('The fate of the world rests on the courage of one warrior.');
  });

  it('senza motto non se ne inventa uno', () => {
    expect(pickTagline(con('', 'en', {}))).toBe('');
    expect(pickTagline(con('', 'ja', { ja: '生きろ。' }))).toBe('');
    expect(pickTagline(null)).toBe('');
    expect(pickTagline({})).toBe('');
  });
});
