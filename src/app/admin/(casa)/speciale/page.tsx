import type { Metadata } from 'next';
import SpecialeRoom from './_speciale/SpecialeRoom';

export const metadata: Metadata = { title: 'Speciale' };

export default function SpecialePage() {
  return <SpecialeRoom />;
}
