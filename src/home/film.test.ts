import { describe, expect, it } from 'vitest';
import { filmDaRighe, idYouTube, type Riga } from './film';

const NOW = new Date('2026-11-27T15:00:00Z');

type Scheda = NonNullable<Riga['movie']>;
const riga = (extra: Partial<Omit<Riga, 'movie'>> & { movie?: Partial<Scheda> | null } = {}): Riga => {
  const { movie, ...resto } = extra;
  return {
    pretixId: 1, name: 'NOME PRETIX', dateFrom: new Date('2026-11-27T19:30:00Z'), roomName: 'CA GRANDA', isSoldOut: false,
    tmdbId: '10', metaLingua: 'Inglese', metaSottotitoli: 'Italiano', metaFormat: null, projectionSpecs: ['4K'], projectionSpecsNote: null,
    availableSeats: 40, totalSeats: 60,
    ...resto,
    movie: movie === null ? null : {
      tmdbId: '10', customTitle: 'Il titolo di Gio', customOverview: 'Trama', customRating: '14+', customPosterPath: '/p.jpg', customBackdropPath: '/b.jpg',
      customLogoPath: null, customTrailerUrl: null, customTrailerKeys: [], customDirector: 'Regista', customCast: null, customRoomName: null,
      manualSoldOut: false, releaseDate: '2022-05-21', runtime: 147, tagline: null, genres: [], voteAverage: null, awards: [],
      ...movie,
    },
  };
};

describe('filmDaRighe', () => {
  it('un film per tmdbId, coi suoi spettacoli', () => {
    const film = filmDaRighe([riga({ pretixId: 1 }), riga({ pretixId: 2, dateFrom: new Date('2026-11-28T19:30:00Z') })], [], NOW);
    expect(film).toHaveLength(1);
    expect(film[0].subevents.map(s => s.id)).toEqual([1, 2]);
    expect(film[0].release_year).toBe('2022');
  });

  it('i testi di Gio vincono su Pretix', () => {
    const [f] = filmDaRighe([riga({ movie: { customRoomName: 'Sala Timothée' } })], [], NOW);
    expect(f.title).toBe('Il titolo di Gio');
    expect(f.subevents[0].roomName).toBe('Sala Timothée');
  });

  it('esaurito a mano vale per ogni spettacolo', () => {
    const [f] = filmDaRighe([riga({ movie: { manualSoldOut: true } })], [], NOW);
    expect(f.subevents[0].isSoldOut).toBe(true);
    expect(f.isSoldOut).toBe(true);
  });

  it('le proiezioni senza scheda film restano fuori', () => {
    expect(filmDaRighe([riga({ tmdbId: null, movie: null })], [], NOW)).toEqual([]);
  });

  it('generi, voto e titolo originale dal catalogo quando la scheda non li ha', () => {
    const [f] = filmDaRighe([riga()], [{ tmdbId: '10', genres: ['Dramma'], voteAverage: 7.2, originalTitle: 'Original' }], NOW);
    expect(f.genres).toEqual(['Dramma']);
    expect(f.voteAverage).toBe(7.2);
    expect(f.originalTitle).toBe('Original');
  });

  it('il trailer: prima quello scelto a mano, poi le chiavi salvate', () => {
    const [a] = filmDaRighe([riga({ movie: { customTrailerUrl: 'https://www.youtube.com/watch?v=abcdefghijk', customTrailerKeys: ['zzzzzzzzzzz'] } })], [], NOW);
    expect(a.trailerKey).toBe('abcdefghijk');
    const [b] = filmDaRighe([riga({ movie: { customTrailerKeys: ['zzzzzzzzzzz'] } })], [], NOW);
    expect(b.trailerKey).toBe('zzzzzzzzzzz');
  });

  it('il logo "none" vuol dire niente logo', () => {
    const [f] = filmDaRighe([riga({ movie: { customLogoPath: 'none' } })], [], NOW);
    expect(f.logo_path).toBe('');
  });
});

describe('idYouTube', () => {
  it('legge l\'id da ogni forma di link', () => {
    expect(idYouTube('https://youtu.be/abcdefghijk')).toBe('abcdefghijk');
    expect(idYouTube('https://www.youtube.com/embed/abcdefghijk?x=1')).toBe('abcdefghijk');
    expect(idYouTube('abcdefghijk')).toBe('abcdefghijk');
    expect(idYouTube('')).toBe('');
  });
});
