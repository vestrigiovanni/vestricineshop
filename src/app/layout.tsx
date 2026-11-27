import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geist = Geist({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-geist' });

export const metadata: Metadata = {
  title: 'Vestri Cinema',
  description: 'Il programma della sala e la prenotazione dei posti.',
};

export const viewport: Viewport = { themeColor: '#0f0b09' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={geist.variable}>
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=boska@500&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
