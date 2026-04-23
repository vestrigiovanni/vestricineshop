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
        <h2 className={styles.title}>Verifica Età</h2>
        
        <p className={styles.message}>
          Questo film è vietato ai minori di 18 anni. <br />
          Si prega di confermare la maggiore età per procedere all'acquisto.
        </p>
        
        <div className={styles.actions}>
          <button className={styles.confirmBtn} onClick={handleConfirm}>
            CONFERMO
          </button>
          <button className={styles.rejectBtn} onClick={handleReject}>
            ANNULLA
          </button>
        </div>
      </div>
    </div>
  );
}
