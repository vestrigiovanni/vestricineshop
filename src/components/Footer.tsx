"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import styles from './Footer.module.css';

/**
 * Il piede del sito pubblico: il nome della sala in grande, come una
 * firma in fondo alla pagina, e sotto una riga sola.
 *
 * L'ingresso al gestionale è un link a /admin: se non c'è la sessione, ci
 * pensa il proxy a chiedere la chiave.
 */
export default function Footer() {
  const [anno, setAnno] = useState<number | null>(null);

  React.useEffect(() => {
    setAnno(new Date().getFullYear());
  }, []);

  return (
    <footer className={`cabina-tokens ${styles.footer}`}>
      <div className={styles.container}>
        <p className={styles.firma} aria-hidden>Vestri Cinema</p>
        <div className={styles.riga}>
          <p>&copy; {anno ?? ''} Vestri Cinema</p>
          <button type="button" className={styles.su} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Torna su ↑</button>
          {/* Niente prefetch: il sito non deve precaricare per ogni visitatore una pagina protetta. */}
          <Link href="/admin" className={styles.adminButton} prefetch={false}>
            Admin
          </Link>
        </div>
      </div>
    </footer>
  );
}
