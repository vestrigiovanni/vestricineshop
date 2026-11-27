import type { Metadata } from 'next';
import Guscio from '@/gestionale/Guscio';
import '@/gestionale/gestionale.css';

export const metadata: Metadata = {
  title: { default: 'Gestionale — Vestri Cinema', template: '%s — Gestionale' },
  robots: { index: false, follow: false },
};

/** Tutte le stanze del gestionale, tranne il login. */
export default function Stanze({ children }: { children: React.ReactNode }) {
  return <Guscio>{children}</Guscio>;
}
