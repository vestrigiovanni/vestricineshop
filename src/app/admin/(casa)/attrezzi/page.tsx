import type { Metadata } from 'next';
import AttrezziRoom from './_attrezzi/AttrezziRoom';

export const metadata: Metadata = { title: 'Attrezzi' };

export default function AttrezziPage() {
  return <AttrezziRoom />;
}
