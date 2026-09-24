import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cassa',
  description: 'Terminale di vendita fisica VESTRICINEMA',
  robots: 'noindex, nofollow',
};

/** La cassa vive dentro la cabina: sfondo, caratteri e barra sottile vengono dal guscio. */
export default function CassaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
