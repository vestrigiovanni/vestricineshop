import prisma from '@/lib/prisma';
import type { Carattere, Citazione, Materiale, ProiezioneSpeciale } from '@/components/Home/proiezioneSpeciale';

/**
 * Le proiezioni speciali salvate dal gestionale (stanza "Speciale"). La home
 * le legge da qui; se il database non risponde, la home va avanti senza.
 */
export interface SpecialeSalvata extends ProiezioneSpeciale {
  id: string;
  attiva: boolean;
  updatedAt: string;
}

type Riga = Awaited<ReturnType<typeof prisma.proiezioneSpeciale.findMany>>[number];

export function daRiga(r: Riga): SpecialeSalvata {
  return {
    id: r.id,
    attiva: r.attiva,
    tmdbId: r.tmdbId,
    inizio: r.inizio,
    sopra: r.sopra,
    casa: { nome: r.casaNome, logo: r.casaLogo },
    fondale: r.fondale,
    citazioni: Array.isArray(r.citazioni) ? (r.citazioni as unknown as Citazione[]) : [],
    carattere: (r.carattere as unknown as Carattere | null) ?? undefined,
    materiale: (r.materiale as unknown as Materiale | null) ?? undefined,
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Quelle accese, per la home. */
export async function specialiAttive(): Promise<ProiezioneSpeciale[]> {
  try {
    const righe = await prisma.proiezioneSpeciale.findMany({ where: { attiva: true }, orderBy: { updatedAt: 'desc' } });
    return righe.map(daRiga);
  } catch (err) {
    console.error('[speciali] lettura non riuscita, la home va avanti senza:', err);
    return [];
  }
}

/** Tutte, per il gestionale. */
export async function tutteLeSpeciali(): Promise<SpecialeSalvata[]> {
  const righe = await prisma.proiezioneSpeciale.findMany({ orderBy: { updatedAt: 'desc' } });
  return righe.map(daRiga);
}
