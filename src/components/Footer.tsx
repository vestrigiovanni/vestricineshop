"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import styles from './Footer.module.css';

/**
 * L'ingresso al gestionale è un link a /admin: se non c'è la sessione, ci
 * pensa il proxy a chiedere la chiave. Prima qui c'erano una seconda finestra
 * di login e un pannello in overlay sopra la home.
 */
export default function Footer() {
  const [mounted, setMounted] = useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <footer className={`cabina-tokens ${styles.footer}`}>
      <div className={styles.container}>
        {mounted ? (
          <>
            <p suppressHydrationWarning>&copy; {new Date().getFullYear()} VESTRICINEMASHOP. Tutti i diritti riservati.</p>
            {/* Niente prefetch: il sito non deve precaricare per ogni visitatore una pagina protetta. */}
            <Link href="/admin" className={styles.adminButton} prefetch={false}>
              Admin
            </Link>
          </>
        ) : (
          <p>&copy; VESTRICINEMASHOP. Tutti i diritti riservati.</p>
        )}
      </div>
    </footer>
  );
}
