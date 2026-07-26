'use client';

/**
 * PASSO 4 — IN SALA.
 *
 * Il resoconto degli errori è per spettacolo e non per lotto, e il riprova
 * rifà **solo i falliti**: rilanciare l'intero piano creerebbe doppioni di
 * tutto ciò che era già andato a buon fine.
 */

import React from 'react';
import { Check, CalendarCheck, Loader2, RotateCcw, TriangleAlert, Wand2 } from 'lucide-react';
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
}

export default function StepCommit({ running, progress, created, failures, onRetry, onRestart }: Props) {
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const done = !running;

  return (
    <main className={styles.stepBody}>
      <section className={styles.runCard}>
        <h2>
          {running ? <><Loader2 size={20} className={styles.spin} /> Sto creando gli spettacoli…</> : '🍿 Programmazione in sala'}
        </h2>

        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${pct}%` }} />
        </div>
        <p className={styles.progressStep}>{progress.step} · {pct}%</p>

        {running && (
          <p className={styles.runNote}>
            Gli spettacoli vengono creati uno alla volta: Pretix non gradisce le richieste in parallelo,
            ed è la ragione per cui questa schermata non è istantanea. Non chiudere la pagina.
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
              <a className={failures.length > 0 ? styles.ghostBtn : styles.ctaBtn} href="/admin">
                {failures.length > 0 ? <Check size={16} /> : <CalendarCheck size={18} />} Torna all&apos;admin
              </a>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
