import { formatInTimeZone } from 'date-fns-tz';
import { TIMEZONE, romeToMs } from '@/services/scheduling/rome';

/**
 * Un istante scritto come lo vuole Pretix: ora di Roma, con il fuso giusto
 * per *quel* giorno. Prima il suffisso era `+02:00` fisso, e dall'ultima
 * domenica di ottobre ogni spettacolo finiva su Pretix un'ora prima.
 */
export function formatRomeISO(d: Date | number): string {
  return formatInTimeZone(d, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/**
 * La stringa date_from/date_to di Pretix per un orario di Roma.
 * @param baseDate YYYY-MM-DD
 * @param baseTime HH:mm
 * @param addMinutes minuti da aggiungere (anche oltre la mezzanotte)
 */
export function calculatePretixDateTime(baseDate: string, baseTime: string, addMinutes: number = 0) {
  const [h, m] = baseTime.split(':').map(Number);
  return formatRomeISO(romeToMs(baseDate, h * 60 + m + addMinutes));
}
