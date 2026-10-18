import { describe, it, expect } from 'vitest';
import { buildHomePlan, weighAward, PIECE_ORDER, HomeMovie, HomePiece, SUPREME_WEIGHT } from './regia';

// Domenica 18 ottobre 2026, ore 9 in sala (UTC+2).
const NOW = new Date('2026-10-18T07:00:00Z');
const at = (day: number, hhmm: string) => new Date(`2026-10-${day}T${hhmm}:00+02:00`).toISOString();

let nextShow = 1;
const mk = (id: number, shows: string[], opts: Partial<HomeMovie> = {}): HomeMovie => ({
  id,
  title: `Film ${id}`,
  overview: 'Breve.',
  poster_path: `/p${id}.jpg`,
  backdrop_path: `/b${id}.jpg`,
  logo_path: `/l${id}.png`,
  extraBackdrops: [`/x${id}a.jpg`, `/x${id}b.jpg`, `/x${id}c.jpg`],
  trailerKeys: [`yt${id}`],
  awards: [],
  subevents: shows.map(date => ({ id: nextShow++, date, language: 'Inglese', roomName: 'Ca Granda' })),
  ...opts,
});

const kinds = (plan: HomePiece[]) => plan.map(p => p.kind);
const piece = <K extends HomePiece['kind']>(plan: HomePiece[], k: K) => plan.find(p => p.kind === k) as Extract<HomePiece, { kind: K }> | undefined;

const settimana = (): HomeMovie[] => [
  mk(1, [at(18, '10:00')]),
  mk(2, [at(18, '12:00'), at(19, '21:00')], { awards: [{ type: 'cannes', year: 2024, details: "Vincitore: Palma d'oro" }] }),
  mk(3, [at(18, '14:30'), at(18, '17:00')], { awards: [{ type: 'venice', year: 2022, details: 'Vincitore: Silver Lion for Directing' }] }),
  mk(4, [at(19, '16:00')], { overview: 'x'.repeat(300), subevents: [{ id: 900, date: at(19, '16:00'), language: 'Francese' }] }),
  mk(5, [at(19, '18:30')]),
  mk(6, [at(20, '18:00')]),
  mk(7, [at(20, '21:00')]),
  mk(8, [at(21, '18:00')]),
  mk(9, [at(21, '21:00')]),
  mk(10, [at(22, '18:00')]),
  mk(11, [at(22, '21:00')]),
  mk(12, [at(23, '21:00')]),
  mk(13, [at(24, '21:00')]),
  mk(14, [at(24, '18:00')]),
];

describe('weighAward', () => {
  it('mette la Palma d\'oro sopra ogni altro premio', () => {
    const palma = weighAward({ type: 'cannes', year: 2024, details: "Vincitore: Palma d'oro" });
    const leone = weighAward({ type: 'venice', year: 2022, details: 'Vincitore: Silver Lion for Directing' });
    expect(palma.prize).toBe("Palma d'oro");
    expect(palma.weight).toBeGreaterThanOrEqual(SUPREME_WEIGHT);
    expect(leone.weight).toBeLessThan(SUPREME_WEIGHT);
  });

  it('vincere pesa più di una candidatura, e una candidatura più della selezione', () => {
    const vinto = weighAward({ type: 'bafta', details: 'Vincitore: Best Casting' });
    const candidato = weighAward({ type: 'bafta', details: 'Candidatura: Miglior film' });
    const selezione = weighAward({ type: 'bafta', details: 'Selezione Ufficiale' });
    expect(vinto.weight).toBeGreaterThan(candidato.weight);
    expect(candidato.weight).toBeGreaterThan(selezione.weight);
    expect(selezione.prize).toBe('Selezione ufficiale');
  });

  it('legge vinti e candidature nella stessa riga', () => {
    const a = weighAward({ type: 'oscar', details: 'Vincitore: Miglior film, Miglior regista · Candidatura: Miglior montaggio' });
    expect(a.won).toEqual(['Miglior film', 'Miglior regista']);
    expect(a.nominated).toEqual(['Miglior montaggio']);
    expect(a.prize).toBe('Miglior film');
  });

  it('"Miglior film in lingua straniera" non è il premio supremo', () => {
    expect(weighAward({ type: 'oscar', details: 'Vincitore: Miglior film in lingua straniera' }).weight).toBeLessThan(SUPREME_WEIGHT);
  });
});

describe('buildHomePlan', () => {
  it('segue l\'ordine scelto da Giovanni', () => {
    const plan = buildHomePlan(settimana(), NOW);
    const ks = kinds(plan);
    expect(ks).toEqual(PIECE_ORDER.filter(k => ks.includes(k)));
    expect(ks[0]).toBe('apertura');
    expect(ks[ks.length - 1]).toBe('settimana');
  });

  it('apre col primo spettacolo non ancora iniziato', () => {
    const plan = buildHomePlan(settimana(), new Date('2026-10-18T08:30:00Z')); // 10:30 in sala
    expect(piece(plan, 'apertura')!.movie.id).toBe(2);
  });

  it('l\'apertura gira sui prossimi film diversi, senza gli esauriti', () => {
    const films = settimana().map(m => m.id === 3 ? { ...m, subevents: m.subevents.map(s => ({ ...s, isSoldOut: true })) } : m);
    const giro = piece(buildHomePlan(films, NOW), 'apertura')!.giro;
    expect(giro[0].movie.id).toBe(1);
    expect(giro.map(s => s.movie.id)).toEqual([1, 2, 4, 5, 6, 7]);
    expect(new Set(giro.map(s => s.movie.id)).size).toBe(giro.length);
  });

  it('il primo del giro resta il primo spettacolo, anche se è esaurito', () => {
    const films = settimana().map(m => m.id === 1 ? { ...m, subevents: m.subevents.map(s => ({ ...s, isSoldOut: true })) } : m);
    const giro = piece(buildHomePlan(films, NOW), 'apertura')!.giro;
    expect(giro[0].movie.id).toBe(1);
    expect(giro.slice(1).every(s => !s.show.isSoldOut)).toBe(true);
  });

  it('il nastro e il cartellone mostrano tutti i film, in ordine di arrivo', () => {
    const plan = buildHomePlan(settimana(), NOW);
    const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 13]; // il 14 arriva alle 18, il 13 alle 21
    expect(piece(plan, 'cartellone')!.movies.map(m => m.id)).toEqual(ids);
    expect(piece(plan, 'nastro')!.movies.map(m => m.id)).toEqual(ids);
  });

  it('"oggi" elenca gli spettacoli del primo giorno, in ordine', () => {
    const oggi = piece(buildHomePlan(settimana(), NOW), 'oggi')!;
    expect(oggi.dayKey).toBe('2026-10-18');
    expect(oggi.slots.map(s => s.movie.id)).toEqual([1, 2, 3, 3]);
  });

  it('la pagina d\'onore va alla Palma d\'oro, e la parete non la ripete', () => {
    const plan = buildHomePlan(settimana(), NOW);
    expect(piece(plan, 'onore')!.movie.id).toBe(2);
    const parete = piece(plan, 'parete')!;
    expect(parete.items.map(i => i.movie.id)).toEqual([3]);
  });

  it('senza un premio supremo non c\'è pagina d\'onore', () => {
    const films = settimana().map(m => m.id === 2 ? { ...m, awards: [] } : m);
    expect(kinds(buildHomePlan(films, NOW))).not.toContain('onore');
  });

  it('la pellicola prende tre film con almeno 4 fondali', () => {
    const films = settimana().map(m => m.id % 2 ? { ...m, extraBackdrops: [] } : m);
    const pellicola = piece(buildHomePlan(films, NOW), 'pellicola')!;
    expect(pellicola.movies).toHaveLength(3);
    pellicola.movies.forEach(m => expect(m.id % 2).toBe(0));
  });

  it('i pezzi dei prossimi film non ripetono un film quando ce ne sono abbastanza', () => {
    const plan = buildHomePlan(settimana(), NOW);
    const ids = plan.flatMap(p => {
      switch (p.kind) {
        case 'pellicola': return p.movies.map(m => m.id);
        case 'locandina': case 'barre': case 'iride': case 'trailer': case 'sottotitoli': return [p.movie.id];
        case 'doppio': return [p.a.movie.id, p.b.movie.id];
        default: return [];
      }
    });
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('il doppio programma mette insieme due film dello stesso giorno', () => {
    const doppio = piece(buildHomePlan(settimana(), NOW), 'doppio')!;
    expect(doppio.a.movie.id).not.toBe(doppio.b.movie.id);
    expect(doppio.a.show.date.slice(0, 10)).toBe(doppio.b.show.date.slice(0, 10));
  });

  it('i sottotitoli preferiscono una sinossi lunga in lingua straniera', () => {
    expect(piece(buildHomePlan(settimana(), NOW), 'sottotitoli')!.movie.id).toBe(4);
  });

  it('stesso giorno, stessa pagina', () => {
    const films = settimana();
    expect(JSON.stringify(buildHomePlan(films, NOW))).toBe(JSON.stringify(buildHomePlan(films, NOW)));
  });

  it('salta un pezzo che non ha un film adatto', () => {
    const films = settimana().map(m => ({ ...m, trailerKeys: [], trailerKey: undefined }));
    expect(kinds(buildHomePlan(films, NOW))).not.toContain('trailer');
  });

  it('senza spettacoli futuri la pagina è vuota', () => {
    expect(buildHomePlan(settimana(), new Date('2026-11-01T00:00:00Z'))).toEqual([]);
  });

  it('la settimana contiene ogni spettacolo futuro, giorno per giorno', () => {
    const plan = buildHomePlan(settimana(), NOW);
    const sett = piece(plan, 'settimana')!;
    const totale = settimana().reduce((n, m) => n + m.subevents.length, 0);
    expect(sett.days.reduce((n, d) => n + d.slots.length, 0)).toBe(totale);
    expect(sett.days.map(d => d.dayKey)).toEqual([...sett.days.map(d => d.dayKey)].sort());
  });
});
