'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * "Adesso" invecchia: se lo schermo resta acceso, ogni minuto si rilegge la
 * stanza dal server. Solo con la scheda visibile, per non lavorare a vuoto.
 */
export default function AutoRefresh({ everyMs = 60_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, everyMs);
    return () => window.clearInterval(id);
  }, [router, everyMs]);
  return null;
}
