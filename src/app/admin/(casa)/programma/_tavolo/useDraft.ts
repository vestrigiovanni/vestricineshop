'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { planningDropDraft, planningLoadDraft, planningSaveDraft } from '@/actions/planningActions';
import { emptyDraft, fromSaved, toSaved, type Draft } from './draft';

/**
 * La bozza della sala: si carica da sola e si salva un secondo dopo ogni
 * modifica. Il salvataggio è una rete, non il lavoro: se non riesce il tavolo
 * va avanti lo stesso.
 */
export function useDraft(roomId: number | null, from: string) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const loadedFor = useRef<number | null>(null);
  const dirty = useRef(false);
  const fromRef = useRef(from);
  useEffect(() => {
    fromRef.current = from;
  });

  useEffect(() => {
    if (roomId === null) return;
    let cancelled = false;
    loadedFor.current = null;
    dirty.current = false;
    planningLoadDraft(roomId)
      .then((saved) => {
        if (cancelled) return;
        setDraft((saved && fromSaved(saved)) || emptyDraft(fromRef.current));
        setSavedAt(saved?.updatedAt ?? null);
        loadedFor.current = roomId;
      })
      .catch(() => {
        if (cancelled) return;
        setDraft(emptyDraft(fromRef.current));
        loadedFor.current = roomId;
      });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  useEffect(() => {
    if (!draft || roomId === null || loadedFor.current !== roomId || !dirty.current) return;
    const timer = window.setTimeout(async () => {
      dirty.current = false;
      if (draft.shows.length === 0) await planningDropDraft(roomId).catch(() => null);
      else await planningSaveDraft(roomId, toSaved(draft)).catch(() => null);
      setSavedAt(new Date().toISOString());
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [draft, roomId]);

  const update = useCallback((change: (d: Draft) => Draft) => {
    dirty.current = true;
    setDraft((d) => (d ? change(d) : d));
  }, []);

  const discard = useCallback(async () => {
    if (roomId !== null) await planningDropDraft(roomId).catch(() => null);
    dirty.current = false;
    setDraft(emptyDraft(fromRef.current));
    setSavedAt(null);
  }, [roomId]);

  return { draft, savedAt, update, discard };
}
