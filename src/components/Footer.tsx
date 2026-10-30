"use client";

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import styles from './Footer.module.css';

/**
 * Il piede del sito pubblico: una riga sola, col logo della sala piccolo in
 * testa. Fino al 26 ottobre 2026 era la scritta "Vestri Cinema" in grande, in
 * SF Pro; poi il logo grande al centro, e il 30 ottobre Giovanni l'ha trovato
 * troppo grosso, piede compreso.
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
      <div className={styles.riga}>
        <Image src="/assets/vestri-cinema.png" alt="Vestri Cinema" width={437} height={373} className={styles.firma} />
        <p className={styles.anno}>&copy; {anno ?? ''} Vestri Cinema</p>
        <button type="button" className={styles.su} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Torna su ↑</button>
        {/* Niente prefetch: il sito non deve precaricare per ogni visitatore una pagina protetta. */}
        <Link href="/admin" className={styles.adminButton} prefetch={false}>
          Admin
        </Link>
      </div>
    </footer>
  );
}
