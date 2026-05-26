"use client";

import React, { useState } from 'react';
import styles from './Footer.module.css';
import AdminOverlay from './Admin/AdminOverlay';
import { loginAdmin, checkAdminSession } from '@/actions/authActions';

export default function Footer() {
  const [mounted, setMounted] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const handleAdminClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    const hasSession = await checkAdminSession();
    if (hasSession) {
      setIsAdminAuthenticated(true);
    } else {
      setIsModalOpen(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      const res = await loginAdmin(password);
      if (res.success) {
        setIsAdminAuthenticated(true);
        setIsModalOpen(false);
        setPassword('');
      } else {
        setError(res.error || 'Password non corretta.');
      }
    } catch (err) {
      setError('Errore durante la verifica della password.');
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setPassword('');
    setError('');
  };

  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        {mounted ? (
          <>
            <p suppressHydrationWarning>&copy; {new Date().getFullYear()} VESTRICINEMASHOP. Tutti i diritti riservati.</p>
            <button onClick={handleAdminClick} className={styles.adminButton}>
              Admin
            </button>
          </>
        ) : (
          <p>&copy; VESTRICINEMASHOP. Tutti i diritti riservati.</p>
        )}
      </div>

      {isModalOpen && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2>Accesso Riservato</h2>
            <p>Inserisci la chiave di sicurezza per accedere al pannello di controllo.</p>
            <form onSubmit={handleSubmit}>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                className={styles.input}
              />
              {error && <p className={styles.error}>{error}</p>}
              <div className={styles.actions}>
                <button type="button" onClick={closeModal} className={styles.cancelButton}>Annulla</button>
                <button type="submit" className={styles.submitButton}>Accedi</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAdminAuthenticated && (
        <AdminOverlay onClose={() => setIsAdminAuthenticated(false)} />
      )}
    </footer>
  );
}
