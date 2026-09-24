'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminSyncSoldOutStatus } from '@/actions/adminActions';
import Button from '@/components/cabina/Button';
import { useToast } from '@/components/cabina/Toast';

export default function SyncSeatsButton({ label }: { label: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const res = await adminSyncSoldOutStatus();
      toast(`Posti riletti da Pretix: ${res.count} spettacoli aggiornati.`, 'ok');
      router.refresh();
    } catch {
      toast('Pretix non ha risposto. Riprova fra poco.', 'alarm');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" onClick={run} disabled={busy}>
      {busy ? 'Rileggo…' : label}
    </Button>
  );
}
