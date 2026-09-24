'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  planningCommitRetry,
  planningCommitStart,
  planningCommitStatus,
  planningCommitTick,
  planningFindOpenCommit,
} from '@/actions/planningActions';
import type { CommitShowPayload } from './draft';

/** Lo stesso filo del wizard: una creazione avviata lì si riprende qui. */
const JOB_KEY = 'programmazione:job';
const SENT_KEY = 'programmazione:job:sent';

export interface CommitFailure {
  key: string;
  label: string;
  error: string;
}

export type CommitPhase = 'idle' | 'running' | 'done';

function remember(id: string | null, sent?: string[]) {
  try {
    if (id) {
      localStorage.setItem(JOB_KEY, id);
      if (sent) localStorage.setItem(SENT_KEY, JSON.stringify({ id, sent }));
    } else {
      localStorage.removeItem(JOB_KEY);
      localStorage.removeItem(SENT_KEY);
    }
  } catch {
    /* archivio del browser non disponibile: la ripresa passerà dalla sala */
  }
}

function recall(): { id: string | null; sent: string[] | null } {
  try {
    const id = localStorage.getItem(JOB_KEY);
    const raw = localStorage.getItem(SENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as { id: string; sent: string[] }) : null;
    return { id, sent: parsed && parsed.id === id ? parsed.sent : null };
  } catch {
    return { id: null, sent: null };
  }
}

function keyOf(s: CommitShowPayload): string {
  return `${s.tmdbId}@${s.date}T${s.time}`;
}

/**
 * La creazione in sala. Nessuno la porta avanti in sottofondo: ogni giro è un
 * lotto vero, fatto da chi guarda la barra. Ripetere è sicuro, perché il
 * lavoro sa già cosa ha creato.
 *
 * `onCreated` riceve le chiavi degli spettacoli **mandati da qui** e creati
 * davvero. Se il lavoro è stato avviato altrove non le conosciamo, e allora non
 * si tocca la bozza: meglio uno spettacolo da togliere a mano che uno perso.
 */
export function useCommit(roomId: number | null, onCreated: (keys: Set<string>) => void) {
  const [phase, setPhase] = useState<CommitPhase>('idle');
  const [progress, setProgress] = useState({ step: '', done: 0, total: 1 });
  const [created, setCreated] = useState(0);
  const [failures, setFailures] = useState<CommitFailure[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [resumeOffer, setResumeOffer] = useState<{ id: string; done: number; total: number } | null>(null);
  const sentKeys = useRef<string[] | null>(null);
  const createdCallback = useRef(onCreated);
  useEffect(() => {
    createdCallback.current = onCreated;
  });

  const follow = useCallback(async (id: string) => {
    setPhase('running');
    setJobId(id);
    try {
      for (;;) {
        const job = await planningCommitTick(id);
        if (!job) {
          setProgress({ step: 'Non trovo più questo lavoro: ricontrolla la sala.', done: 1, total: 1 });
          remember(null);
          break;
        }
        setProgress({ step: job.step, done: job.done, total: job.total });
        setCreated(job.created.length);
        setFailures(job.errors);
        if (job.state === 'done' || job.state === 'error') {
          remember(null);
          if (sentKeys.current) {
            const failed = new Set(job.errors.map((e) => e.key));
            createdCallback.current(new Set(sentKeys.current.filter((k) => !failed.has(k))));
          }
          break;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
    } catch (e) {
      setFailures((prev) => [...prev, { key: 'tick', label: 'Avanzamento della creazione', error: String(e) }]);
    } finally {
      setPhase('done');
    }
  }, []);

  const start = useCallback(
    async (shows: CommitShowPayload[]) => {
      if (roomId === null || shows.length === 0) return;
      setFailures([]);
      setCreated(0);
      setProgress({ step: 'Registro il piano…', done: 0, total: shows.length });
      setPhase('running');
      try {
        const { jobId: id } = await planningCommitStart({ seatingPlanId: roomId, shows });
        sentKeys.current = shows.map(keyOf);
        remember(id, sentKeys.current);
        await follow(id);
      } catch (e) {
        setFailures([{ key: 'start', label: 'Avvio della creazione', error: String(e) }]);
        setPhase('done');
      }
    },
    [roomId, follow],
  );

  const retry = useCallback(async () => {
    if (!jobId) return;
    await planningCommitRetry(jobId);
    remember(jobId, sentKeys.current ?? undefined);
    await follow(jobId);
  }, [jobId, follow]);

  const close = useCallback(() => {
    setPhase('idle');
    setFailures([]);
    setCreated(0);
    setJobId(null);
    sentKeys.current = null;
  }, []);

  useEffect(() => {
    if (roomId === null) return;
    let cancelled = false;
    (async () => {
      const stored = recall();
      let id = stored.id;
      if (!id) id = await planningFindOpenCommit(roomId).catch(() => null);
      if (!id || cancelled) return;
      const job = await planningCommitStatus(id).catch(() => null);
      if (cancelled) return;
      if (!job || job.state === 'done' || job.state === 'error') {
        remember(null);
        return;
      }
      sentKeys.current = stored.id === id ? stored.sent : null;
      setResumeOffer({ id, done: job.done, total: job.total });
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  const acceptResume = useCallback(() => {
    if (!resumeOffer) return;
    const id = resumeOffer.id;
    setResumeOffer(null);
    void follow(id);
  }, [resumeOffer, follow]);

  const declineResume = useCallback(() => {
    remember(null);
    sentKeys.current = null;
    setResumeOffer(null);
  }, []);

  return { phase, progress, created, failures, resumeOffer, start, retry, close, acceptResume, declineResume };
}

export type CommitApi = ReturnType<typeof useCommit>;
