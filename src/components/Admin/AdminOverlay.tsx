'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
const AdminPanel = dynamic(() => import('./AdminPanel'), { ssr: false });
import { adminListEvents } from '@/actions/adminActions';
import { X, Loader2 } from 'lucide-react';
import styles from './AdminOverlay.module.css';

interface AdminOverlayProps {
  onClose: () => void;
}

export default function AdminOverlay({ onClose }: AdminOverlayProps) {
  const [initialEvents, setInitialEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminListEvents().then((events) => {
      setInitialEvents(events || []);
      setLoading(false);
    }).catch((err) => {
      console.error(err);
      setLoading(false);
    });
  }, []);

  return (
    <div className={styles.overlay}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          Pannello Amministratore VESTRICINEMASHOP
        </div>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Chiudi Pannello">
          <X size={24} />
        </button>
      </div>
      <div className={styles.content}>
        {loading ? (
          <div className={styles.loaderContainer}>
            <Loader2 className={styles.spinner} size={48} />
            <p>Caricamento eventi...</p>
          </div>
        ) : (
          <AdminPanel initialEvents={initialEvents} />
        )}
      </div>
    </div>
  );
}
