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
