import type { Metadata } from 'next';

// I caratteri e cabina.css arrivano dal layout radice: valgono anche per il
// sito pubblico.

export const metadata: Metadata = {
  title: { default: 'Cabina — Vestri Cinema', template: '%s — Cabina' },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="cabina">{children}</div>;
}
