'use client';

import { useState } from 'react';
import { planningDeleteShow } from '@/actions/planningActions';
import Button from '@/components/cabina/Button';
import Dialog from '@/components/cabina/Dialog';
import type { TavoloBlock } from './week';
import styles from './BlockPanel.module.css';

interface Props {
  block: TavoloBlock;
  when: string;
  onClose: () => void;
  onDeleted: () => void;
}

/**
 * Eliminare è irreversibile e si vede online subito. La spunta di consenso
 * compare solo se qualcuno ha già pagato: chiederla a sala vuota insegnerebbe
 * a premere sì senza leggere.
 */
export default function DeleteDialog({ block, when, onClose, onDeleted }: Props) {
  const [refusal, setRefusal] = useState<{ message: string; soldTickets: number } | null>(null);
  const [consent, setConsent] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (block.pretixId === null) return;
    setWorking(true);
    setError(null);
    try {
      const res = await planningDeleteShow(block.pretixId, refusal !== null);
      if (!res.deleted) {
        setRefusal({ message: res.error ?? '', soldTickets: res.soldTickets });
        return;
      }
      onDeleted();
    } catch {
      setError("L'eliminazione non è riuscita. Ricarica il tavolo e controlla.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={`Eliminare «${block.title}»?`} showTitle>
      <p className={styles.text}>
        {when}, ore {block.time}. Sparisce da Pretix, dal sito e dalla home: non si torna indietro.
      </p>
      {refusal && (
        <p className={styles.alarm}>
          {refusal.message} Eliminarlo lascia orfani quegli ordini: vanno rimborsati a mano dal pannello Pretix.
        </p>
      )}
      {error && <p className={styles.alarm}>{error}</p>}
      {refusal && (
        <label className={styles.consent}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          Ho capito: elimino uno spettacolo con {refusal.soldTickets}{' '}
          {refusal.soldTickets === 1 ? 'biglietto venduto' : 'biglietti venduti'}.
        </label>
      )}
      <div className={styles.dialogActions}>
        <Button variant="ghost" onClick={onClose} disabled={working}>Annulla</Button>
        <Button variant="alarm" onClick={confirm} disabled={working || (refusal !== null && !consent)}>
          {working ? 'Elimino…' : refusal ? 'Elimina lo stesso' : 'Elimina'}
        </Button>
      </div>
    </Dialog>
  );
}
