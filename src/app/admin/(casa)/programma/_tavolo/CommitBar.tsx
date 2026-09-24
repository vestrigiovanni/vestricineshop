'use client';

import { useMemo, useState } from 'react';
import Button from '@/components/cabina/Button';
import Dialog from '@/components/cabina/Dialog';
import { projectionSpecLabels } from '@/constants/projectionSpecs';
import { romeClock } from '@/services/scheduling/rome';
import { commitPayload, type Draft } from './draft';
import { dayShort } from './labels';
import type { CommitApi } from './useCommit';
import styles from './CommitBar.module.css';

interface Props {
  draft: Draft;
  savedAt: string | null;
  commit: CommitApi;
  onDiscard: () => void;
}

export default function CommitBar({ draft, savedAt, commit, onDiscard }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const payload = useMemo(() => commitPayload(draft), [draft]);
  const replacing = Object.values(draft.replacements).filter((r) => r.replaces.length > 0);
  const soldAtRisk = replacing.reduce((n, r) => n + r.soldTickets, 0);

  const byDay = useMemo(() => {
    const map = new Map<string, typeof payload>();
    for (const s of payload) map.set(s.date, [...(map.get(s.date) ?? []), s]);
    return [...map.entries()];
  }, [payload]);

  const n = draft.shows.length;
  const running = commit.phase === 'running';

  return (
    <>
      {n > 0 && (
        <div className={styles.bar}>
          <span className={styles.status}>
            <b>{n} in bozza</b>
            <span>{savedAt ? ` · salvata alle ${romeClock(new Date(savedAt))}` : ' · non ancora salvata'}</span>
            {replacing.length > 0 && <span className={styles.warn}> · {replacing.length} sostituzioni</span>}
          </span>
          <span className={styles.actions}>
            <Button variant="ghost" onClick={() => setDiscardOpen(true)} disabled={running}>Annulla bozza</Button>
            <Button variant="fill" onClick={() => setConfirmOpen(true)} disabled={running}>Manda in sala →</Button>
          </span>
        </div>
      )}

      {confirmOpen && (
        <Dialog open onClose={() => setConfirmOpen(false)} title={`Mandare in sala ${n} spettacoli?`} showTitle>
          <p className={styles.text}>Si creano su Pretix e compaiono subito sul sito, con la vendita aperta.</p>
          <div className={styles.summary}>
            {byDay.map(([date, shows]) => (
              <div key={date}>
                <p className={styles.day}>{dayShort(date)}</p>
                <ul>
                  {shows.map((s) => (
                    <li key={`${s.tmdbId}@${s.time}`}>
                      <span className={styles.time}>{s.time}</span> {s.title}
                      {s.specs && <em> · {projectionSpecLabels(s.specs, s.specsNote).join(' · ')}</em>}
                      {s.replaces && <em className={styles.warn}> · sostituisce</em>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {replacing.length > 0 && (
            <p className={styles.alarm}>
              {replacing.length === 1 ? 'Uno spettacolo in sala verrà eliminato' : `${replacing.length} spettacoli in sala verranno eliminati`} per fare posto
              {soldAtRisk > 0 ? `, con ${soldAtRisk} biglietti venduti da rimborsare a mano su Pretix` : ''}.
            </p>
          )}
          <div className={styles.dialogActions}>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Non ancora</Button>
            <Button
              variant="fill"
              onClick={() => {
                setConfirmOpen(false);
                void commit.start(payload);
              }}
            >
              Crea {n} spettacoli su Pretix
            </Button>
          </div>
        </Dialog>
      )}

      {commit.phase !== 'idle' && (
        <Dialog open onClose={() => { if (!running) commit.close(); }} title="In sala" showTitle={false}>
          <h2 className={styles.progressTitle}>
            {running ? 'Mando in sala…' : commit.failures.length ? 'Finito, con qualche intoppo' : 'In sala'}
          </h2>
          <div className={styles.progress}>
            <span style={{ width: `${Math.round((commit.progress.done / Math.max(commit.progress.total, 1)) * 100)}%` }} />
          </div>
          <p className={styles.text}>
            {running ? commit.progress.step : `${commit.created} ${commit.created === 1 ? 'spettacolo creato' : 'spettacoli creati'}.`}
          </p>
          {running && <p className={styles.hint}>Puoi anche chiudere il portatile: alla riapertura riprendo da dove ero.</p>}
          {commit.failures.length > 0 && (
            <ul className={styles.failures}>
              {commit.failures.map((f) => (
                <li key={f.key}><b>{f.label}</b> — {f.error}</li>
              ))}
            </ul>
          )}
          {!running && (
            <div className={styles.dialogActions}>
              {commit.failures.length > 0 && <Button variant="outline" onClick={() => void commit.retry()}>Riprova i falliti</Button>}
              <Button variant="fill" onClick={commit.close}>Chiudi</Button>
            </div>
          )}
        </Dialog>
      )}

      {commit.resumeOffer && commit.phase === 'idle' && (
        <Dialog open onClose={commit.declineResume} title="Una creazione rimasta a metà" showTitle>
          <p className={styles.text}>
            {commit.resumeOffer.done} spettacoli su {commit.resumeOffer.total} sono già in sala, ne mancano{' '}
            {commit.resumeOffer.total - commit.resumeOffer.done}. La riprendo da dove era? Quelli già creati non verranno rifatti.
          </p>
          <div className={styles.dialogActions}>
            <Button variant="ghost" onClick={commit.declineResume}>Lascia stare</Button>
            <Button variant="fill" onClick={commit.acceptResume}>Riprendi</Button>
          </div>
        </Dialog>
      )}

      {discardOpen && (
        <Dialog open onClose={() => setDiscardOpen(false)} title="Buttare la bozza?" showTitle>
          <p className={styles.text}>
            {n} {n === 1 ? 'spettacolo che non è ancora in sala sparisce' : 'spettacoli che non sono ancora in sala spariscono'}. Quello che è già su Pretix non si tocca.
          </p>
          <div className={styles.dialogActions}>
            <Button variant="ghost" onClick={() => setDiscardOpen(false)}>Tienila</Button>
            <Button variant="alarm" onClick={() => { setDiscardOpen(false); onDiscard(); }}>Butta la bozza</Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
