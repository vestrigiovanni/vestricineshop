import { CLOSING_MINUTE, OPENING_MINUTE } from '@/services/scheduling/times';

/**
 * L'asse orizzontale della timeline, in minuti del giorno di programmazione.
 * Oltre le 24:00 è la coda dopo mezzanotte: 1500 sono le 01:00.
 */
export interface Axis {
  start: number;
  end: number;
}

/** Dall'apertura alla chiusura, allargato all'ora intera per chi ne esce. */
export function axisFor(spans: { start: number; end: number }[]): Axis {
  let start = OPENING_MINUTE;
  let end = CLOSING_MINUTE;
  for (const s of spans) {
    if (s.start < start) start = s.start;
    if (s.end > end) end = s.end;
  }
  return { start: Math.floor(start / 60) * 60, end: Math.ceil(end / 60) * 60 };
}

/** Posizione e larghezza in percentuale, tagliate ai bordi dell'asse. */
export function place(start: number, end: number, axis: Axis): { left: number; width: number } {
  const length = axis.end - axis.start;
  const a = Math.max(start, axis.start);
  const b = Math.min(end, axis.end);
  return { left: ((a - axis.start) / length) * 100, width: (Math.max(b - a, 0) / length) * 100 };
}

/**
 * Il minuto sotto un punto della timeline, agganciato al passo (un quarto
 * d'ora): è una proposta, poi è il controllo della sala a dire se regge.
 */
export function minuteAt(fraction: number, axis: Axis, step = 15): number {
  const f = Math.min(Math.max(fraction, 0), 1);
  const raw = axis.start + f * (axis.end - axis.start);
  return Math.min(Math.max(Math.round(raw / step) * step, axis.start), axis.end - step);
}

export function ticks(axis: Axis, every = 120): { minute: number; label: string; left: number }[] {
  const out: { minute: number; label: string; left: number }[] = [];
  for (let m = Math.ceil(axis.start / every) * every; m <= axis.end; m += every) {
    out.push({
      minute: m,
      label: String(Math.floor(m / 60) % 24).padStart(2, '0'),
      left: ((m - axis.start) / (axis.end - axis.start)) * 100,
    });
  }
  return out;
}
