'use client';

import { useEffect, type RefObject } from 'react';
import type { ScrollCraftApi } from '@/vendor/scrollcraft/scrollcraft.d';

/**
 * Monta il motore di scroll-craft sulla home, dopo l'idratazione (tocca il DOM
 * e legge `window`). Il motore non sostituisce lo scorrimento del browser:
 * fissa gli atti con `position: sticky` e pubblica `--sc-p`, il progresso di
 * ogni atto, che i nostri CSS leggono. Su Firefox resta tutto nativo.
 *
 * Il motore misura gli atti una volta; quando le immagini arrivano e la pagina
 * cambia altezza, qui gli si chiede di rimisurare.
 */
export function useMotore(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let api: ScrollCraftApi | null = null;
    let vivo = true;
    let raf = 0;
    const rimisura = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => api?.layout()); };
    const ro = new ResizeObserver(rimisura);
    import('@/vendor/scrollcraft/scrollcraft.js').then(() => {
      if (!vivo || !window.ScrollCraft) return;
      api = window.ScrollCraft.mount(el);
      ro.observe(el);
      addEventListener('load', rimisura);
    });
    return () => {
      vivo = false;
      ro.disconnect();
      removeEventListener('load', rimisura);
      cancelAnimationFrame(raf);
      api?.destroy();
    };
  }, [root]);
}

/**
 * Il progresso di un atto fissato (0–1), quello che il motore pubblica in
 * `--sc-p`. Lo si prende dal motore, che l'ha già calcolato: chiederlo alla
 * pagina (`getBoundingClientRect`) obbligherebbe Firefox a ricalcolare gli
 * stili e la disposizione a metà dello scorrimento.
 */
export function progresso(atto: HTMLElement): number {
  const a = window.ScrollCraft?.instances[0]?.acts.find(x => x.el === atto);
  if (a) return a.p;
  const r = atto.getBoundingClientRect();
  return Math.min(1, Math.max(0, -r.top / Math.max(r.height - innerHeight, 1)));
}
