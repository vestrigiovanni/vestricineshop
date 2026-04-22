'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import styles from './AgeVerificationModal.module.css';

interface AgeVerificationModalProps {
  onConfirm: () => void;
}

export default function AgeVerificationModal({ onConfirm }: AgeVerificationModalProps) {
  const router = useRouter();

  const handleConfirm = () => {
    onConfirm();
  };

  const handleReject = () => {
    window.location.href = '/';
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.iconWrapper}>
          <AlertCircle size={48} />
        </div>
        
        <h2 className={styles.title}>Verifica Età</h2>
        
        <p className={styles.message}>
          ⚠️ ATTENZIONE: Stai acquistando un biglietto per un film vietato ai minori di 18 anni.
          <br /><br />
          Per procedere, devi confermare di avere almeno 18 anni compiuti.
        </p>
        
        <div className={styles.actions}>
          <button className={styles.confirmBtn} onClick={handleConfirm}>
            Sono maggiorenne
          </button>
          <button className={styles.rejectBtn} onClick={handleReject}>
            Non sono maggiorenne
          </button>
        </div>
      </div>
    </div>
  );
}
