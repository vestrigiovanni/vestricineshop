import { cassaGetTodayScreenings, cassaGetRecentSales } from '@/actions/cassaActions';
import CassaInterface from '@/components/Cassa/CassaInterface';

export const dynamic = 'force-dynamic'; // always fresh — real-time POS

export default async function CassaPage() {
  const [screenings, recentSales] = await Promise.all([
    cassaGetTodayScreenings(),
    cassaGetRecentSales(30),
  ]);

  return <CassaInterface screenings={screenings} initialRecentSales={recentSales} />;
}
