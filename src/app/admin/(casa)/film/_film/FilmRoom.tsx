'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { adminGetMovieById, adminGetOverrides, adminGetProgrammedMovies } from '@/actions/adminActions';
import Button from '@/components/cabina/Button';
import Dialog from '@/components/cabina/Dialog';
import { useToast } from '@/components/cabina/Toast';
import FilmEditor, { type Projection } from './FilmEditor';
import { movieIdOf, type MovieLike, type OverrideLike } from './form';
import QuickLook from './QuickLook';
import ToolsDialog from './ToolsDialog';
import styles from './Film.module.css';

interface Programmed {
  tmdbId: string;
  title: string;
  lastDate: string | Date;
  projections: Projection[];
}

type Overrides = Record<string, OverrideLike & { customTitle?: string | null; versionLanguage?: string | null; subtitles?: string | null }>;

function shortDate(d: string | Date): string {
  return new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', timeZone: 'Europe/Rome' });
}

export default function FilmRoom({ initialTmdb }: { initialTmdb: string | null }) {
  const toast = useToast();
  const [overrides, setOverrides] = useState<Overrides>({});
  const [programmed, setProgrammed] = useState<Programmed[] | null>(null);
  const [selected, setSelected] = useState<{ movie: MovieLike; version: number } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [tab, setTab] = useState<'programma' | 'salvati'>('programma');
  const [search, setSearch] = useState('');
  const [dirty, setDirty] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ov, prog] = await Promise.all([adminGetOverrides(), adminGetProgrammedMovies()]);
      setOverrides(ov as Overrides);
      setProgrammed(prog as unknown as Programmed[]);
    } catch {
      setProgrammed((p) => p ?? []);
      toast('Non riesco a leggere i film dal database.', 'alarm');
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = useCallback(
    async (tmdbId: string) => {
      setPendingSwitch(null);
      setOpening(tmdbId);
      try {
        const movie = await adminGetMovieById(tmdbId);
        if (!movie) throw new Error();
        setDirty(false);
        setSelected((s) => ({ movie: movie as MovieLike, version: (s?.version ?? 0) + 1 }));
      } catch {
        toast('Non riesco a leggere questo film da TMDB.', 'alarm');
      } finally {
        setOpening(null);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (initialTmdb) void open(initialTmdb);
  }, [initialTmdb, open]);

  const choose = (tmdbId: string) => {
    if (selected && movieIdOf(selected.movie) === tmdbId) return;
    if (dirty) setPendingSwitch(tmdbId);
    else void open(tmdbId);
  };

  const selectedId = selected ? movieIdOf(selected.movie) : null;
  const q = search.trim().toLowerCase();

  const programmedRows = useMemo(
    () => (programmed ?? []).filter((p) => !q || p.title.toLowerCase().includes(q) || (overrides[p.tmdbId]?.customTitle ?? '').toLowerCase().includes(q)),
    [programmed, overrides, q],
  );
  const savedRows = useMemo(
    () => Object.entries(overrides).filter(([, ov]) => !q || (ov.customTitle ?? '').toLowerCase().includes(q)),
    [overrides, q],
  );

  const projections = selectedId ? programmed?.find((p) => p.tmdbId === selectedId)?.projections ?? [] : [];

  return (
    <div className={styles.room}>
      <header className={styles.head}>
        <div>
          <p className={styles.kicker}>
            {programmed ? `${programmed.length} film in programma · ${Object.keys(overrides).length} schede personalizzate` : 'Leggo i film…'}
          </p>
          <h1 className={styles.title}>Film</h1>
        </div>
        <div className={styles.headActions}>
          <Button variant="outline" onClick={() => setQuickOpen(true)}>Colpo d’occhio</Button>
          <Button variant="ghost" onClick={() => setToolsOpen(true)}>Strumenti</Button>
        </div>
      </header>

      <div className={styles.layout} data-open={selected ? '' : undefined}>
        <aside className={styles.list}>
          <label className={styles.search}>
            <Search size={14} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca un film…" aria-label="Cerca un film" />
          </label>
          <div className={styles.segmented}>
            <Button variant={tab === 'programma' ? 'fill' : 'ghost'} onClick={() => setTab('programma')}>In programma</Button>
            <Button variant={tab === 'salvati' ? 'fill' : 'ghost'} onClick={() => setTab('salvati')}>Personalizzati</Button>
          </div>

          {programmed === null && <p className={styles.hint}>Leggo i film…</p>}

          <ul className={styles.rows}>
            {tab === 'programma' &&
              programmedRows.map((p) => {
                const ov = overrides[p.tmdbId];
                return (
                  <li key={p.tmdbId}>
                    <button type="button" className={styles.row} data-selected={selectedId === p.tmdbId || undefined} onClick={() => choose(p.tmdbId)}>
                      <span className={styles.rowTitle}>{ov?.customTitle || p.title}</span>
                      <span className={styles.rowMeta}>
                        prossima {shortDate(p.lastDate)} · {p.projections.length} in sala
                        {ov?.versionLanguage ? ` · ${ov.versionLanguage}` : ''}
                      </span>
                      {ov?.isManualOverride && <span className={styles.tagCustom}>tuo</span>}
                      {opening === p.tmdbId && <span className={styles.hint}>apro…</span>}
                    </button>
                  </li>
                );
              })}
            {tab === 'salvati' &&
              savedRows.map(([id, ov]) => (
                <li key={id}>
                  <button type="button" className={styles.row} data-selected={selectedId === id || undefined} onClick={() => choose(id)}>
                    <span className={styles.rowTitle}>{ov.customTitle || `TMDB ${id}`}</span>
                    <span className={styles.rowMeta}>
                      {[ov.versionLanguage, ov.subtitles && ov.subtitles !== 'NESSUNO' ? `sott. ${ov.subtitles}` : null].filter(Boolean).join(' · ') || 'senza lingua'}
                    </span>
                    {ov.isDraft && <span className={styles.tagTmdb}>bozza</span>}
                    {opening === id && <span className={styles.hint}>apro…</span>}
                  </button>
                </li>
              ))}
          </ul>
          {programmed !== null && tab === 'programma' && programmedRows.length === 0 && <p className={styles.hint}>Nessun film in programma con questo nome.</p>}
          {tab === 'salvati' && savedRows.length === 0 && <p className={styles.hint}>Nessuna scheda personalizzata.</p>}
        </aside>

        <div className={styles.main}>
          {selected ? (
            <FilmEditor
              key={`${selectedId}@${selected.version}`}
              movie={selected.movie}
              override={overrides[selectedId!]}
              projections={projections}
              onDirtyChange={setDirty}
              onSaved={load}
              onReloaded={(fresh) => setSelected((s) => ({ movie: fresh, version: (s?.version ?? 0) + 1 }))}
              onClose={() => {
                setSelected(null);
                setDirty(false);
              }}
            />
          ) : (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>Scegli un film</p>
              <p className={styles.hint}>
                Titolo, trama, lingua, immagini, trailer e premi: quello che scrivi qui vince su TMDB, e lo vedono sito, app e display.
              </p>
            </div>
          )}
        </div>
      </div>

      {pendingSwitch && (
        <Dialog open onClose={() => setPendingSwitch(null)} title="Modifiche non salvate" showTitle>
          <p className={styles.text}>Nella scheda aperta ci sono modifiche non salvate. Se apri un altro film si perdono.</p>
          <div className={styles.dialogActions}>
            <Button variant="ghost" onClick={() => setPendingSwitch(null)}>Resto qui</Button>
            <Button variant="alarm" onClick={() => void open(pendingSwitch)}>Apri l’altro</Button>
          </div>
        </Dialog>
      )}

      {toolsOpen && <ToolsDialog onClose={() => setToolsOpen(false)} onDone={load} />}
      {quickOpen && <QuickLook onClose={() => setQuickOpen(false)} onSaved={load} />}
    </div>
  );
}
