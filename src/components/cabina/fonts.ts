import { Fraunces, JetBrains_Mono } from 'next/font/google';

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
