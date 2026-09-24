'use client';

import { useState } from 'react';
import { planningDeleteShow } from '@/actions/planningActions';
import Button from '@/components/cabina/Button';
import Dialog from '@/components/cabina/Dialog';
import { useToast } from '@/components/cabina/Toast';
import styles from './BlockPanel.module.css';

export interface Sibling {
  pretixId: number;
  label: string;
}

/**
 * Tutte le repliche di un film nel periodo, in un colpo. Ognuna passa dalla
 * stessa rete di sicurezza dell'eliminazione singola: quelle con biglietti
 * venduti restano, e lo si dice.
 */
export default function GroupDeleteDialog({ title, siblings, onClose, onDone }: { title: string; siblings: Sibling[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [working, setWorking] = useState(false);

  const run = async () => {
    setWorking(true);
    let deleted = 0;
    const kept: string[] = [];
    for (const s of siblings) {
      try {
        const res = await planningDeleteShow(s.pretixId, false);
        if (res.deleted) deleted++;
        else kept.push(s.label);
      } catch {
        kept.push(s.label);
      }
    }
    setWorking(false);
    toast(
      kept.length
        ? `${deleted} repliche di «${title}» eliminate. Restano ${kept.join(', ')}: hanno biglietti venduti, o Pretix non ha risposto.`
        : `Tutte le ${deleted} repliche di «${title}» eliminate.`,
      kept.length ? 'info' : 'ok',
    );
    onDone();
  };

  return (
    <Dialog open onClose={() => { if (!working) onClose(); }} title={`Eliminare tutte le repliche di «${title}»?`} showTitle>
      <p className={styles.text}>
        {siblings.length} spettacoli in questo periodo: {siblings.map((s) => s.label).join(', ')}. Spariscono da Pretix, dal sito e dall’app. Quelli con biglietti venduti restano.
      </p>
      <div className={styles.dialogActions}>
        <Button variant="ghost" onClick={onClose} disabled={working}>Annulla</Button>
        <Button variant="alarm" onClick={run} disabled={working}>{working ? 'Elimino…' : `Elimina tutte e ${siblings.length}`}</Button>
      </div>
    </Dialog>
  );
}
