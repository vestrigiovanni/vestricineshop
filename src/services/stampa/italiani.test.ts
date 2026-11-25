import { describe, it, expect } from 'vitest';
import { distribuitoDa, distributoreItaliano, notaArea } from './italiani';

describe('distributoreItaliano', () => {
  it('riconosce i nomi come li scrive MyMovies', () => {
    expect(distributoreItaliano('Bim Distribuzione')?.nome).toBe('BIM');
    expect(distributoreItaliano('Warner Bros Italia')?.nome).toBe('Warner Bros.');
    expect(distributoreItaliano('UIP - United International Pictures')?.nome).toBe('Universal Pictures');
    expect(distributoreItaliano('Universal Pictures')?.area).toBe('login');
    expect(distributoreItaliano('I Wonder Pictures')?.area).toBe('automatica');
    expect(distributoreItaliano('Mubi')?.tmdb).toBe(204957);
  });
  it('Vision Distribution sì, «Mial Vision» da solo no', () => {
    expect(distributoreItaliano('Vision Distribution')?.nome).toBe('Vision Distribution');
    expect(distributoreItaliano('Europictures in collaborazione con Mial Vision')?.nome).toBe('Europictures');
  });
  it('sconosciuto o vuoto: null', () => {
    expect(distributoreItaliano('Indipendenti Regionali')).toBeNull();
    expect(distributoreItaliano('')).toBeNull();
    expect(notaArea(undefined)).toMatch(/non conosco/);
  });
});

describe('distribuitoDa', () => {
  it('legge il distributore dalla pagina MyMovies', () => {
    const html = 'Durata 139 minuti. distribuito da <a title="Film Universal Pictures 2024 " href="https://www.mymovies.it/film/2024/?distribuzione=universalpictures">Universal Pictures</a>.';
    expect(distribuitoDa(html)).toBe('Universal Pictures');
    expect(distribuitoDa('<p>niente</p>')).toBeNull();
  });
});
