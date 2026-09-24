'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Eye, EyeOff, RefreshCw, Star } from 'lucide-react';
import {
  adminBulkHideSeatingPlans,
  adminCreateSeatingPlan,
  adminGetSeatingPlans,
  adminSyncMirror,
  adminToggleFavoriteSeatingPlan,
  adminToggleHideSeatingPlan,
  adminUpdateRoomMetadata,
} from '@/actions/adminActions';
import Button from '@/components/cabina/Button';
import Dialog from '@/components/cabina/Dialog';
import { useToast } from '@/components/cabina/Toast';
import styles from '../../_stanza.module.css';

interface Room {
  id: number;
  name: string;
  internalName: string;
  isHidden: boolean;
  isFavorite: boolean;
}

/** La sala che il tavolo apre da solo: è una scelta di questo computer. */
const DEFAULT_KEY = 'defaultSalaId';

function readDefault(): string | null {
  try {
    return localStorage.getItem(DEFAULT_KEY);
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();
function subscribeDefault(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

export default function SaleRoom() {
  const toast = useToast();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [name, setName] = useState('');
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(10);
  const [creating, setCreating] = useState(false);
  const defaultId = useSyncExternalStore(subscribeDefault, readDefault, () => null);

  const load = useCallback(async () => {
    try {
      setRooms((await adminGetSeatingPlans({ includeHidden: true })) as Room[]);
    } catch {
      setRooms([]);
      toast('Non riesco a leggere le sale da Pretix.', 'alarm');
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const setDefault = (id: number) => {
    try {
      localStorage.setItem(DEFAULT_KEY, String(id));
    } catch {
      /* archivio del browser non disponibile */
    }
    listeners.forEach((l) => l());
    toast('Sala predefinita scelta: il tavolo apre questa.', 'ok');
  };

  const patch = (id: number, change: Partial<Room>) => setRooms((list) => list?.map((r) => (r.id === id ? { ...r, ...change } : r)) ?? null);

  const toggleFavorite = async (r: Room) => {
    patch(r.id, { isFavorite: !r.isFavorite });
    try {
      await adminToggleFavoriteSeatingPlan(r.id);
    } catch {
      patch(r.id, { isFavorite: r.isFavorite });
      toast('Non sono riuscito a cambiarla.', 'alarm');
    }
  };

  const toggleHidden = async (r: Room) => {
    patch(r.id, { isHidden: !r.isHidden });
    try {
      await adminToggleHideSeatingPlan(r.id);
    } catch {
      patch(r.id, { isHidden: r.isHidden });
      toast('Non sono riuscito a cambiarla.', 'alarm');
    }
  };

  const rename = async (r: Room, alias: string) => {
    const next = alias.trim();
    if (next === r.internalName) return;
    try {
      await adminUpdateRoomMetadata(r.id, { internalName: next });
      patch(r.id, { internalName: next });
      toast(`Sala ${r.id}: ora si chiama «${next || r.name}».`, 'ok');
    } catch {
      toast('Non sono riuscito a rinominarla.', 'alarm');
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      await adminSyncMirror();
      await load();
      toast('Sale rilette da Pretix.', 'ok');
    } catch {
      toast('Pretix non ha risposto.', 'alarm');
    } finally {
      setSyncing(false);
    }
  };

  const hideAll = async () => {
    setConfirmBulk(false);
    try {
      await adminBulkHideSeatingPlans();
      await load();
      toast('Tutte le sale nascoste: rimetti visibili quelle che usi.', 'ok');
    } catch {
      toast('Non sono riuscito a nasconderle.', 'alarm');
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      await adminCreateSeatingPlan(name.trim(), rows, cols);
      toast(`Sala «${name.trim().toUpperCase()}» creata su Pretix: ${rows} file × ${cols} posti.`, 'ok');
      setName('');
      await load();
    } catch (err) {
      toast(`Pretix ha rifiutato la sala: ${err instanceof Error ? err.message : 'errore sconosciuto'}.`, 'alarm');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={styles.room}>
      <header className={styles.head}>
        <div>
          <p className={styles.kicker}>{rooms ? `${rooms.length} piante dei posti su Pretix` : 'Leggo le sale…'}</p>
          <h1 className={styles.title}>Sale</h1>
        </div>
        <div className={styles.headActions}>
          <Button variant="ghost" onClick={() => setConfirmBulk(true)}>Nascondi tutte</Button>
          <Button variant="outline" onClick={sync} disabled={syncing}>
            <RefreshCw size={14} /> {syncing ? 'Rileggo…' : 'Rileggi da Pretix'}
          </Button>
        </div>
      </header>

      <div className={styles.columns}>
        <section className={styles.panel}>
          <p className={styles.section}>Le sale</p>
          <p className={styles.hint}>Il nome che scrivi qui è quello che vedi nel gestionale. Le nascoste non compaiono nel tavolo; la predefinita è quella che il tavolo apre su questo computer.</p>
          <ul className={styles.list}>
            {rooms?.map((r) => (
              <li key={r.id} className={styles.item} data-muted={r.isHidden || undefined}>
                <div className={styles.itemMain}>
                  <input
                    className={styles.inlineInput}
                    defaultValue={r.internalName}
                    onBlur={(e) => void rename(r, e.target.value)}
                    aria-label={`Nome della sala ${r.id}`}
                  />
                  <span className={styles.meta}>Su Pretix: {r.name || 'senza nome'} · id {r.id}</span>
                </div>
                <div className={styles.itemActions}>
                  <Button variant={defaultId === String(r.id) ? 'fill' : 'ghost'} onClick={() => setDefault(r.id)}>
                    {defaultId === String(r.id) ? 'Predefinita' : 'Rendi predefinita'}
                  </Button>
                  <button type="button" className={styles.iconBtn} data-on={r.isFavorite || undefined} onClick={() => void toggleFavorite(r)} aria-label={r.isFavorite ? 'Togli dalle preferite' : 'Metti fra le preferite'} title="Preferita">
                    <Star size={15} fill={r.isFavorite ? 'currentColor' : 'none'} />
                  </button>
                  <button type="button" className={styles.iconBtn} data-on={r.isHidden || undefined} onClick={() => void toggleHidden(r)} aria-label={r.isHidden ? 'Rendi visibile' : 'Nascondi'} title={r.isHidden ? 'Nascosta' : 'Visibile'}>
                    {r.isHidden ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {rooms?.length === 0 && <p className={styles.hint}>Nessuna sala da Pretix. Forse non risponde: riprova fra poco.</p>}
        </section>

        <section className={styles.panel}>
          <p className={styles.section}>Una sala nuova su Pretix</p>
          <form onSubmit={create} className={styles.form}>
            <label className={styles.field}>
              <span>Nome</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="SALA 2" required />
            </label>
            <div className={styles.two}>
              <label className={styles.field}>
                <span>File</span>
                <input type="number" min={1} max={50} value={rows} onChange={(e) => setRows(Math.max(1, Math.min(50, Number(e.target.value) || 5)))} />
              </label>
              <label className={styles.field}>
                <span>Posti per fila</span>
                <input type="number" min={1} max={50} value={cols} onChange={(e) => setCols(Math.max(1, Math.min(50, Number(e.target.value) || 10)))} />
              </label>
            </div>
            <Button type="submit" variant="fill" disabled={creating || !name.trim()}>
              {creating ? 'Creo…' : `Crea la sala · ${rows * cols} posti`}
            </Button>
          </form>
        </section>
      </div>

      {confirmBulk && (
        <Dialog open onClose={() => setConfirmBulk(false)} title="Nascondere tutte le sale?" showTitle>
          <p className={styles.text}>Spariscono dal tavolo finché non le rimetti visibili una per una. Su Pretix non cambia niente.</p>
          <div className={styles.dialogActions}>
            <Button variant="ghost" onClick={() => setConfirmBulk(false)}>Annulla</Button>
            <Button variant="alarm" onClick={hideAll}>Nascondi tutte</Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
