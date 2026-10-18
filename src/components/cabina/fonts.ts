import { Fraunces, Hanken_Grotesk, JetBrains_Mono, Libre_Caslon_Display, Newsreader } from 'next/font/google';

/**
 * I caratteri di Cabina, per il gestionale e per il sito pubblico.
 *
 * `preload: false` resta, per lo stesso motivo del Playfair in app/layout.tsx:
 * il manifest dei font elenca ogni font dell'app su ogni rotta, e con il
 * preload anche il display d'ingresso si caricherebbe in testa due famiglie
 * che non usa. Il prezzo è un attimo di Georgia o di monospace di sistema al
 * primo ingresso. Se sulla home l'attimo si vede troppo (tappa 2, orari
 * dell'hero), si riconsidera lì.
 *
 * Il corsivo di Fraunces serve alle citazioni del racconto (tappa 3).
 */
export const cabSerif = Fraunces({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-cab-serif',
  display: 'swap',
  preload: false,
});

export const cabMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-cab-mono',
  display: 'swap',
  preload: false,
});

/**
 * I caratteri della nuova home, scelti da Giovanni il 18 ottobre 2026:
 * Libre Caslon Display per premi, orari grandi e titoli di sezione;
 * Hanken Grotesk, maiuscolo spaziato, per regista, orari piccoli e sala
 * (al posto di JetBrains Mono, che sulla home non si usa più);
 * Newsreader per le sinossi. `preload: false` per lo stesso motivo di sopra.
 */
export const homeTitoli = Libre_Caslon_Display({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-home-titoli',
  display: 'swap',
  preload: false,
});

export const homeDati = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--font-home-dati',
  display: 'swap',
  preload: false,
});

export const homeTesto = Newsreader({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-home-testo',
  display: 'swap',
  preload: false,
});
