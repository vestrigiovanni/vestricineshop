import type { Metadata } from 'next';
import SpecialeRoom from './_speciale/SpecialeRoom';

export const metadata: Metadata = { title: 'Speciale' };

/** «Riempi dal distributore» scarica zip di decine di mega: le azioni di questa pagina hanno due minuti. */
export const maxDuration = 120;

export default function SpecialePage() {
  return <SpecialeRoom />;
}
