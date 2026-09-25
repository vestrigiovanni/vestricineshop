import { formatShowTime } from '@/utils/cinemaDate';

/**
 * Le regole del display all'ingresso, fuori dal disegno: quale spettacolo è
 * in sala, quale viene dopo, e cosa dice il conto alla rovescia. Sono quelle
 * della pagina di prima, portate qui per poterle provare.
 *
 * Gli orari si confrontano in millisecondi. Prima entrambi i lati passavano da
 * `toZonedTime`, che li sposta della stessa quantità: il risultato è lo stesso.
 */

export interface DisplayShow {
  id: number;
  date_from: string;
  date_to: string;
}

const MINUTE = 60_000;

/**
 * In corso: dall'inizio del preroll alla fine del film. Poi i due che vengono
 * dopo: dopo quello in corso, oppure, se non c'è, i primi che devono iniziare.
 */
export function pickShows<T extends DisplayShow>(shows: T[], now: Date, prerollSec: number) {
  const t = now.getTime();
  const preroll = prerollSec * 1000;
  const current = shows.find(s => t >= Date.parse(s.date_from) - preroll && t < Date.parse(s.date_to)) || null;
  const currentIdx = current ? shows.indexOf(current) : -1;
  const future = shows.filter((s, i) => (current ? i > currentIdx : Date.parse(s.date_from) > t));
  return { current, next: future[0] || null, following: future[1] || null };
}

export type TimerType = 'idle' | 'preroll-countdown' | 'final-countdown' | 'preroll-active' | 'playing';

export interface TimerState {
  type: TimerType;
  label: string;
  value: string;
  /** Solo durante il film: da 0 a 100. */
  progress: number;
}

/** "1 ora e 12 minuti", arrotondando al minuto per eccesso, come prima. */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.ceil(ms / MINUTE);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const h = hours === 1 ? 'ora' : 'ore';
  const m = mins === 1 ? 'minuto' : 'minuti';
  if (hours > 0) return mins === 0 ? `${hours} ${h}` : `${hours} ${h} e ${mins} ${m}`;
  return `${mins} ${m}`;
}

/**
 * Il conto alla rovescia per uno spettacolo:
 * - prima: "Inizio tra", fino all'inizio del preroll;
 * - l'ultimo minuto prima del preroll: il conto finale, in secondi;
 * - durante il preroll: "Il film inizierà a breve", e "Buona visione"
 *   nell'ultimo minuto;
 * - durante il film: "Fine tra" e l'avanzamento.
 */
export function timerFor(show: DisplayShow | null, now: Date, prerollSec: number): TimerState {
  if (!show) return { type: 'idle', label: 'In attesa di proiezioni', value: '--:--', progress: 0 };

  const t = now.getTime();
  const start = Date.parse(show.date_from);
  const end = Date.parse(show.date_to);
  const prerollStart = start - prerollSec * 1000;

  if (t < start) {
    if (t >= prerollStart) {
      return start - t <= MINUTE
        ? { type: 'preroll-active', label: '', value: 'Buona visione', progress: 0 }
        : { type: 'preroll-active', label: '', value: 'Il film inizierà a breve', progress: 0 };
    }
    const toPreroll = prerollStart - t;
    if (toPreroll <= MINUTE) {
      return { type: 'final-countdown', label: 'Inizio fra', value: String(Math.floor((toPreroll % MINUTE) / 1000)), progress: 0 };
    }
    return { type: 'preroll-countdown', label: 'Inizio tra', value: formatDuration(toPreroll), progress: 0 };
  }

  return {
    type: 'playing',
    label: 'Fine tra',
    value: formatDuration(Math.max(0, end - t)),
    progress: Math.min(100, ((t - start) / (end - start)) * 100),
  };
}

/** Chi sta sul palco: lo scelto a mano, altrimenti in corso o prossimo (scambiabili). */
export function stageFor<T extends DisplayShow>(o: { selected: T | null; current: T | null; next: T | null; swapped: boolean }): T | null {
  return o.selected || (o.swapped && o.next ? o.next : o.current || o.next);
}

/** Chi dà il conto alla rovescia: come il palco, ma scambiato senza prossimo non torna al corrente. */
export function timerShowFor<T extends DisplayShow>(o: { selected: T | null; current: T | null; next: T | null; swapped: boolean }): T | null {
  return o.selected || (o.swapped ? o.next : o.current || o.next);
}

export function stageLabel(stage: DisplayShow | null, current: DisplayShow | null): string {
  if (!stage) return '';
  if (current && stage.id === current.id) return 'In sala adesso';
  return `Prossimo spettacolo · ${formatShowTime(stage.date_from)}`;
}

/** "A seguire": l'altro film, con l'etichetta che dice cos'è. */
export function sideFor<T extends DisplayShow>(o: {
  selected: T | null;
  current: T | null;
  next: T | null;
  following: T | null;
  swapped: boolean;
}): { show: T; label: string } | null {
  const { selected, current, next, following, swapped } = o;
  const show = selected
    ? (current?.id === selected.id ? next : current)
    : (swapped ? current : (current ? next : following));
  if (!show) return null;
  const label = current && show.id === current.id ? 'Proiezione in corso' : current ? 'Prossimo spettacolo' : 'A seguire';
  return { show, label };
}

/** Accanto al titolo: l'ora d'inizio, oppure, se scambiati, quanto manca alla fine. */
export function sideValue(show: DisplayShow, swapped: boolean, now: Date): string {
  if (!swapped) return formatShowTime(show.date_from);
  const mins = Math.floor(Math.max(0, Date.parse(show.date_to) - now.getTime()) / MINUTE);
  return `Fine tra ${mins} min`;
}
