import { describe, expect, it } from 'vitest';
import { buildProgramma, nextShow, premioDi, type HomeMovie } from './programma';

const NOW = new Date('2026-10-26T10:00:00Z');
let id = 0;

/** Un film con spettacoli alle date date (ISO), con o senza trailer. */
function film(title: string, dates: string[], trailer = true, extra: Partial<HomeMovie> = {}): HomeMovie {
  const movieId = ++id;
  return {
    id: movieId,
    title,
    trailerKey: trailer ? `yt-${title}` : null,
    subevents: dates.map((date, i) => ({ id: movieId * 100 + i, date })),
    ...extra,
  };
}

const giorno = (d: number, h: number) => `2026-10-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00Z`;

describe('la regia della home', () => {
  it('non c\'è pagina senza spettacoli futuri', () => {
    expect(buildProgramma([film('Passato', ['2026-10-20T18:00:00Z'])], NOW)).toBeNull();
  });

  it('va dal film più vicino al più lontano, e ogni film compare una volta sola fra gli atti', () => {
    const movies = [
      film('Lontano', [giorno(31, 18)]),
      film('Primo', [giorno(26, 13), giorno(28, 18)]),
      film('Stasera', [giorno(26, 20)]),
      film('Pomeriggio', [giorno(26, 16)]),
      ...[27, 27, 28, 28, 29, 29, 30].map((d, i) => film(`Dopo${i}`, [giorno(d, 15 + i)])),
    ];
    const p = buildProgramma(movies, NOW)!;
    expect(p.primo.movie.title).toBe('Primo');
    // "Oggi" ha gli altri film del giorno: il primo si è appena visto nell'apertura.
    expect(p.oggi.map(s => s.movie.title)).toEqual(['Pomeriggio', 'Stasera']);
    expect(p.prossimi).toHaveLength(4);
    const atti = [p.primo, ...p.oggi, ...p.prossimi, ...(p.trailer ? [p.trailer.slot] : []), ...p.lontani].map(s => s.movie.title);
    expect(new Set(atti).size).toBe(atti.length);
    expect(atti).toHaveLength(movies.length);
    // L'ultimo dei lontani è il più lontano di tutti.
    expect(p.lontani[p.lontani.length - 1].movie.title).toBe('Lontano');
  });

  it('il trailer arriva dopo le locandine e salta i film senza trailer', () => {
    const movies = [
      film('A', [giorno(26, 13)]),
      film('B', [giorno(26, 16)]),
      ...[27, 27, 28, 28].map((d, i) => film(`P${i}`, [giorno(d, 10 + i)])),
      film('Muto', [giorno(29, 10)], false),
      film('T1', [giorno(29, 12)]),
      film('T2', [giorno(30, 12)]),
    ];
    const p = buildProgramma(movies, NOW)!;
    expect(['T1', 'T2']).toContain(p.trailer!.slot.movie.title);
    expect(p.lontani.map(s => s.movie.title)).toContain('Muto');
  });

  it('con pochi film il trailer si prende comunque, anche dal primo', () => {
    const p = buildProgramma([film('Solo', [giorno(26, 20)])], NOW)!;
    expect(p.oggi).toEqual([]);
    expect(p.trailer!.slot.movie.title).toBe('Solo');
  });

  it('"Oggi" non ha tetto: ci sono tutti i film del giorno, tranne il primo', () => {
    const p = buildProgramma([10, 12, 14, 16, 18, 20, 22].map(h => film(`Ore${h}`, [giorno(26, h)])), NOW)!;
    expect(p.oggi).toHaveLength(6);
    expect(p.oggi.map(s => s.movie.title)).not.toContain('Ore10');
  });

  it('in "Oggi" restano anche i film esauriti per quel giorno, e non tornano più avanti', () => {
    const pieno = film('Pieno', [giorno(26, 20), giorno(29, 20)]);
    pieno.subevents[0].isSoldOut = true;
    const p = buildProgramma([film('Primo', [giorno(26, 16)]), pieno, ...[27, 27, 28, 28, 30].map((d, i) => film(`D${i}`, [giorno(d, 10 + i)]))], NOW)!;
    expect(p.oggi.map(s => [s.movie.title, s.show.date])).toEqual([['Pieno', giorno(26, 20)]]);
    const dopo = [...p.prossimi, ...p.lontani, ...(p.trailer ? [p.trailer.slot] : [])].map(s => s.movie.title);
    expect(dopo).not.toContain('Pieno');
  });

  it('se il primo è l\'ultimo film della sera, "Oggi" prende tutti quelli del giorno dopo', () => {
    const p = buildProgramma([
      film('Sera', [giorno(26, 20)]),
      film('Mattina', [giorno(27, 10)]),
      film('Pranzo', [giorno(27, 13)]),
      film('Notte', [giorno(27, 21)]),
      film('Poi', [giorno(28, 20)]),
    ], NOW)!;
    expect(p.primo.movie.title).toBe('Sera');
    expect(p.oggi.map(s => s.movie.title)).toEqual(['Mattina', 'Pranzo', 'Notte']);
  });

  it('il film dell\'apertura non torna in "Oggi", nemmeno se si proietta anche il giorno dopo', () => {
    const p = buildProgramma([
      film('Sera', [giorno(26, 20), giorno(27, 18)]),
      film('Mattina', [giorno(27, 10)]),
      film('Notte', [giorno(27, 21)]),
    ], NOW)!;
    expect(p.oggi.map(s => s.movie.title)).toEqual(['Mattina', 'Notte']);
  });

  it('il programma intero ha tutti gli spettacoli, raggruppati per giorno di sala', () => {
    const p = buildProgramma([film('X', [giorno(26, 13), giorno(26, 20), giorno(27, 13)]), film('Y', [giorno(27, 18)])], NOW)!;
    expect(p.giorni.map(g => [g.dayKey, g.slots.length])).toEqual([['2026-10-26', 2], ['2026-10-27', 2]]);
  });

  it('il prossimo spettacolo salta gli esauriti, ma se lo sono tutti tiene il primo', () => {
    const m = film('E', [giorno(26, 13), giorno(26, 20)]);
    m.subevents[0].isSoldOut = true;
    expect(nextShow(m, NOW)!.date).toBe(giorno(26, 20));
    m.subevents[1].isSoldOut = true;
    expect(nextShow(m, NOW)!.date).toBe(giorno(26, 13));
  });

  it('sulla scheda va solo un premio vinto', () => {
    expect(premioDi(film('N', [], true, { awards: [{ type: 'cannes', year: 2023, details: 'Candidatura: Palma d\'oro' }] }))).toBeNull();
    expect(premioDi(film('V', [], true, { awards: [{ type: 'cannes', year: 1994, details: 'Vincitore: Palma d\'oro' }] }))!.prize).toBe('Palma d\'oro');
  });
});
