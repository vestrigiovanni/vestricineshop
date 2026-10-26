"use client";

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import styles from './Footer.module.css';

/**
 * Il piede del sito pubblico: il logo della sala, come una firma in fondo
 * alla pagina, e sotto una riga sola. Fino al 26 ottobre 2026 era la scritta
 * "Vestri Cinema" in grande, in SF Pro: a Giovanni non piaceva.
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
        <Image src="/assets/vestri-cinema.png" alt="Vestri Cinema" width={437} height={373} className={styles.firma} />
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
