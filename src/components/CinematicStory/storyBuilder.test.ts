import { describe, it, expect } from 'vitest';
import { buildFestivalGroups, buildMood, buildSoireeHook, buildSoirees, buildStory, buildWeekend, excerptOverview, PHONE_LIMITS, StoryChapter, trimChaptersForPhone } from './storyBuilder';
import type { GroupedMovie } from '../MovieShowcase/MovieShowcase';

type MarqueeChapter = Extract<StoryChapter, { kind: 'marquee' }>;
type QuoteChapter = Extract<StoryChapter, { kind: 'quote' }>;
type StripesChapter = Extract<StoryChapter, { kind: 'stripes' }>;
type StatsChapter = Extract<StoryChapter, { kind: 'stats' }>;
type LogosChapter = Extract<StoryChapter, { kind: 'logos' }>;
type FestivalChapterT = Extract<StoryChapter, { kind: 'festival' }>;
type MosaicChapter = Extract<StoryChapter, { kind: 'mosaic' }>;
type RevealChapter = Extract<StoryChapter, { kind: 'reveal' }>;

const mk = (id: number, opts: Partial<GroupedMovie> = {}): GroupedMovie => ({
  id,
  title: `Film ${id}`,
  overview: '',
  poster_path: `/p${id}.jpg`,
  backdrop_path: `/b${id}.jpg`,
  logo_path: `/l${id}.png`,
  release_date: '2026-01-01',
  runtime: 120,
  subevents: [{}, {}],
  awards: [],
  genres: ['Dramma'],
  tagline: `Slogan ${id}`,
  extraBackdrops: [`/x${id}a.jpg`, `/x${id}b.jpg`],
  ...opts,
});

const kinds = (chapters: StoryChapter[]) => chapters.map(c => c.kind);

describe('excerptOverview', () => {
  it('prende la prima frase se breve', () => {
    expect(excerptOverview('Una storia epica. E poi altro ancora.')).toBe('Una storia epica.');
  });

  it('tronca a parola intera con ellissi se lunga', () => {
    const long = `${'parola '.repeat(40)}fine.`;
    const result = excerptOverview(long, 50);
    expect(result.length).toBeLessThanOrEqual(51);
    expect(result.endsWith('…')).toBe(true);
    expect(result).not.toContain('  ');
  });

  it('gestisce testo vuoto', () => {
    expect(excerptOverview('')).toBe('');
  });
});

describe('buildWeekend', () => {
  // 2026-07-18 è un sabato; in luglio Roma è UTC+2.
  const wednesday = new Date('2026-07-15T10:00:00Z');

  it('raggruppa solo sabato e domenica, deduplica gli orari identici e ordina', () => {
    const movies = [
      mk(1, {
        subevents: [
          { date: '2026-07-18T19:00:00.000Z', isSoldOut: false, roomName: 'Sala 1' },
          { date: '2026-07-18T19:00:00.000Z', isSoldOut: true, roomName: 'Sala 1' }, // duplicato identico
          { date: '2026-07-19T16:00:00.000Z', isSoldOut: true },
        ],
      }),
      mk(2, {
        subevents: [
          { date: '2026-07-17T19:00:00.000Z' }, // venerdì: escluso dal weekend
          { date: '2026-07-20T19:00:00.000Z' }, // lunedì: fuori dal weekend
        ],
      }),
    ];
    const days = buildWeekend(movies, wednesday);

    expect(days.map(d => d.label)).toEqual(['Sabato', 'Domenica']);
    expect(days.map(d => d.isoDate)).toEqual(['2026-07-18', '2026-07-19']);

    // sabato: un solo chip 21:00 (Roma), prenotabile perché una copia lo è
    expect(days[0].shows).toHaveLength(1);
    expect(days[0].shows[0].times).toEqual([{ time: '21:00', isSoldOut: false, roomName: 'Sala 1' }]);

    // domenica 18:00 sold out; il film 2 (solo venerdì/lunedì) non compare
    expect(days[1].shows[0].times[0]).toEqual({ time: '18:00', isSoldOut: true, roomName: undefined });
    expect(days.flatMap(d => d.shows.map(s => s.movie.id))).not.toContain(2);
  });

  it('a weekend iniziato usa il sabato corrente e omette i giorni vuoti', () => {
    const sunday = new Date('2026-07-19T10:00:00Z');
    const movies = [mk(1, { subevents: [{ date: '2026-07-19T14:30:00.000Z' }] })];
    const days = buildWeekend(movies, sunday);
    expect(days.map(d => d.label)).toEqual(['Domenica']);
  });

  it('ordina i film del giorno per primo orario', () => {
    const movies = [
      mk(1, { subevents: [{ date: '2026-07-18T20:00:00.000Z' }] }), // 22:00
      mk(2, { subevents: [{ date: '2026-07-18T15:00:00.000Z' }] }), // 17:00
    ];
    const days = buildWeekend(movies, wednesday);
    expect(days[0].shows.map(s => s.movie.id)).toEqual([2, 1]);
  });

  it('senza proiezioni sabato o domenica non produce giorni', () => {
    expect(buildWeekend([mk(1, { subevents: [{ date: '2026-07-21T19:00:00.000Z' }] })], wednesday)).toEqual([]);
    // il venerdì da solo non basta più a creare il weekend
    expect(buildWeekend([mk(1, { subevents: [{ date: '2026-07-17T19:00:00.000Z' }] })], wednesday)).toEqual([]);
    expect(buildWeekend([mk(1, { subevents: [{}] })], wednesday)).toEqual([]);
  });
});

describe('buildSoirees', () => {
  // Mercoledì 15 luglio 2026, Roma UTC+2.
  const wednesday = new Date('2026-07-15T10:00:00Z');

  it('raccoglie le sere di oggi/domani/dopodomani con le etichette giuste', () => {
    const movies = [
      mk(1, { subevents: [{ date: '2026-07-15T19:00:00.000Z' }] }), // stasera 21:00
      mk(2, { subevents: [{ date: '2026-07-16T18:30:00.000Z' }] }), // domani 20:30
      mk(3, { subevents: [{ date: '2026-07-17T19:15:00.000Z' }] }), // dopodomani 21:15
    ];
    const items = buildSoirees(movies, wednesday);

    expect(items.map(i => i.dayLabel)).toEqual(['Stasera', 'Domani sera', 'Dopodomani sera']);
    expect(items[0].dateLabel).toBe('');
    expect(items[1].dateLabel).toContain('16');
    expect(items.map(i => i.times[0].time)).toEqual(['21:00', '20:30', '21:15']);
  });

  it('esclude le proiezioni pomeridiane (prima delle 17) e i giorni oltre dopodomani', () => {
    const movies = [
      mk(1, { subevents: [{ date: '2026-07-15T13:00:00.000Z' }] }), // 15:00 Roma: pomeriggio
      mk(2, { subevents: [{ date: '2026-07-15T15:00:00.000Z' }] }), // 17:00 Roma: entra
      mk(3, { subevents: [{ date: '2026-07-18T19:00:00.000Z' }] }), // fra tre giorni: fuori
    ];
    const items = buildSoirees(movies, wednesday);
    expect(items.map(i => i.movie.id)).toEqual([2]);
    expect(items[0].times[0].time).toBe('17:00');
  });

  it('ordina la sera per premi e voto e tiene al massimo 3 film', () => {
    const evening = (id: number, opts: Partial<GroupedMovie> = {}) =>
      mk(id, { subevents: [{ date: `2026-07-15T${18 + (id % 3)}:00:00.000Z` }], awards: [], ...opts });
    const movies = [
      evening(1, { voteAverage: 6.1 }),
      evening(2, { awards: [{}], voteAverage: 5.0 }),
      evening(3, { voteAverage: 8.4 }),
      evening(4, { voteAverage: 7.2 }),
    ];
    const items = buildSoirees(movies, wednesday);
    // Il premiato vince, poi i voti più alti; il quarto resta fuori.
    expect(items.map(i => i.movie.id)).toEqual([2, 3, 4]);
  });

  it('unifica gli orari duplicati restando prenotabile se una copia lo è', () => {
    const movies = [
      mk(1, {
        subevents: [
          { date: '2026-07-15T19:00:00.000Z', isSoldOut: true },
          { date: '2026-07-15T19:00:00.000Z', isSoldOut: false },
          { date: '2026-07-15T21:00:00.000Z', isSoldOut: true },
        ],
      }),
    ];
    const items = buildSoirees(movies, wednesday);
    expect(items).toHaveLength(1);
    expect(items[0].times).toEqual([
      { time: '21:00', isSoldOut: false },
      { time: '23:00', isSoldOut: true },
    ]);
  });
});

describe('buildSoireeHook', () => {
  const now = new Date('2026-07-15T10:00:00Z');

  it('il premio vinto batte tutto e cita il festival declinato', () => {
    const movie = mk(1, {
      release_date: '1972-05-10', // sarebbe un classico, ma il premio vince
      awards: [{ type: 'cannes', details: "Vincitore: Palma d'Oro", year: 2024 }],
    });
    expect(buildSoireeHook(movie, [], now)).toBe("Palma d'Oro a Cannes · 2024");
  });

  it('la candidatura viene dopo il premio e prima del resto', () => {
    const movie = mk(1, { awards: [{ type: 'oscar', details: 'Candidatura: Miglior film', year: 2025 }] });
    expect(buildSoireeHook(movie, [], now)).toBe('Candidato agli Oscar · 2025');
  });

  it('un festival non riconosciuto non produce frasi sbagliate', () => {
    const movie = mk(1, { awards: [{ type: 'sundance', details: 'Vincitore: Gran Premio', year: 2024 }] });
    // niente fallback Oscar: si passa alla regola successiva (genere · durata)
    expect(buildSoireeHook(movie, [], now)).toBe('Dramma · 2h');
  });

  it('riconosce il classico che torna in sala', () => {
    const movie = mk(1, { release_date: '1972-05-10' });
    expect(buildSoireeHook(movie, [], now)).toBe('Il classico del 1972 torna sul grande schermo');
  });

  it('estrae formato speciale e lingua originale dalle proiezioni della sera', () => {
    expect(buildSoireeHook(mk(1), [{ format: '35mm' }], now)).toBe('Proiezione in 35mm');
    expect(buildSoireeHook(mk(1), [{ language: 'Inglese', subtitles: 'Italiano' }], now))
      .toBe('In lingua originale, sottotitolato in italiano');
    expect(buildSoireeHook(mk(1), [{ language: 'Inglese' }], now)).toBe('In lingua originale');
    // l'italiano non è "lingua originale" da annunciare
    expect(buildSoireeHook(mk(1), [{ language: 'Italiano' }], now)).toBe('Dramma · 2h');
  });

  it('voto mondiale, cast e regia in coda, con la durata come ultima risorsa', () => {
    expect(buildSoireeHook(mk(1, { voteAverage: 8.4 }), [], now))
      .toBe('Voto 8,4 su 10 per il pubblico mondiale');
    expect(buildSoireeHook(mk(1, { cast: ['Timothée Chalamet', 'Zendaya'] }), [], now))
      .toBe('Con Timothée Chalamet e Zendaya');
    expect(buildSoireeHook(mk(1, { director: 'Denis Villeneuve' }), [], now))
      .toBe('La regia di Denis Villeneuve');
    expect(buildSoireeHook(mk(1), [], now)).toBe('Dramma · 2h');
  });

  it('buildSoirees assegna il gancio a ogni serata', () => {
    const movies = [
      mk(1, {
        awards: [{ type: 'venice', details: "Vincitore: Leone d'Oro", year: 2023 }],
        subevents: [{ date: '2026-07-15T19:00:00.000Z' }],
      }),
    ];
    const items = buildSoirees(movies, now);
    expect(items[0].hook).toBe("Leone d'Oro a Venezia · 2023");
  });
});

describe('buildMood', () => {
  it('sceglie il genere dominante pesato sulle proiezioni, non sui film', () => {
    const movies = [
      mk(1, { genres: ['Dramma'], subevents: [{}] }),
      mk(2, { genres: ['Horror'], subevents: [{}, {}, {}] }),
    ];
    expect(buildMood(movies)).toEqual({ genre: 'Horror', accent: '#e05a5a' });
  });

  it('usa la tinta di riserva per generi sconosciuti o cataloghi vuoti', () => {
    const sconosciuto = buildMood([mk(1, { genres: ['Sperimentale'] })]);
    expect(sconosciuto.genre).toBe('Sperimentale');
    expect(sconosciuto.accent).toBe('#e8b45a');

    expect(buildMood([])).toEqual({ genre: null, accent: '#e8b45a' });
  });
});

describe('buildStory', () => {
  it('senza film non produce capitoli', () => {
    expect(buildStory([])).toEqual([]);
  });

  it('con 5 film completi produce la sequenza ricca', () => {
    const movies = [mk(1), mk(2), mk(3), mk(4), mk(5)];
    const chapters = buildStory(movies);
    expect(kinds(chapters)).toEqual([
      'quote', 'stripes', 'stats', 'logos', 'calendar',
      'stripes', 'mosaic', 'marquee', 'quote',
    ]);

    const opening = chapters[0] as QuoteChapter;
    const stripes = chapters[1] as StripesChapter;
    const logos = chapters[3] as LogosChapter;
    const closing = chapters[chapters.length - 1] as QuoteChapter;
    expect(opening.movie.id).toBe(1);
    expect(opening.text).toBe('Slogan 1');
    expect(stripes.movies.map(m => m.id)).toEqual([2, 3, 4]);
    expect(stripes.backdropIndex).toBe(0);
    expect(logos.movies).toHaveLength(5);
    // Chiusura: nessun film libero rimasto → primo film con frase diverso dall'apertura.
    expect(closing.movie.id).toBe(2);
  });

  it('con 6 film il reveal assorbe i film residui; con 12 restano anche le strisce B', () => {
    const sei = buildStory([mk(1), mk(2), mk(3), mk(4), mk(5), mk(6)]);
    const reveal = sei.find(c => c.kind === 'reveal') as RevealChapter;
    expect(reveal.movies.map(m => m.id)).toEqual([5, 6]);
    expect(sei.filter(c => c.kind === 'stripes')).toHaveLength(1);

    const dodici = buildStory(Array.from({ length: 12 }, (_, i) => mk(i + 1)));
    const reveal12 = dodici.find(c => c.kind === 'reveal') as RevealChapter;
    expect(reveal12.movies.map(m => m.id)).toEqual([5, 6, 7, 8]);
    const stripeChapters = dodici.filter(c => c.kind === 'stripes') as StripesChapter[];
    expect(stripeChapters).toHaveLength(2);
    expect(stripeChapters[1].movies.map(m => m.id)).toEqual([9, 10, 11]);
    expect(stripeChapters[1].backdropIndex).toBe(1);
  });

  it('il reveal sta subito prima del calendario e serve almeno 2 film con visual', () => {
    const k = kinds(buildStory(Array.from({ length: 8 }, (_, i) => mk(i + 1))));
    expect(k.indexOf('reveal')).toBe(k.indexOf('calendar') - 1);

    // Con 5 film resta un solo candidato → capitolo omesso.
    expect(kinds(buildStory([mk(1), mk(2), mk(3), mk(4), mk(5)]))).not.toContain('reveal');
  });

  it('calcola le statistiche della programmazione', () => {
    const movies = [
      mk(1, { runtime: 120, awards: [{}, {}], genres: ['Dramma', 'Storia'], subevents: [{}, {}, {}] }),
      mk(2, { runtime: 90, awards: [{}], genres: ['Commedia'], subevents: [{}] }),
    ];
    const stats = (buildStory(movies).find(c => c.kind === 'stats') as StatsChapter).stats;
    expect(stats).toEqual({
      filmCount: 2,
      totalHours: 4,
      awardsCount: 3,
      projectionsCount: 4,
      genresCount: 3,
    });
  });

  it('la citazione usa la tagline se presente, altrimenti la trama', () => {
    const overview = 'Una lunga storia di mare e di vento che attraversa tre generazioni di pescatori sulle isole Orcadi.';
    const conTagline = buildStory([mk(1), mk(2), mk(3)])[0] as QuoteChapter;
    expect(conTagline.text).toBe('Slogan 1');

    const senzaTagline = buildStory([mk(1, { tagline: '', overview }), mk(2), mk(3)])[0] as QuoteChapter;
    expect(senzaTagline.movie.id).toBe(1);
    expect(senzaTagline.text).toContain('Una lunga storia');
  });

  it('crea il capitolo festival dopo il calendario solo se ci sono premiati', () => {
    const senza = kinds(buildStory([mk(1), mk(2), mk(3)]));
    expect(senza).not.toContain('festival');

    const movies = [mk(1, { awards: [{ type: 'cannes', label: "Palma d'Oro", year: 2024 }] }), mk(2), mk(3)];
    const k = kinds(buildStory(movies));
    expect(k.indexOf('festival')).toBe(k.indexOf('calendar') + 1);

    const festival = buildStory(movies).find(c => c.kind === 'festival') as FestivalChapterT;
    expect(festival.groups[0].festival.key).toBe('cannes');
    expect(festival.groups[0].films[0].movie.id).toBe(1);
  });

  it('con seed la rotazione è deterministica ma varia tra i refresh', () => {
    const now = new Date('2026-07-15T10:00:00Z');
    const movies = Array.from({ length: 8 }, (_, i) => mk(i + 1));

    const a = buildStory(movies, now, 12345);
    const b = buildStory(movies, now, 12345);
    expect((a[0] as QuoteChapter).movie.id).toBe((b[0] as QuoteChapter).movie.id);
    expect(kinds(a)).toEqual(kinds(b));

    const firstIds = new Set(
      [1, 2, 3, 4, 5, 6].map(seed => (buildStory(movies, now, seed)[0] as QuoteChapter).movie.id)
    );
    expect(firstIds.size).toBeGreaterThan(1);
  });

  it('con cataloghi grandi applica i tetti: 12 loghi, 12 mosaico, 16 marquee', () => {
    const now = new Date('2026-07-15T10:00:00Z');
    const movies = Array.from({ length: 20 }, (_, i) => mk(i + 1));
    const chapters = buildStory(movies, now, 42);
    expect((chapters.find(c => c.kind === 'logos') as LogosChapter).movies).toHaveLength(12);
    expect((chapters.find(c => c.kind === 'mosaic') as MosaicChapter).movies).toHaveLength(12);
    expect((chapters.find(c => c.kind === 'marquee') as MarqueeChapter).movies).toHaveLength(16);
  });

  it('chiude con la frase di un film, preferendo i premiati (niente messaggi commerciali)', () => {
    // 14 film: apertura (1), strisce A (2-4), reveal (5-8), strisce B (9-11):
    // il premiato n.14 resta libero e vince la chiusura.
    const movies = Array.from({ length: 14 }, (_, i) => mk(i + 1, i === 13 ? { awards: [{}] } : {}));
    const chapters = buildStory(movies);
    const last = chapters[chapters.length - 1] as QuoteChapter;
    expect(last.kind).toBe('quote');
    expect(last.movie.id).toBe(14);
  });

  it('salta loghi e marquee quando i film sono pochi', () => {
    const movies = [mk(1), mk(2, { logo_path: null }), mk(3)];
    const chapters = buildStory(movies);
    expect(kinds(chapters)).not.toContain('logos');
    expect(kinds(chapters)).not.toContain('marquee');
    expect(kinds(chapters)).toContain('mosaic');
  });

  it('con un solo film resta una sequenza minima senza capitoli vuoti', () => {
    const chapters = buildStory([mk(1)]);
    expect(kinds(chapters)).toEqual(['quote', 'stats', 'calendar']);
  });

  it('film senza tagline né trama non generano citazioni', () => {
    const movies = [mk(1, { tagline: '' }), mk(2, { tagline: undefined }), mk(3, { tagline: '  ' })];
    const chapters = buildStory(movies);
    expect(kinds(chapters)).not.toContain('quote');
    const stripes = chapters.find(c => c.kind === 'stripes') as StripesChapter;
    expect(stripes.movies).toHaveLength(3);
  });

  it('il mosaico esclude i film senza poster e richiede almeno 3 poster', () => {
    const conMosaico = buildStory([mk(1), mk(2), mk(3), mk(4, { poster_path: null })]);
    const mosaic = conMosaico.find(c => c.kind === 'mosaic') as MosaicChapter;
    expect(mosaic.movies).toHaveLength(3);

    const senzaMosaico = buildStory([mk(1), mk(2, { poster_path: null }), mk(3, { poster_path: null })]);
    expect(kinds(senzaMosaico)).not.toContain('mosaic');
  });

  it('inserisce il capitolo weekend subito prima del calendario', () => {
    const now = new Date('2026-07-15T10:00:00Z');
    const movies = [mk(1, { subevents: [{ date: '2026-07-18T19:00:00.000Z' }] }), mk(2), mk(3)];
    const k = kinds(buildStory(movies, now));
    expect(k).toContain('weekend');
    expect(k.indexOf('weekend')).toBe(k.indexOf('calendar') - 1);

    // senza proiezioni weekend il capitolo sparisce
    const senza = kinds(buildStory([mk(1), mk(2), mk(3)], now));
    expect(senza).not.toContain('weekend');
  });

  it('apre con il carosello delle serate quando ci sono almeno 2 serate in arrivo', () => {
    const now = new Date('2026-07-15T10:00:00Z');
    const movies = [
      mk(1, { subevents: [{ date: '2026-07-15T19:00:00.000Z' }] }),
      mk(2, { subevents: [{ date: '2026-07-16T19:00:00.000Z' }] }),
      mk(3),
    ];
    const chapters = buildStory(movies, now);
    expect(chapters[0].kind).toBe('soirees');
    const soirees = chapters[0] as Extract<StoryChapter, { kind: 'soirees' }>;
    expect(soirees.items).toHaveLength(2);

    // Con il carosello in apertura la citazione resta solo in chiusura.
    expect(kinds(chapters).filter(k => k === 'quote')).toHaveLength(1);

    // Con una sola serata si torna alla citazione d'apertura.
    const una = buildStory([mk(1, { subevents: [{ date: '2026-07-15T19:00:00.000Z' }] }), mk(2)], now);
    expect(una[0].kind).toBe('quote');
  });

  it('film senza alcun backdrop non entrano nelle strisce', () => {
    const movies = [mk(1), mk(2, { backdrop_path: null, extraBackdrops: [] }), mk(3)];
    const chapters = buildStory(movies);
    const stripes = chapters.find(c => c.kind === 'stripes') as StripesChapter;
    expect(stripes.movies.map(m => m.id)).toEqual([3]);
  });
});

describe('buildFestivalGroups', () => {
  it('tiene solo i festival della whitelist homepage (Cannes, Oscar, Venezia, David)', () => {
    const movies = [
      mk(1, { awards: [{ type: 'cannes', label: 'Festival de Cannes', details: "Vincitore: Palma d'Oro", year: 2024 }] }),
      mk(2, { awards: [{ type: 'berlin', label: 'Berlinale', details: "Vincitore: Orso d'Oro", year: 2023 }] }),
      mk(3, { awards: [{ type: 'toronto', label: 'TIFF', details: 'Selezione Ufficiale', year: 2022 }] }),
      mk(4, { awards: [{ type: 'davids', label: 'David di Donatello', details: 'Vincitore: Miglior film', year: 2025 }] }),
    ];
    const groups = buildFestivalGroups(movies);
    expect(groups.map(g => g.festival.key).sort()).toEqual(['cannes', 'davids']);
  });

  it('ordina per numero di film e poi per prestigio', () => {
    const movies = [
      mk(1, { awards: [
        { type: 'venice', label: 'Mostra', details: "Vincitore: Leone d'Oro", year: 2020 },
        { type: 'cannes', label: 'Cannes', details: 'Selezione Ufficiale', year: 2020 },
      ] }),
      mk(2, { awards: [{ type: 'venice', label: 'Mostra', details: 'Selezione Ufficiale', year: 2021 }] }),
      mk(3, { awards: [{ type: 'davids', label: 'David', details: 'Vincitore: Miglior film', year: 2022 }] }),
      mk(4, { awards: [{ type: 'oscar', label: 'Oscar', details: 'Candidatura: Miglior film', year: 2023 }] }),
    ];
    const groups = buildFestivalGroups(movies);
    expect(groups.map(g => g.festival.key)).toEqual(['venice', 'cannes', 'oscar', 'davids']);
  });

  it('sotto il poster va il premio parsato dai details, non il nome del festival', () => {
    const movies = [
      mk(1, { awards: [{ type: 'cannes', label: 'Festival de Cannes', details: "Vincitore: Palma d'Oro, Prix du Jury", year: 2024 }] }),
      mk(2, { awards: [{ type: 'cannes', label: 'Festival de Cannes', details: "Candidatura: Palma d'Oro", year: 2019 }] }),
      mk(3, { awards: [{ type: 'cannes', label: 'Festival de Cannes', details: 'Selezione Ufficiale', year: 2007 }] }),
      mk(4, { awards: [{ type: 'cannes', label: 'Festival de Cannes', year: 2001 }] }),
    ];
    const films = buildFestivalGroups(movies)[0].films;
    expect(films[0].awardLabel).toBe("Palma d'Oro · 2024");
    expect(films[1].awardLabel).toBe("Candidatura: Palma d'Oro · 2019");
    expect(films[2].awardLabel).toBe('Selezione Ufficiale · 2007');
    expect(films[3].awardLabel).toBe('2001');
  });

  it('con più riconoscimenti allo stesso festival vince il Vincitore sulla Selezione', () => {
    const movies = [
      mk(1, { awards: [
        { type: 'venice', label: 'Mostra', details: 'Selezione Ufficiale', year: 2016 },
        { type: 'venice', label: 'Mostra', details: "Vincitore: Leone d'Oro", year: 2016 },
      ] }),
    ];
    expect(buildFestivalGroups(movies)[0].films[0].awardLabel).toBe("Leone d'Oro · 2016");
  });

  it('senza premi non produce gruppi', () => {
    expect(buildFestivalGroups([mk(1), mk(2)])).toEqual([]);
  });
});

describe('trimChaptersForPhone', () => {
  const many = Array.from({ length: 16 }, (_, i) => mk(i + 1, { tagline: `Voce ${i + 1}` }));

  it('taglia le sezioni collettive ai limiti del telefono', () => {
    const trimmed = trimChaptersForPhone([
      { kind: 'logos', movies: many },
      { kind: 'mosaic', movies: many },
      { kind: 'marquee', movies: many },
      { kind: 'reveal', movies: many },
      { kind: 'stripes', movies: many, backdropIndex: 0 },
    ]);

    const sizes = trimmed.map(c => (c as { movies: unknown[] }).movies.length);
    expect(sizes).toEqual([
      PHONE_LIMITS.logos,
      PHONE_LIMITS.mosaic,
      PHONE_LIMITS.marquee,
      PHONE_LIMITS.reveal,
      PHONE_LIMITS.stripes,
    ]);
  });

  it('lascia intatti i capitoli senza elenchi di film', () => {
    const calendar: StoryChapter = { kind: 'calendar' };
    const quote: StoryChapter = { kind: 'quote', movie: mk(1), text: 'Una voce' };
    expect(trimChaptersForPhone([calendar, quote])).toEqual([calendar, quote]);
  });

  it('conserva gli altri campi del capitolo strisce', () => {
    const [chapter] = trimChaptersForPhone([{ kind: 'stripes', movies: many, backdropIndex: 2 }]);
    expect((chapter as StripesChapter).backdropIndex).toBe(2);
  });

  it('non allunga i capitoli già corti', () => {
    const short = [mk(1), mk(2)];
    const [chapter] = trimChaptersForPhone([{ kind: 'mosaic', movies: short }]);
    expect((chapter as MosaicChapter).movies).toHaveLength(2);
  });
});
