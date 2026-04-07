import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CASSA — VESTRICINEMA',
  description: 'Terminale di vendita fisica VESTRICINEMA',
  robots: 'noindex, nofollow',
};

/**
 * Nested layout for /admin/cassa.
 * NOTE: Cannot include <html>/<body> — those belong only to the root layout.
 * The footer is hidden via ClientFooter's pathname check.
 * This wrapper forces full-viewport dark background over the root layout styles.
 */
export default function CassaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#0a0a0f', minHeight: '100vh' }}>
      {children}
    </div>
  );
}
