'use client';

import { useState } from 'react';
import { adminRefreshAllAwards, adminSyncAllMovies, adminSyncSoldOutStatus } from '@/actions/adminActions';
import Button from '@/components/cabina/Button';
import Dialog from '@/components/cabina/Dialog';
import { useToast } from '@/components/cabina/Toast';
import styles from './Film.module.css';

type Job = 'soldout' | 'awards' | 'missing' | 'force';

/**
 * I lavori che toccano tutti i film insieme. Ognuno dice prima cosa fa e
 * quanto ci mette: sono lenti, e non si lanciano per sbaglio.
 */
export default function ToolsDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [running, setRunning] = useState<Job | null>(null);

  const run = async (job: Job) => {
    setRunning(job);
    try {
      if (job === 'soldout') {
        const res = await adminSyncSoldOutStatus();
        toast(`Tutto esaurito riletto da Pretix: ${res.count} spettacoli controllati.`, 'ok');
      } else if (job === 'awards') {
        const res = await adminRefreshAllAwards();
        if (!res.success) throw new Error(res.error);
        toast(`Premi aggiornati: ${res.updated} film${res.failed ? `, ${res.failed} non riusciti` : ''}.`, res.failed ? 'info' : 'ok');
      } else {
        const res = await adminSyncAllMovies(job === 'force');
        toast(`Database popolato: ${res?.upserted ?? 0} spettacoli passati in rassegna.`, 'ok');
      }
      onDone();
    } catch {
      toast('Il lavoro non è andato a buon fine. Riprova fra poco.', 'alarm');
    } finally {
      setRunning(null);
    }
  };

  const item = (job: Job, title: string, text: string, label: string) => (
    <li className={styles.tool}>
      <div>
        <b>{title}</b>
        <p>{text}</p>
      </div>
      <Button variant={job === 'force' ? 'alarm' : 'outline'} onClick={() => run(job)} disabled={running !== null}>
        {running === job ? 'Lavoro…' : label}
      </Button>
    </li>
  );

  return (
    <Dialog open onClose={() => { if (!running) onClose(); }} title="Strumenti per tutti i film" showTitle variant="large">
      <ul className={styles.tools}>
        {item('soldout', 'Tutto esaurito', 'Rilegge le quote su Pretix per ogni spettacolo futuro. Qualche minuto.', 'Rileggi')}
        {item('awards', 'Premi', 'Chiede a MUBI i premi di ogni film in programma. Qualche minuto.', 'Aggiorna')}
        {item('missing', 'Dati mancanti', 'Scorre Pretix e completa le schede a cui manca qualcosa. Le tue personalizzazioni restano.', 'Completa')}
        {item('force', 'Rinfresca tutto da TMDB', 'Rilegge da TMDB ogni scheda, anche quelle complete. Le tue personalizzazioni restano, ma ci vuole di più.', 'Rinfresca')}
      </ul>
      {running && <p className={styles.hint}>Resta su questa pagina finché non finisce.</p>}
    </Dialog>
  );
}
