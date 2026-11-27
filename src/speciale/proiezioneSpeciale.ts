import { formatShowTime, toCinemaDayKey } from '../home/date';
import type { HomeMovie } from '../home/programma';

/**
 * Le proiezioni speciali: un film che, finché ha spettacoli in programma, apre
 * la home con una pagina sua (Speciale.tsx) invece di stare in fila con gli
 * altri. Finito l'ultimo spettacolo la home torna com'era, da sola.
 *
 * La prima, chiesta da Gio il 25 novembre 2026: You Can See Everything in
 * sala A24, due spettacoli al giorno fino all'8 dicembre. Le speciali stanno
 * nel database (modello ProiezioneSpeciale, le scrive la stanza Speciale del
 * gestionale): la home legge quelle accese con `specialiAttive()`.
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
 * Il carattere delle citazioni, il più simile a quello del trailer, scelto da
 * «Critica dal trailer» fra quelli di Google Fonts. Il file (woff2) sta sul
 * sito: nessuna richiesta a Google da chi guarda la home.
 */
export interface Carattere {
  famiglia: string;
  peso: number;
  src: string;
}

/** Un'immagine del materiale del distributore: in `public/speciali` o caricata (`/api/speciale/immagine/<id>`). */
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

/** Il materiale del distributore, messo fra gli atti (Intermezzi.tsx). */
export interface Materiale {
  /** Con uno solo dei due, quello vale per schermo grande e telefono. */
  banner?: { orizzontale?: ConDate; verticale?: ConDate };
  locandina?: ConDate;
  /** Muto, a ciclo. */
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

export interface SpecialeInSala<M extends HomeMovie> {
  speciale: ProiezioneSpeciale;
  movie: M;
  /** Il prossimo spettacolo non esaurito (o il prossimo, se sono tutti esauriti). */
  show: M['subevents'][number];
  /** Gli orari dei suoi spettacoli, senza doppioni ("16:00", "21:00"). */
  orari: string[];
  /** Le date del cinema: "Dal 25 novembre all'8 dicembre", poi "Fino all'8 dicembre". */
  periodo: string;
}

/** "25 novembre", sul fuso di Roma. */
const giornoMese = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'long' });
const giorno = (d: string) => giornoMese.format(new Date(d));

/** "a" + "8 dicembre" = "all'8 dicembre"; "a" + "25 novembre" = "al 25 novembre". */
function con(prep: 'da' | 'a', g: string): string {
  const base = prep === 'da' ? 'dal' : 'al';
  // Davanti a 1, 8 e 11 la preposizione si elide: "dall'8", "all'11".
  return /^(1|8|11)\b/.test(g) ? `${base}l'${g}` : `${base} ${g}`;
}

const maiuscola = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Le date della rassegna come le scrive il cinema. Il primo giorno è quello
 * della configurazione, l'ultimo quello dell'ultimo spettacolo in programma.
 * A rassegna cominciata, "Fino all'8 dicembre": il primo giorno è passato.
 */
export function periodo(inizio: string, ultimo: string, now: Date): string {
  const oggi = toCinemaDayKey(now);
  const fine = giorno(ultimo);
  const primo = `${inizio}T12:00:00Z`;
  if (toCinemaDayKey(ultimo) === inizio) return `Il ${giorno(primo)}`.replace(/^Il (1|8|11)\b/, "L'$1");
  if (oggi > inizio) return `Fino ${con('a', fine)}`;
  const [g1, m1] = giorno(primo).split(' ');
  const da = m1 === fine.split(' ')[1] ? g1 : giorno(primo);
  return `${maiuscola(con('da', da))} ${con('a', fine)}`;
}

/** La proiezione speciale in programma adesso, se c'è: quella col primo spettacolo più vicino. */
export function specialeInSala<M extends HomeMovie>(movies: M[], now: Date, elenco: ProiezioneSpeciale[]): SpecialeInSala<M> | null {
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

/** "ogni giorno alle 16:00 e alle 21:00": gli orari, non le date. */
export function ogniGiorno(orari: string[]): string {
  return orari.length ? `ogni giorno alle ${orari.join(' e alle ')}` : '';
}
