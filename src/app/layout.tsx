import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Vestri Cinema',
  description: 'Il programma della sala e la prenotazione dei posti.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body style={{ margin: 0, background: '#0b0b0c', color: '#f2f2f2', fontFamily: '-apple-system, BlinkMacSystemFont, Inter, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
