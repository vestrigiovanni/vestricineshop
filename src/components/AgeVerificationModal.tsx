'use client';

import styles from './AgeVerificationModal.module.css';

interface AgeVerificationModalProps {
  onConfirm: () => void;
}

/**
 * Per gli spettacoli 18+ o VM18 (vedi `isVM18`): un sì o un no, niente di più.
 * "Annulla" torna alla home, come prima.
 */
export default function AgeVerificationModal({ onConfirm }: AgeVerificationModalProps) {
  return (
    <div className={styles.overlay} role="alertdialog" aria-modal="true" aria-labelledby="age-title" aria-describedby="age-text">
      <div className={styles.modal}>
        <p className={styles.kicker}>Vietato ai minori di 18 anni</p>
        <h2 id="age-title" className={styles.title}>Hai compiuto 18 anni?</h2>
        <p id="age-text" className={styles.message}>Per prenotare questo film serve la maggiore età.</p>
        <div className={styles.actions}>
          <button type="button" className={styles.rejectBtn} onClick={() => { window.location.href = '/'; }}>
            Annulla
          </button>
          <button type="button" className={styles.confirmBtn} onClick={onConfirm}>
            Sì, confermo
          </button>
        </div>
      </div>
    </div>
  );
}
