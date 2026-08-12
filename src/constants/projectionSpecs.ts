/**
 * Le specifiche di proiezione: cosa vede e sente davvero chi è in sala.
 *
 * Sono una scelta *dello spettacolo*, non del film. Lo stesso titolo può girare
 * in 4K la sera e in copia normale il pomeriggio, e il pubblico ha diritto di
 * sapere quale dei due sta prenotando.
 *
 * PERCHÉ NON ARRIVANO DA PLEX — leggere le tracce del file direbbe cosa c'è
 * sullo scaffale, non cosa esce dal proiettore: la sorgente è solo metà della
 * catena. Le spunta chi programma, che è l'unico a sapere com'è configurata la
 * sala quella sera.
 *
 * UNA PAROLA SU IMAX — è un marchio registrato e indica una sala certificata.
 * Qui l'etichetta pubblica dice "Versione IMAX", che è la cosa vera: si
 * proietta la versione IMAX del film, quella col fotogramma più alto. Se un
 * giorno servisse un'altra dicitura si cambia `publicLabel` e cambia ovunque,
 * perché nessuno scrive quelle parole a mano da nessun'altra parte.
 */

export type ProjectionSpecCode = '4K' | 'DOLBY_VISION' | 'ATMOS' | 'IMAX';

export interface ProjectionSpec {
  code: ProjectionSpecCode;
  /** Come si chiama in programmazione, dove va capito cosa si sta spuntando. */
  adminLabel: string;
  /** Come compare al pubblico, sul bollino. */
  publicLabel: string;
  /** Cosa significa, in una riga: è il testo del tooltip nella scheda film. */
  description: string;
}

/**
 * L'ordine qui dentro è l'ordine in cui i bollini compaiono ovunque: dalla
 * qualità dell'immagine a quella del suono, e per ultima la versione del film.
 * Non è alfabetico ed è voluto — si legge come una frase.
 */
export const PROJECTION_SPECS: readonly ProjectionSpec[] = [
  {
    code: '4K',
    adminLabel: '4K',
    publicLabel: '4K',
    description: 'Proiezione in 4K: quattro volte i pixel del Full HD.',
  },
  {
    code: 'DOLBY_VISION',
    adminLabel: 'Dolby Vision',
    publicLabel: 'DOLBY VISION',
    description: 'Dolby Vision: colore a 12 bit e contrasto calibrato scena per scena.',
  },
  {
    code: 'ATMOS',
    adminLabel: 'Dolby Atmos',
    publicLabel: 'DOLBY ATMOS',
    description: 'Dolby Atmos: audio tridimensionale, i suoni si muovono nello spazio.',
  },
  {
    code: 'IMAX',
    adminLabel: 'Versione IMAX',
    publicLabel: 'VERSIONE IMAX',
    description: "Versione IMAX: il fotogramma più alto, com'è stato girato.",
  },
] as const;

const BY_CODE = new Map(PROJECTION_SPECS.map((s) => [s.code, s]));

/** L'ordine canonico, per rimettere in fila codici arrivati alla rinfusa. */
const ORDER = new Map(PROJECTION_SPECS.map((s, i) => [s.code, i]));

export function isProjectionSpecCode(value: unknown): value is ProjectionSpecCode {
  return typeof value === 'string' && BY_CODE.has(value as ProjectionSpecCode);
}

export function projectionSpec(code: string): ProjectionSpec | undefined {
  return BY_CODE.get(code as ProjectionSpecCode);
}

/**
 * Ripulisce quello che arriva da fuori — client, database, app Swift — e
 * restituisce codici validi, senza doppioni, nell'ordine canonico.
 *
 * Un codice sconosciuto viene **scartato in silenzio** invece di far fallire il
 * salvataggio: la fonte tipica è una riga vecchia in database o una versione
 * dell'app più avanti di questa, e in nessuno dei due casi vale la pena
 * rifiutare uno spettacolo per un bollino che non sappiamo disegnare.
 */
export function normalizeProjectionSpecs(input: unknown): ProjectionSpecCode[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<ProjectionSpecCode>();
  for (const raw of input) {
    const code = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
    if (isProjectionSpecCode(code)) seen.add(code);
  }
  return [...seen].sort((a, b) => (ORDER.get(a) ?? 0) - (ORDER.get(b) ?? 0));
}

/** La riga libera: tagliata, e vuota diventa `null` come la vuole il database. */
export function normalizeProjectionSpecsNote(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim().slice(0, 120);
  return trimmed || null;
}

/**
 * Le specifiche vere per **tutti** gli spettacoli di un film.
 *
 * Serve alla scheda film e alle locandine, dove si parla del film e non di una
 * singola replica. Se il film gira in Dolby Vision la sera e in copia normale
 * il pomeriggio, la scheda non promette Dolby Vision a nessuno: chi sceglie
 * l'orario lo legge sullo spettacolo, dove l'informazione è esatta. Promettere
 * al pubblico una qualità che poi non trova in sala è il solo errore che qui
 * conta davvero.
 */
export function commonProjectionSpecs(perShow: unknown[]): ProjectionSpecCode[] {
  if (!Array.isArray(perShow) || perShow.length === 0) return [];
  const [first, ...rest] = perShow.map(normalizeProjectionSpecs);
  return first.filter((code) => rest.every((list) => list.includes(code)));
}

/**
 * Le etichette pubbliche, pronte da mettere nei bollini.
 *
 * La riga libera entra in coda **così com'è stata scritta**: è l'unico posto in
 * cui il testo non passa dal vocabolario, ed è tutto il suo senso — serve per
 * le cose che il vocabolario non prevede ("copia 35mm restaurata").
 */
export function projectionSpecLabels(codes: unknown, note?: string | null): string[] {
  const labels = normalizeProjectionSpecs(codes).map((c) => BY_CODE.get(c)!.publicLabel);
  const extra = typeof note === 'string' ? note.trim() : '';
  if (extra) labels.push(extra.toUpperCase());
  return labels;
}
