'use client';

import { useEffect, type RefObject } from 'react';
import { prefersMotion } from './shared';

/** Oltre questa mediana (millisecondi tra un fotogramma e l'altro, scorrendo) la pagina si alleggerisce. */
const LENTO = 30;
/** Quanti fotogrammi di scorrimento per ogni giudizio: un secondo e mezzo, sui computer lenti. */
const CAMPIONI = 24;
const CHIAVE = 'vestri-leggero';

/**
 * La home si alleggerisce da sola sui computer che non tengono il passo.
 *
 * Il 27 ottobre 2026 il Firefox di Giovanni aveva l'accelerazione hardware
 * spenta: disegna col processore, e lì costa ogni cosa che si muove (con la
 * scheda grafica la pagina fa 60 fotogrammi al secondo, così uno ogni 49 ms).
 * Mentre si scorre si misura il passo dei fotogrammi; se la mediana supera
 * LENTO, la home prende `data-leggero` e i CSS spengono quello che pesa: la
 * sfocatura della barra, le sfumature della luce d'ambiente e di "Oggi", le
 * entrate a tempo, l'apertura e il trailer che seguono lo scorrimento.
 * Vale per la sessione: alla visita dopo si riprova da capo.
 */
export function useLeggero(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el || !prefersMotion()) return;
    try {
      if (sessionStorage.getItem(CHIAVE) === '1') { el.dataset.leggero = ''; return; }
    } catch {}

    const passi: number[] = [];
    let pronto = false, raf = 0, prima = 0, ultimo = 0;
    const passo = (ora: number) => {
      raf = 0;
      // Fermo: si smette di contare, il passo di una pagina ferma non dice niente.
      if (performance.now() - ultimo > 150) { prima = 0; return; }
      if (prima) passi.push(ora - prima);
      prima = ora;
      if (passi.length >= CAMPIONI) {
        const mediana = [...passi].sort((a, b) => a - b)[passi.length >> 1];
        passi.length = 0;
        if (mediana > LENTO) {
          el.dataset.leggero = '';
          try { sessionStorage.setItem(CHIAVE, '1'); } catch {}
          smetti();
          return;
        }
      }
      raf = requestAnimationFrame(passo);
    };
    const scorre = () => {
      ultimo = performance.now();
      if (pronto && !raf) raf = requestAnimationFrame(passo);
    };
    // I primi secondi non contano: immagini, idratazione e motore li fanno lenti dappertutto.
    const attesa = window.setTimeout(() => { pronto = true; }, 2500);
    const smetti = () => {
      removeEventListener('scroll', scorre);
      cancelAnimationFrame(raf);
      clearTimeout(attesa);
    };
    addEventListener('scroll', scorre, { passive: true });
    return smetti;
  }, [root]);
}
