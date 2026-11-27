'use client';

import { useEffect } from 'react';
import type { ScrollCraftApi } from '@/vendor/scrollcraft/scrollcraft.d';

/**
 * Monta il motore scroll-craft sulla Home dopo l'idratazione. Non rifà lo
 * scorrimento del browser: fissa gli atti con `position: sticky`, pubblica il
 * loro progresso in `--sc-p` e fa entrare una volta gli elementi `data-sc-in`.
 * Quando le immagini arrivano e la pagina cambia altezza, rimisura.
 */
export default function Motore({ radice }: { radice: string }) {
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(radice);
    if (!el) return;
    let api: ScrollCraftApi | null = null;
    let vivo = true, raf = 0;
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
  }, [radice]);
  return null;
}
