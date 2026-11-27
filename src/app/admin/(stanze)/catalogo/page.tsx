import type { Metadata } from 'next';
import StanzaCatalogo from '@/gestionale/catalogo/StanzaCatalogo';

export const metadata: Metadata = { title: 'Catalogo' };

export default function Catalogo() {
  return <StanzaCatalogo />;
}
