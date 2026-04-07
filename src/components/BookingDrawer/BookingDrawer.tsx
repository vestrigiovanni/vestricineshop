'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import styles from './BookingDrawer.module.css';
import BookingFlow from '../BookingFlow';

interface BookingDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  subeventId: number | null;
  movieTitle?: string;
}

export default function BookingDrawer({ isOpen, onClose, subeventId, movieTitle }: BookingDrawerProps) {
  useEffect(() => {
    // Prevent scrolling on the body when drawer is open
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      {/* Background Overlay with Blur */}
      <div 
        className={`${styles.drawerOverlay} ${isOpen ? styles.open : ''}`} 
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Centered Modal Container */}
      <div className={`${styles.drawerContainer} ${isOpen ? styles.open : ''}`}>
        <button 
          className={styles.closeButton} 
          onClick={onClose} 
          aria-label="Chiudi"
        >
          <X size={20} />
        </button>
        
        <div className={styles.drawerContent}>
          {/* Render context-aware booking flow */}
          {isOpen && (
            <BookingFlow subeventId={subeventId || undefined} />
          )}
        </div>
      </div>
    </>
  );
}
