import type { Metadata } from 'next';
import SaleRoom from './_sale/SaleRoom';

export const metadata: Metadata = { title: 'Sale' };

export default function SalePage() {
  return <SaleRoom />;
}
