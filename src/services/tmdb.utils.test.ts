import { describe, it, expect } from 'vitest';
import { pickExtraBackdrops, TMDBBackdrop } from './tmdb.utils';

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
