'use client';

import { useState } from 'react';
import { catalogBackfill, catalogEnrich, catalogSeed } from '@/actions/catalogActions';
import Button from '@/components/cabina/Button';
import Dialog from '@/components/cabina/Dialog';
import styles from './Catalogo.module.css';

/**
 * L'import del catalogo: legge il CSV, abbina i film a TMDB, completa le
 * schede. Si può rilanciare quante volte si vuole: rifà solo ciò che manca.
 */
export default function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  const say = (line: string) => setLines((l) => [...l.slice(0, -1), line]);
  const next = (line: string) => setLines((l) => [...l, line]);

  const run = async () => {
    setRunning(true);
    setDone(false);
    setLines(['Leggo il CSV…']);
    try {
      const seed = await catalogSeed();
      say(`CSV letto: ${seed.total} film, ${seed.created} nuovi.`);

      next('Abbino i film a TMDB…');
      let ok = 0;
      let suspect = 0;
      let missing = 0;
      let processed = 0;
      for (;;) {
        const res = await catalogEnrich(50);
        ok += res.ok;
        suspect += res.suspect;
        missing += res.missing;
        processed += res.processed;
        say(`Abbinati ${processed}: ${ok} sicuri, ${suspect} da verificare, ${missing} non trovati. Ne restano ${res.remaining}.`);
        if (res.remaining === 0 || res.processed === 0) break;
      }

      next('Completo le schede (voto, trama, premi)…');
      let filled = 0;
      for (;;) {
        const res = await catalogBackfill(40);
        filled += res.updated;
        say(`Schede completate: ${filled}. Ne restano ${res.remaining}.`);
        if (res.remaining === 0 || res.processed === 0) break;
      }
      next('Fatto.');
      setDone(true);
      onDone();
    } catch {
      next('Qualcosa si è interrotto: rilancialo, riprende da dove era.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open onClose={() => { if (!running) onClose(); }} title="Importa e aggiorna il catalogo" showTitle variant="large">
      <p className={styles.text}>
        Legge il CSV della libreria, abbina ogni film a TMDB e completa le schede con voto, trama e premi. Rifà solo quello che manca,
        quindi si può rilanciare quando vuoi. Ci vuole qualche minuto: resta su questa pagina.
      </p>
      {lines.length > 0 && (
        <ol className={styles.importLog}>
          {lines.map((l, i) => <li key={i}>{l}</li>)}
        </ol>
      )}
      <div className={styles.dialogActions}>
        <Button variant="ghost" onClick={onClose} disabled={running}>{done ? 'Chiudi' : 'Annulla'}</Button>
        <Button variant="fill" onClick={run} disabled={running}>{running ? 'Lavoro…' : done ? 'Rilancia' : 'Avvia'}</Button>
      </div>
    </Dialog>
  );
}
