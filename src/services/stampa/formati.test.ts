import { describe, it, expect } from 'vitest';
import { consiglio, FORMATI, giudizio, riquadroIniziale, sposta, tira } from './formati';

describe('formati', () => {
  it('il consiglio da scrivere accanto al banner', () => {
    expect(consiglio(FORMATI.bannerOrizzontale)).toBe('Ideale 3840 × 1600 px, almeno 2560 px di larghezza.');
    expect(consiglio(FORMATI.foto)).toMatch(/lato lungo/);
  });

  it('giudizio: un banner largo 1920 è basso, uno di 3840 va bene', () => {
    expect(giudizio(1920, 800, FORMATI.bannerOrizzontale).ok).toBe(false);
    expect(giudizio(1920, 800, FORMATI.bannerOrizzontale).testo).toMatch(/almeno 2560/);
    expect(giudizio(3840, 1600, FORMATI.bannerOrizzontale)).toEqual({ ok: true, testo: '3840 × 1600 px: va bene.' });
  });

  it('per le foto conta il lato lungo: una verticale di 1200×1800 va bene', () => {
    expect(giudizio(1200, 1800, FORMATI.foto).ok).toBe(true);
    expect(giudizio(1200, 800, FORMATI.foto).ok).toBe(false);
  });

  it('senza misure niente giudizio', () => {
    expect(giudizio(0, 0, FORMATI.locandina)).toEqual({ ok: true, testo: '' });
  });
});

describe('ritaglio', () => {
  it('riquadro iniziale: il più grande con le proporzioni, centrato', () => {
    // 4000×2000 (2:1) ritagliato a 16:9: tutta l'altezza, larghezza 3556 su 4000.
    const b = riquadroIniziale(4000, 2000, 16 / 9);
    expect(b.h).toBe(1);
    expect(b.w * 4000).toBeCloseTo(3555.6, 0);
    expect(b.x).toBeCloseTo((1 - b.w) / 2);
    // 1000×1000 a 2:1: tutta la larghezza, metà altezza, centrato.
    expect(riquadroIniziale(1000, 1000, 2)).toEqual({ x: 0, y: 0.25, w: 1, h: 0.5 });
    expect(riquadroIniziale(1000, 1000, 0)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('tira l’angolo: le proporzioni restano, non esce dall’immagine', () => {
    const b = tira({ x: 0, y: 0, w: 0.5, h: 0.5 }, 0.8, 0.3, 1000, 1000, 2);
    expect(b.w).toBeCloseTo(0.8);
    expect(b.h).toBeCloseTo(0.4);
    // Troppo in basso: si ferma al bordo e la larghezza segue.
    const c = tira({ x: 0, y: 0.6, w: 0.2, h: 0.2 }, 1, 1, 1000, 1000, 1);
    expect(c.y + c.h).toBeCloseTo(1);
    expect(c.w).toBeCloseTo(0.4);
    // Libero: segue il puntatore.
    expect(tira({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, 0.5, 0.9, 1000, 1000, 0)).toEqual({ x: 0.1, y: 0.1, w: 0.4, h: 0.8 });
  });

  it('sposta senza uscire', () => {
    expect(sposta({ x: 0.5, y: 0.5, w: 0.4, h: 0.4 }, 0.5, -1)).toEqual({ x: 0.6, y: 0, w: 0.4, h: 0.4 });
  });
});
