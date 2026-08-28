import type { Metadata } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import ClientFooter from '../components/ClientFooter';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

/**
 * Serif da grande schermo per le citazioni della storia cinematica.
 *
 * `preload: false` non è una svista. Fra tondo e corsivo sono 87 KB, e l'unico
 * posto che li mostra è la storia cinematica, in fondo alla home. Ma il font
 * nasce qui — nella radice, cioè nel grafo di *ogni* pagina — e Next ne metteva
 * il `<link rel="preload">` in testa a tutte le schermate: 87 KB ad altissima
 * priorità, in gara con il JavaScript per la banda, anche sul login e sul
 * pannello admin, dove il serif non compare mai. Con una connessione incerta
 * erano secondi di attesa per niente.
 *
 * Senza preload il file viene chiesto solo quando il browser incontra del testo
 * che lo usa, e cioè solo sulla home. Le citazioni stanno dopo qualche schermata
 * di scorrimento, quindi c'è tutto il tempo perché arrivi; e nel frattempo tiene
 * la riga il Georgia già dichiarato come ripiego in CinematicStory.
 *
 * (Spostare il font in un modulo a parte, come suggerisce la guida, qui non
 * serve: il manifest dei font di Turbopack elenca comunque ogni font dell'app su
 * ogni rotta, e togliere il CSS dei font dal chunk condiviso della radice fa
 * ricadere lì dentro un foglio di stile del pannello film da 116 KB.)
 */
const playfair = Playfair_Display({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-serif-display',
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  title: 'VESTRICINEMA | The Ultimate Cinema Experience',
  description: 'Book your free tickets seamlessly with VESTRICINEMA.',
};

import { AutoScrollProvider } from '@/context/AutoScrollContext';
import { TrailerProvider } from '@/context/TrailerContext';
import VideoPlayerModal from '@/components/VideoPlayerModal/VideoPlayerModal';
import Providers from '@/components/Providers';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body className={`${inter.variable} ${playfair.variable} antialiased`} style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <TrailerProvider>
          <AutoScrollProvider>
            <Providers>
              <main style={{ flex: '1' }}>{children}</main>
              <ClientFooter />
            </Providers>
          </AutoScrollProvider>
          <VideoPlayerModal />
        </TrailerProvider>
      </body>
    </html>
  );
}
