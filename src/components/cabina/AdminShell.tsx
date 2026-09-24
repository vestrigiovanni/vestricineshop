'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { CalendarRange, Ellipsis, ExternalLink, Film, LogOut, Search, Sunrise, Ticket } from 'lucide-react';
import { logoutAdmin } from '@/actions/authActions';
import CommandPalette from './CommandPalette';
import Dialog from './Dialog';
import { ROOMS, activeRoom, isCompactRoom, type RoomKey } from './rooms';
import styles from './AdminShell.module.css';

const ICONS: Record<RoomKey, React.ComponentType<{ size?: number }>> = {
  oggi: Sunrise,
  programma: CalendarRange,
  film: Film,
  cassa: Ticket,
};

const noSubscribe = () => () => {};

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/admin';
  const router = useRouter();
  const current = activeRoom(pathname);
  const compact = isCompactRoom(pathname);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // Sul server non si sa che computer c'è: si scrive ⌘K e si corregge dopo l'idratazione.
  const shortcut = useSyncExternalStore(
    noSubscribe,
    () => (/Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘K' : 'Ctrl K'),
    () => '⌘K',
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const logout = async () => {
    setMoreOpen(false);
    await logoutAdmin();
    router.push('/admin/login');
    router.refresh();
  };

  return (
    <div className={styles.shell} data-compact={compact || undefined}>
      <header className={styles.topbar}>
        <Link href="/admin" className={styles.brand}>
          Vestri Cinema<span className={styles.brandTag}>Cabina</span>
        </Link>
        <nav className={styles.tabs} aria-label="Stanze">
          {ROOMS.map((room) => (
            <Link
              key={room.key}
              href={room.href}
              className={styles.tab}
              aria-current={room.key === current ? 'page' : undefined}
            >
              {room.label}
            </Link>
          ))}
        </nav>
        <button type="button" className={styles.search} onClick={() => setPaletteOpen(true)}>
          <Search size={14} />
          <span className={styles.searchText}>Cerca o vai a…</span>
          <kbd className={styles.kbd}>{shortcut}</kbd>
        </button>
      </header>

      <div className={styles.body}>{children}</div>

      <nav className={styles.bottombar} aria-label="Stanze">
        {ROOMS.filter((r) => r.mobile).map((room) => {
          const Icon = ICONS[room.key];
          return (
            <Link
              key={room.key}
              href={room.href}
              className={styles.bottomItem}
              aria-current={room.key === current ? 'page' : undefined}
            >
              <Icon size={20} />
              {room.label}
            </Link>
          );
        })}
        <button type="button" className={styles.bottomItem} onClick={() => setMoreOpen(true)}>
          <Ellipsis size={20} />
          Altro
        </button>
      </nav>

      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title="Altro" variant="sheet">
        <div className={styles.more}>
          <button
            type="button"
            className={styles.moreItem}
            onClick={() => {
              setMoreOpen(false);
              setPaletteOpen(true);
            }}
          >
            <Search size={18} /> Cerca o vai a…
          </button>
          <Link href="/" className={styles.moreItem} onClick={() => setMoreOpen(false)}>
            <ExternalLink size={18} /> Vai al sito pubblico
          </Link>
          <button type="button" className={styles.moreItem} onClick={logout}>
            <LogOut size={18} /> Esci dal gestionale
          </button>
        </div>
      </Dialog>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
