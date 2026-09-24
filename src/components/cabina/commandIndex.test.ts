import { describe, it, expect } from 'vitest';
import { normalize, scoreCommand, rankCommands, type Command } from './commandIndex';

const C = (id: string, label: string, keywords: string[] = []): Command => ({ id, label, kind: 'azione', keywords });

const commands: Command[] = [
  C('oggi', 'Oggi', ['sale', 'display']),
  C('programma', 'Programma', ['palinsesto']),
  C('cassa', 'Cassa'),
  C('cache', 'Svuota la cache'),
  C('citta', 'Città'),
];

describe('normalize', () => {
  it('toglie accenti, maiuscole e spazi ai bordi', () => {
    expect(normalize('  Città ')).toBe('citta');
    expect(normalize('PROGRAMMA')).toBe('programma');
  });
});

describe('scoreCommand', () => {
  it('ordina i tipi di corrispondenza dal più forte al più debole', () => {
    const exact = scoreCommand('cassa', C('a', 'Cassa'));
    const prefix = scoreCommand('cas', C('a', 'Cassa'));
    const word = scoreCommand('cac', C('a', 'Svuota la cache'));
    const inside = scoreCommand('ass', C('a', 'Cassa'));
    const keyword = scoreCommand('pal', C('a', 'Programma', ['palinsesto']));
    const subsequence = scoreCommand('prgm', C('a', 'Programma'));
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(inside);
    expect(inside).toBeGreaterThan(keyword);
    expect(keyword).toBeGreaterThan(subsequence);
    expect(subsequence).toBeGreaterThan(0);
  });

  it('dà zero quando non c’entra niente', () => {
    expect(scoreCommand('zzz', C('a', 'Cassa'))).toBe(0);
  });
});

describe('rankCommands', () => {
  it('senza ricerca restituisce tutto, nell’ordine originale', () => {
    expect(rankCommands('', commands).map((c) => c.id)).toEqual(['oggi', 'programma', 'cassa', 'cache', 'citta']);
    expect(rankCommands('   ', commands)).toHaveLength(5);
  });

  it('mette prima l’inizio del nome e poi l’inizio di una parola', () => {
    expect(rankCommands('c', commands).map((c) => c.id).slice(0, 3)).toEqual(['cassa', 'citta', 'cache']);
  });

  it('trova per parola chiave e ignora gli accenti', () => {
    expect(rankCommands('sale', commands)[0].id).toBe('oggi');
    expect(rankCommands('citta', commands)[0].id).toBe('citta');
  });

  it('scarta ciò che non corrisponde', () => {
    expect(rankCommands('zzz', commands)).toEqual([]);
  });
});
