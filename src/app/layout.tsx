import type { Metadata } from 'next';
import { Inter, Cinzel } from 'next/font/google';
import ClientFooter from '../components/ClientFooter';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  preload: false,
});

const cinzel = Cinzel({
  subsets: ['latin'],
  variable: '--font-cinzel',
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
      <body className={`${inter.variable} ${cinzel.variable} antialiased`} style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
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
