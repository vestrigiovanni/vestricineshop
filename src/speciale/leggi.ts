import prisma from '@/lib/prisma';
import type { Carattere, Citazione, Materiale, ProiezioneSpeciale } from './proiezioneSpeciale';

/**
 * Le proiezioni speciali salvate dal gestionale (stanza Speciale), in sola
 * lettura: la tabella la leggono anche Sala 1 e la v1. Se il database non
 * risponde, la home va avanti senza.
 */
export async function specialiAttive(): Promise<ProiezioneSpeciale[]> {
  try {
    const righe = await prisma.proiezioneSpeciale.findMany({ where: { attiva: true }, orderBy: { updatedAt: 'desc' } });
    return righe.map(r => ({
      tmdbId: r.tmdbId,
      inizio: r.inizio,
      sopra: r.sopra,
      casa: { nome: r.casaNome, logo: r.casaLogo },
      fondale: r.fondale,
      citazioni: Array.isArray(r.citazioni) ? (r.citazioni as unknown as Citazione[]) : [],
      carattere: (r.carattere as unknown as Carattere | null) ?? undefined,
      materiale: (r.materiale as unknown as Materiale | null) ?? undefined,
    }));
  } catch (err) {
    console.error('[speciali] lettura non riuscita, la home va avanti senza:', err);
    return [];
  }
}
