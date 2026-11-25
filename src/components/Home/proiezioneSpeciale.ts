import { formatInTimeZone } from 'date-fns-tz';
import { it } from 'date-fns/locale';
import { CINEMA_TIMEZONE, formatShowTime, toCinemaDayKey } from '@/utils/cinemaDate';
import type { HomeMovie } from './programma';

/**
 * Le proiezioni speciali: un film che, finché ha spettacoli in programma, apre
 * la home con una pagina sua (Speciale.tsx) invece di stare in fila con gli
 * altri. Finito l'ultimo spettacolo la home torna com'era, da sola.
 *
 * La prima, chiesta da Giovanni il 25 novembre 2026: You Can See Everything in
 * sala A24, due spettacoli al giorno fino all'8 dicembre.
 */
export interface Citazione {
  testo: string;
  /** La testata, scritta come la scrive lei ("RogerEbert.com", "la Repubblica"). */
  fonte: string;
  /** Il fotogramma su cui sta la citazione (TMDB, o caricato). */
  fondale: string;
  /** Chi l'ha scritta, se il trailer lo dice ("Sean Fennessey"). */
  critico?: string;
}

/**
 * Il carattere delle citazioni, il più simile a quello del trailer, scelto
 * fra quelli di Google Fonts da `scripts/critica-dal-trailer.mjs`. Il file
 * (woff2) sta sul sito: nessuna richiesta a Google da chi guarda la home.
 */
export interface Carattere {
  famiglia: string;
  peso: number;
  src: string;
}

/** Un'immagine del materiale del distributore, in `public/`. */
export interface Immagine {
  src: string;
  w: number;
  h: number;
}

/**
 * Dove stava, nell'immagine, il riquadro con le date del distributore
 * (in percentuale): l'abbiamo cancellato, e lì il sito scrive le date del
 * cinema. `riquadro: false` = solo testo, senza cornice (la locandina).
 */
export interface Posto {
  x: number;
  y: number;
  w: number;
  h: number;
  riquadro: boolean;
}

export interface FotoDiScena extends Immagine {
  /** Chi c'è, com'è scritto nelle didascalie ufficiali. */
  chi?: string;
  credito?: string;
}

/**
 * Il materiale del distributore (I Wonder Pictures), cartella YCSE: banner,
 * locandina e trailer verticale con le date dell'anteprima nazionale (27-28-29
 * novembre) cancellate, e le foto di scena. Gli intermezzi fra gli atti.
 */
export interface Materiale {
  /** Con uno solo dei due, quello vale per schermo grande e telefono. */
  banner?: { orizzontale?: ConDate; verticale?: ConDate };
  locandina?: ConDate;
  /** Muto, a ciclo; finisce sul titolo, prima del cartello con le date. */
  trailerVerticale?: { src: string; poster: string };
  foto?: FotoDiScena[];
}

/** Un'immagine su cui il sito scrive le date del cinema; senza `date`, niente scritta. */
export type ConDate = Immagine & { date?: Posto };

export interface ProiezioneSpeciale {
  tmdbId: number;
  /** Il primo giorno della rassegna (AAAA-MM-GG): il sito riceve solo gli spettacoli futuri. */
  inizio: string;
  /** La riga piccola sopra il titolo. */
  sopra: string;
  /** La casa che firma il film: nome e logo TMDB (nero su trasparente, si accende in bianco). */
  casa: { nome: string; logo: string };
  /** Il fotogramma della pagina d'apertura. */
  fondale: string;
  citazioni: Citazione[];
  /** Senza, le citazioni usano il carattere del sito. */
  carattere?: Carattere;
  materiale?: Materiale;
}

const YCSE = '/speciali/ycse';

/**
 * La prima, com'era scritta qui prima della stanza Speciale: ora sta nel
 * database (la home legge da lì). Resta per le prove e come esempio.
 */
export const SPECIALI: ProiezioneSpeciale[] = [
  {
    tmdbId: 1765072,
    inizio: '2026-11-25',
    sopra: 'Un documentario di Nathan Fielder e Lance Oppenheim',
    casa: { nome: 'A24', logo: '/1ZXsGaFPgrgS6ZZGS37AqD5uU12.png' },
    fondale: '/rrbbzCyS45yooXpUGJatfptlHYI.jpg',
    citazioni: [
      { testo: 'Potrei pensare a questo film per il resto della mia vita', fonte: 'Awards Radar', fondale: '/cbnnJBKSaKxYaSx7uBow60EOyfx.jpg' },
      { testo: 'Un assoluto capolavoro', fonte: 'Awards Watch', fondale: '/gsSAPAcHDSQOSIDZVm1alSZpDCv.jpg' },
      { testo: 'Camaleontico', fonte: 'Roger Ebert', fondale: '/mF7P6UIJxUYEaEiruklp8VQqDjY.jpg' },
      { testo: 'Un viaggio più strano e folle di quanto ci si possa aspettare', fonte: 'Variety', fondale: '/uDONA0SCc1Tanl1lizf6lYNoMmr.jpg' },
    ],
    materiale: {
      banner: {
        orizzontale: { src: `${YCSE}/banner-orizzontale.jpg`, w: 1920, h: 1080, date: { x: 45.94, y: 69.81, w: 42.08, h: 11.76, riquadro: true } },
        verticale: { src: `${YCSE}/banner-verticale.jpg`, w: 1080, h: 1920, date: { x: 18.61, y: 90.52, w: 62.87, h: 5, riquadro: true } },
      },
      locandina: { src: `${YCSE}/locandina.jpg`, w: 1040, h: 2205, date: { x: 21.83, y: 93.33, w: 47.5, h: 3, riquadro: false } },
      trailerVerticale: { src: `${YCSE}/trailer-verticale.mp4`, poster: `${YCSE}/trailer-verticale.jpg` },
      foto: [
        { src: `${YCSE}/foto-2.jpg`, w: 2000, h: 1500, chi: 'Da sinistra, Nathan Fielder ed Elizabeth Holmes', credito: 'Courtesy of A24' },
        { src: `${YCSE}/foto-1.jpg`, w: 2000, h: 1125 },
        { src: `${YCSE}/foto-4.jpg`, w: 2000, h: 1500, chi: 'Da sinistra, Elizabeth Holmes, Billy Evans e Nathan Fielder', credito: 'Lance Oppenheim' },
        { src: `${YCSE}/foto-3.jpg`, w: 1440, h: 1080 },
      ],
    },
  },
];

export interface SpecialeInSala<M extends HomeMovie> {
  speciale: ProiezioneSpeciale;
  movie: M;
  /** Il prossimo spettacolo non esaurito (o il prossimo, se sono tutti esauriti). */
  show: M["subevents"][number];
  /** Gli orari dei suoi spettacoli, senza doppioni ("16:00", "21:00"). */
  orari: string[];
  /** Le date del cinema: "Dal 25 novembre all'8 dicembre", poi "Fino all'8 dicembre". */
  periodo: string;
}

/** "a" + "8 dicembre" = "all'8 dicembre"; "a" + "25 novembre" = "al 25 novembre". */
function con(prep: 'da' | 'a', giorno: string): string {
  const base = prep === 'da' ? 'dal' : 'al';
  // Davanti a 1, 8 e 11 la preposizione si elide: "dall'8", "all'11".
  return /^(1|8|11)\b/.test(giorno) ? `${base}l'${giorno}` : `${base} ${giorno}`;
}

/**
 * Le date della rassegna come le scrive il cinema. Il primo giorno è quello
 * della configurazione, l'ultimo quello dell'ultimo spettacolo in programma.
 * A rassegna cominciata, "Fino all'8 dicembre": il primo giorno è passato.
 */
export function periodo(inizio: string, ultimo: string, now: Date): string {
  const giorno = (d: string) => formatInTimeZone(new Date(d), CINEMA_TIMEZONE, 'd MMMM', { locale: it });
  const oggi = toCinemaDayKey(now);
  const fine = giorno(ultimo);
  const primo = `${inizio}T12:00:00Z`;
  if (toCinemaDayKey(ultimo) === inizio) return `Il ${giorno(primo)}`.replace(/^Il (1|8|11)\b/, "L'$1");
  if (oggi > inizio) return `Fino ${con('a', fine)}`;
  const [g1, m1] = giorno(primo).split(' ');
  const da = m1 === fine.split(' ')[1] ? g1 : giorno(primo);
  return `${maiuscola(con('da', da))} ${con('a', fine)}`;
}

const maiuscola = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** La proiezione speciale in programma adesso, se c'è: quella col primo spettacolo più vicino. */
export function specialeInSala<M extends HomeMovie>(movies: M[], now: Date, elenco = SPECIALI): SpecialeInSala<M> | null {
  const trovati = elenco.flatMap(speciale => {
    const movie = movies.find(m => m.id === speciale.tmdbId);
    if (!movie) return [];
    const futuri = movie.subevents
      .filter(s => new Date(s.date) >= now)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!futuri.length) return [];
    const show = futuri.find(s => !s.isSoldOut) || futuri[0];
    // In ora di Roma: le date arrivano in UTC.
    const orari = [...new Set(futuri.map(s => formatShowTime(s.date)))].sort();
    return [{ speciale, movie, show, orari, periodo: periodo(speciale.inizio, futuri[futuri.length - 1].date, now) }];
  });
  trovati.sort((a, b) => a.show.date.localeCompare(b.show.date));
  return trovati[0] || null;
}
