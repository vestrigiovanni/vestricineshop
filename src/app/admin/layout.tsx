import type { Metadata } from 'next';
import { Fraunces, JetBrains_Mono } from 'next/font/google';
import '@/components/cabina/cabina.css';

/**
 * I caratteri della cabina. `preload: false` per lo stesso motivo del serif in
 * app/layout.tsx: il manifest dei font elenca ogni font dell'app su ogni rotta,
 * e senza questa riga anche la home pubblica si caricherebbe in testa i font
 * del gestionale. Qui il costo è un attimo di carattere di ripiego al primo
 * ingresso in cabina, e non pesa sul pubblico.
 */
const serif = Fraunces({
  subsets: ['latin'],
  variable: '--font-cab-serif',
  display: 'swap',
  preload: false,
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-cab-mono',
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  title: { default: 'Cabina — Vestri Cinema', template: '%s — Cabina' },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className={`cabina ${serif.variable} ${mono.variable}`}>{children}</div>;
}
