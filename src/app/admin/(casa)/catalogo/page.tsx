import type { Metadata } from 'next';
import CatalogRoom from './_catalogo/CatalogRoom';

export const metadata: Metadata = { title: 'Catalogo' };

export default function CatalogoPage() {
  return <CatalogRoom />;
}
