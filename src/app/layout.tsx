import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import ClientFooter from '../components/ClientFooter';
import './globals.css';

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'VESTRICINEMA | The Ultimate Cinema Experience',
  description: 'Book your free tickets seamlessly with VESTRICINEMA.',
};

import Providers from '@/components/Providers';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body className={`${inter.variable} antialiased`} style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Providers>
          <main style={{ flex: '1' }}>{children}</main>
          <ClientFooter />
        </Providers>
      </body>
    </html>
  );
}
