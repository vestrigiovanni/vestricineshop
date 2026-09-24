'use client';

/**
 * IL PANNELLO — dove una decisione irreversibile si prende sapendo cosa fa.
 *
 * È presentazionale: non chiama niente, non sa cosa sia Pretix. Riceve l'esito
 * del controllo e restituisce la decisione. La regola che lo governa: la
 * spunta di consenso compare **solo quando c'è qualcuno che ha pagato**.
 * Chiederla anche a sala vuota insegnerebbe a premere sì senza leggere, e
 * quando poi conta davvero non la leggerebbe più nessuno.
 */

import React, { useState } from 'react';
import { Loader2, TriangleAlert, X } from 'lucide-react';
import styles from './Programmazione.module.css';
import type { ExistingShow, MoveCheck } from '@/actions/planningActions';
import { dayLabel } from './types';

export type Pending =
  | { kind: 'move'; show: ExistingShow; fromDay: string; toDay: string; time: string; check: MoveCheck | null }
  | { kind: 'delete'; show: ExistingShow; day: string; refusal: { message: string; soldTickets: number } | null };

interface Props {
  pending: Pending;
  working: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirmMove: (opts: { replaces: number[]; force: boolean; allowOutsideHours: boolean }) => void;
  onConfirmDelete: (force: boolean) => void;
}

export default function MovePanel({
  pending, working, error, onCancel, onConfirmMove, onConfirmDelete,
}: Props) {
  const [consent, setConsent] = useState(false);

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  // ── Eliminare ────────────────────────────────────────────────────────────
  if (pending.kind === 'delete') {
    const refusal = pending.refusal;
    return (
      <div className={styles.modalBack} onClick={onCancel}>
        <div className={styles.modalCard} onClick={stop}>
          <div className={styles.modalHead}>
            <h3>Eliminare «{pending.show.title}»?</h3>
            <button onClick={onCancel} aria-label="Chiudi"><X size={17} /></button>
          </div>

          <p className={styles.modalBody}>
            {dayLabel(pending.day)}, ore {pending.show.time}. Sparisce da Pretix, dal sito e
            dalla home: non si torna indietro.
          </p>

          {refusal && (
            <p className={styles.modalDanger}>
              <TriangleAlert size={14} /> {refusal.message} Eliminarlo lascia orfani quegli
              ordini: vanno rimborsati a mano dal pannello Pretix.
            </p>
          )}

          {error && <p className={styles.modalDanger}><TriangleAlert size={14} /> {error}</p>}

          {refusal && (
            <label className={styles.modalConsent}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              Ho capito: elimino uno spettacolo con {refusal.soldTickets} bigliett
              {refusal.soldTickets === 1 ? 'o venduto' : 'i venduti'}.
            </label>
          )}

          <div className={styles.modalActions}>
            <button className={styles.ghostBtn} onClick={onCancel} disabled={working}>Annulla</button>
            <button
              className={styles.dangerBtn}
              disabled={working || (refusal !== null && !consent)}
              onClick={() => onConfirmDelete(refusal !== null)}
            >
              {working ? <Loader2 size={16} className={styles.spin} /> : null}
              {refusal ? 'Elimina lo stesso' : 'Elimina'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Spostare ─────────────────────────────────────────────────────────────
  const check = pending.check;
  const conflicts = check?.conflicts ?? [];
  const replaces = conflicts.map((c) => c.pretixId).filter((v): v is number => v != null);
  const needsConsent = (check?.soldTickets ?? 0) > 0;
  const canGo = Boolean(check?.usable) && (!needsConsent || consent);
  const moved = pending.show;

  return (
    <div className={styles.modalBack} onClick={onCancel}>
      <div className={styles.modalCard} onClick={stop}>
        <div className={styles.modalHead}>
          <h3>Spostare «{moved.title}»</h3>
          <button onClick={onCancel} aria-label="Chiudi"><X size={17} /></button>
        </div>

        <p className={styles.modalBody}>
          Da {dayLabel(pending.fromDay).toLowerCase()} alle {moved.time} →{' '}
          <b>{dayLabel(pending.toDay).toLowerCase()} alle {check?.slot?.time ?? pending.time}</b>
        </p>

        {!check && (
          <p className={styles.modalBody}><Loader2 size={14} className={styles.spin} /> Guardo la sala…</p>
        )}

        {check && <p className={styles.modalBody}>{check.message}</p>}

        {check && check.movingShowSoldTickets === null && (
          <p className={styles.modalWarn}>
            <TriangleAlert size={14} /> Non sono riuscito a controllare quanti biglietti sono
            già stati venduti per questo spettacolo.
          </p>
        )}

        {check && (check.movingShowSoldTickets ?? 0) > 0 && (
          <p className={styles.modalWarn}>
            <TriangleAlert size={14} /> {check.movingShowSoldTickets} person
            {check.movingShowSoldTickets === 1 ? 'a ha' : 'e hanno'} già un biglietto per le{' '}
            {moved.time}. Spostandolo si presenteranno all&apos;orario vecchio: Pretix non le
            avvisa, devi farlo tu.
          </p>
        )}

        {error && <p className={styles.modalDanger}><TriangleAlert size={14} /> {error}</p>}

        {check && needsConsent && (
          <label className={styles.modalConsent}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            Ho capito: elimino {conflicts.length === 1 ? 'uno spettacolo' : `${conflicts.length} spettacoli`} con{' '}
            {check.soldTickets} bigliett{check.soldTickets === 1 ? 'o venduto' : 'i venduti'}, e gli
            ordini vanno rimborsati a mano.
          </label>
        )}

        <div className={styles.modalActions}>
          <button className={styles.ghostBtn} onClick={onCancel} disabled={working}>Annulla</button>
          <button
            className={conflicts.length > 0 ? styles.dangerBtn : styles.ctaBtnSmall}
            disabled={!canGo || working}
            onClick={() => onConfirmMove({
              replaces,
              force: needsConsent,
              allowOutsideHours: Boolean(check?.outsideHours),
            })}
          >
            {working ? <Loader2 size={16} className={styles.spin} /> : null}
            {conflicts.length > 0
              ? `Sposta ed elimina ${conflicts.map((c) => `«${c.title}»`).join(' e ')}`
              : check?.outsideHours ? 'Sposta lo stesso' : 'Sposta'}
          </button>
        </div>
      </div>
    </div>
  );
}
