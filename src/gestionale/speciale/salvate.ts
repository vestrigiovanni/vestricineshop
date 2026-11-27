import prisma from '@/lib/prisma';
import type { Carattere, Citazione, Materiale, ProiezioneSpeciale } from '@/speciale/proiezioneSpeciale';

/** Una proiezione speciale come la vede la stanza: anche spenta, col suo id. */
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

/** Tutte, accese e spente, dall'ultima toccata. */
export async function tutteLeSpeciali(): Promise<SpecialeSalvata[]> {
  const righe = await prisma.proiezioneSpeciale.findMany({ orderBy: { updatedAt: 'desc' } });
  return righe.map(daRiga);
}
