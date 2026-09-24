'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminClearCache, adminGetProgrammedMovies } from '@/actions/adminActions';
import { logoutAdmin } from '@/actions/authActions';
import Dialog from './Dialog';
import { useToast } from './Toast';
import { rankCommands, type Command } from './commandIndex';
import { ADMIN_COMMANDS, dynamicCommands, type ProgrammedLike } from './commands';
import { ROOMS } from './rooms';
import styles from './CommandPalette.module.css';

const KIND_LABEL: Record<Command['kind'], string> = { stanza: 'Stanza', azione: 'Azione', film: 'Film', spettacolo: 'Spettacolo' };

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CommandPalette({ open, onClose }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  /** Film e spettacoli: si leggono la prima volta che la ricerca si apre. */
  const [extra, setExtra] = useState<Command[] | null>(null);

  useEffect(() => {
    if (!open || extra !== null) return;
    let cancelled = false;
    adminGetProgrammedMovies()
      .then((list) => {
        if (!cancelled) setExtra(dynamicCommands(list as unknown as ProgrammedLike[], Date.now()));
      })
      .catch(() => {
        if (!cancelled) setExtra([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, extra]);

  // A ricerca vuota solo stanze e azioni; scrivendo entrano anche film e spettacoli.
  const results = useMemo(
    () => (query.trim() ? rankCommands(query, [...ADMIN_COMMANDS, ...(extra ?? [])]).slice(0, 12) : ADMIN_COMMANDS),
    [query, extra],
  );
  const current = Math.min(selected, Math.max(results.length - 1, 0));

  const close = () => {
    setQuery('');
    setSelected(0);
    onClose();
  };

  const run = async (cmd: Command) => {
    close();
    if (cmd.href) {
      if (/^https?:\/\//.test(cmd.href)) window.open(cmd.href, '_blank', 'noopener');
      else router.push(cmd.href);
      return;
    }
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
        placeholder="Una stanza, un'azione, un film, uno spettacolo…"
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
            <span className={styles.hint}>{cmd.hint ?? KIND_LABEL[cmd.kind]}</span>
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
