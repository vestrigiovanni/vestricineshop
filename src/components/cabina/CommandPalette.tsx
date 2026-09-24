'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminClearCache } from '@/actions/adminActions';
import { logoutAdmin } from '@/actions/authActions';
import Dialog from './Dialog';
import { useToast } from './Toast';
import { rankCommands, type Command } from './commandIndex';
import { ADMIN_COMMANDS } from './commands';
import { ROOMS } from './rooms';
import styles from './CommandPalette.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CommandPalette({ open, onClose }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);

  const results = useMemo(() => rankCommands(query, ADMIN_COMMANDS), [query]);
  const current = Math.min(selected, Math.max(results.length - 1, 0));

  const close = () => {
    setQuery('');
    setSelected(0);
    onClose();
  };

  const run = async (cmd: Command) => {
    close();
    if (cmd.kind === 'stanza') {
      const room = ROOMS.find((r) => `stanza:${r.key}` === cmd.id);
      if (room) router.push(room.href);
      return;
    }
    switch (cmd.id) {
      case 'azione:svuota-cache':
        try {
          await adminClearCache();
          toast('Cache svuotata: Pretix si rilegge alla prossima visita.', 'ok');
        } catch {
          toast('Non sono riuscito a svuotare la cache.', 'alarm');
        }
        break;
      case 'azione:display':
        window.open('/display-esterno', '_blank', 'noopener');
        break;
      case 'azione:sito':
        router.push('/');
        break;
      case 'azione:esci':
        await logoutAdmin();
        router.push('/admin/login');
        router.refresh();
        break;
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((current + 1) % Math.max(results.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((current - 1 + results.length) % Math.max(results.length, 1));
    } else if (e.key === 'Enter' && results[current]) {
      e.preventDefault();
      void run(results[current]);
    }
  };

  return (
    <Dialog open={open} onClose={close} title="Cerca o vai a…" variant="palette">
      <input
        className={styles.input}
        placeholder="Cerca una stanza o un'azione…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelected(0);
        }}
        onKeyDown={onKeyDown}
        aria-label="Cerca"
        aria-controls="cabina-palette-risultati"
        aria-activedescendant={results[current] ? `palette-${results[current].id}` : undefined}
      />
      <ul id="cabina-palette-risultati" role="listbox" className={styles.list}>
        {results.length === 0 && <li className={styles.empty}>Niente con questo nome.</li>}
        {results.map((cmd, i) => (
          <li
            key={cmd.id}
            id={`palette-${cmd.id}`}
            role="option"
            aria-selected={i === current}
            className={styles.item}
            onMouseEnter={() => setSelected(i)}
            onClick={() => void run(cmd)}
          >
            <span className={styles.label}>{cmd.label}</span>
            <span className={styles.hint}>{cmd.hint ?? (cmd.kind === 'stanza' ? 'Stanza' : 'Azione')}</span>
          </li>
        ))}
      </ul>
      <div className={styles.foot}>
        <span>↑↓ scegli</span>
        <span>↵ apri</span>
        <span>esc chiudi</span>
      </div>
    </Dialog>
  );
}
