/** Una proiezione come la vede il sito: quando e cosa. */
export interface Proiezione {
  id: number;
  inizio: Date;
  titolo: string;
}

export interface Giorno<P extends Proiezione = Proiezione> {
  /** Data a Roma, AAAA-MM-GG */
  giorno: string;
  proiezioni: P[];
}

const dataRoma = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** La regola d'oro: solo le proiezioni future, dalla più vicina, divise per giorno di Roma. */
export function perGiorno<P extends Proiezione>(proiezioni: P[], ora: Date = new Date()): Giorno<P>[] {
  const future = proiezioni
    .filter((p) => p.inizio.getTime() > ora.getTime())
    .sort((a, b) => a.inizio.getTime() - b.inizio.getTime());

  const giorni: Giorno<P>[] = [];
  for (const p of future) {
    const giorno = dataRoma.format(p.inizio);
    const ultimo = giorni[giorni.length - 1];
    if (ultimo?.giorno === giorno) ultimo.proiezioni.push(p);
    else giorni.push({ giorno, proiezioni: [p] });
  }
  return giorni;
}
