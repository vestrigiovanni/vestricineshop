'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, ReactNode } from 'react';

/**
 * Stato della rotazione automatica della hero.
 *
 * Prima esisteva solo `disableAutoScroll`, che spegneva la rotazione per
 * sempre al primo tocco: chi sfiorava lo schermo per sbaglio perdeva la
 * funzione senza modo di riattivarla. Ora ci sono due meccanismi distinti:
 *
 * - `suspend` — l'utente ha interagito (ha scelto un film, ha aperto la
 *   trama). La rotazione si ferma e riprende da sola dopo un periodo di
 *   inattività, così chi resta fermo sulla pagina torna a vedere il carosello.
 * - `hold` / `release` — un elemento occupa lo schermo (drawer di
 *   prenotazione, trailer a tutto schermo). Finché il blocco è attivo la
 *   rotazione non riparte, qualunque cosa faccia il timer di inattività.
 *   I blocchi sono identificati da una stringa, così chiamate ripetute non
 *   sbilanciano il conteggio.
 */

const IDLE_RESUME_MS = 45_000;

interface AutoScrollContextType {
  /** La rotazione può girare adesso? */
  isAutoScrollEnabled: boolean;
  /** Interazione dell'utente: sospende, poi riprende da sola. */
  suspendAutoScroll: () => void;
  /** Blocco esplicito finché `releaseAutoScroll` non viene chiamato. */
  holdAutoScroll: (reason: string) => void;
  releaseAutoScroll: (reason: string) => void;
}

const AutoScrollContext = createContext<AutoScrollContextType | undefined>(undefined);

export function AutoScrollProvider({ children }: { children: ReactNode }) {
  const [isSuspended, setIsSuspended] = useState(false);
  const [holds, setHolds] = useState<string[]>([]);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Chi ha chiesto meno animazioni al sistema operativo non deve vedere la
  // hero cambiare da sola.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setPrefersReducedMotion(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    return () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
  }, []);

  const suspendAutoScroll = useCallback(() => {
    setIsSuspended(true);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setIsSuspended(false), IDLE_RESUME_MS);
  }, []);

  const holdAutoScroll = useCallback((reason: string) => {
    setHolds(prev => (prev.includes(reason) ? prev : [...prev, reason]));
  }, []);

  const releaseAutoScroll = useCallback((reason: string) => {
    setHolds(prev => (prev.includes(reason) ? prev.filter(r => r !== reason) : prev));
  }, []);

  const value = useMemo<AutoScrollContextType>(() => ({
    isAutoScrollEnabled: !prefersReducedMotion && !isSuspended && holds.length === 0,
    suspendAutoScroll,
    holdAutoScroll,
    releaseAutoScroll,
  }), [prefersReducedMotion, isSuspended, holds, suspendAutoScroll, holdAutoScroll, releaseAutoScroll]);

  return (
    <AutoScrollContext.Provider value={value}>
      {children}
    </AutoScrollContext.Provider>
  );
}

export function useAutoScroll() {
  const context = useContext(AutoScrollContext);
  if (context === undefined) {
    throw new Error('useAutoScroll must be used within an AutoScrollProvider');
  }
  return context;
}
