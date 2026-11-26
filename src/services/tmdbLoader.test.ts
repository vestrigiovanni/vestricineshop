import { describe, expect, it } from 'vitest';
import { tmdbLoader } from './tmdbLoader';

const t = (taglia: string) => `https://image.tmdb.org/t/p/${taglia}/abc.jpg`;

describe('tmdbLoader', () => {
  it('sceglie la misura TMDB più piccola che basta', () => {
    expect(tmdbLoader({ src: t('w1280'), width: 640 })).toBe(t('w780'));
    expect(tmdbLoader({ src: t('original'), width: 1080 })).toBe(t('w1280'));
  });
  it('non supera la misura scritta nell\'indirizzo', () => {
    expect(tmdbLoader({ src: t('w500'), width: 1080 })).toBe(t('w500'));
    expect(tmdbLoader({ src: t('w342'), width: 384 })).toBe(t('w342'));
  });
  it('oltre i 1280 usa l\'originale solo se era chiesto', () => {
    expect(tmdbLoader({ src: t('original'), width: 1920 })).toBe(t('original'));
    expect(tmdbLoader({ src: t('w1280'), width: 1920 })).toBe(t('w1280'));
  });
  it('le immagini caricate dal gestionale le riduce il sito', () => {
    expect(tmdbLoader({ src: '/api/speciale/immagine/abc', width: 828 })).toBe('/api/speciale/immagine/abc?w=828');
  });
  it('i file del sito vanno così come sono, senza Vercel', () => {
    expect(tmdbLoader({ src: '/logos/venezia_v1.png', width: 96 })).toBe('/logos/venezia_v1.png');
  });
});
