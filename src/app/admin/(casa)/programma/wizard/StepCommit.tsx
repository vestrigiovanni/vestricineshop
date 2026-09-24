'use client';

/**
 * PASSO 4 — IN SALA.
 *
 * Il resoconto degli errori è per spettacolo e non per lotto, e il riprova
 * rifà **solo i falliti**: rilanciare l'intero piano creerebbe doppioni di
 * tutto ciò che era già andato a buon fine.
 *
 * La creazione non vive più in questa pagina. Ogni spettacolo è una riga su
 * database e questa schermata la fa avanzare un lotto per volta: chiudere il
 * portatile, perdere il wifi o ricaricare non annulla niente — al ritorno la
 * pagina ritrova il lavoro dov'era e riprende. È il motivo per cui qui non c'è
 * più scritto "non chiudere la pagina".
 */

import React from 'react';
import { Check, CalendarCheck, Loader2, RotateCcw, ShieldCheck, TriangleAlert, Wand2 } from 'lucide-react';
import styles from './Programmazione.module.css';

export interface CommitProgress {
  step: string;
  done: number;
  total: number;
}

export interface CommitFailure {
  key: string;
  label: string;
  error: string;
}

interface Props {
  running: boolean;
  progress: CommitProgress;
  created: number;
  failures: CommitFailure[];
  onRetry: () => void;
  onRestart: () => void;
  /** Il lavoro è stato ritrovato e ripreso invece che avviato adesso. */
  resumed?: boolean;
}

export default function StepCommit({
  running, progress, created, failures, onRetry, onRestart, resumed,
}: Props) {
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const done = !running;

  return (
    <main className={styles.stepBody}>
      <section className={styles.runCard}>
        <h2>
          {running
            ? <><Loader2 size={20} className={styles.spin} /> {resumed ? 'Riprendo da dove eravamo…' : 'Sto creando gli spettacoli…'}</>
            : '🍿 Programmazione in sala'}
        </h2>

        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${pct}%` }} />
        </div>
        <p className={styles.progressStep}>
          {progress.step} · {progress.done}/{progress.total} · {pct}%
        </p>

        {running && (
          <p className={styles.runNote}>
            <ShieldCheck size={14} /> Puoi chiudere la pagina: ogni spettacolo è già scritto come
            impegno sul database, e riaprendo la programmazione il lavoro riparte da qui.
            Nessuno spettacolo può essere creato due volte.
          </p>
        )}

        {done && (
          <>
            <div className={styles.doneSummary}>
              Creati <b>{created}</b> spettacol{created === 1 ? 'o' : 'i'}
              {failures.length > 0
                ? <> · <span className={styles.doneErrors}>{failures.length} non riuscit{failures.length === 1 ? 'o' : 'i'}</span></>
                : ' senza errori.'}
            </div>

            {failures.length > 0 && (
              <>
                <div className={styles.errorList}>
                  {failures.map((f) => (
                    <div key={f.key}>
                      <TriangleAlert size={13} />
                      <b>{f.label}</b> — {f.error}
                    </div>
                  ))}
                </div>
                <p className={styles.runNote}>
                  Il riprova rifà solo questi: quelli già creati restano dove sono.
                </p>
              </>
            )}

            <div className={styles.doneActions}>
              {failures.length > 0 && (
                <button className={styles.ctaBtn} onClick={onRetry}>
                  <RotateCcw size={18} /> Riprova i {failures.length} falliti
                </button>
              )}
              <button className={styles.ghostBtn} onClick={onRestart}>
                <Wand2 size={16} /> Programma altro
              </button>
              <a className={failures.length > 0 ? styles.ghostBtn : styles.ctaBtn} href="/admin/programma">
                {failures.length > 0 ? <Check size={16} /> : <CalendarCheck size={18} />} Torna all&apos;admin
              </a>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
