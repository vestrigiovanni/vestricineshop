"use client";

import React, { useState } from 'react';
import styles from './Footer.module.css';
import AdminOverlay from './Admin/AdminOverlay';

export default function Footer() {
  const [mounted, setMounted] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const handleAdminClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (password === '121212') {
      setIsAdminAuthenticated(true);
      setIsModalOpen(false);
      setPassword('');
    } else {
      setError('Password non corretta.');
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
        <p suppressHydrationWarning>&copy; {new Date().getFullYear()} VESTRICINEMASHOP. Tutti i diritti riservati.</p>
        <button onClick={handleAdminClick} className={styles.adminButton}>
          Admin
        </button>
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
