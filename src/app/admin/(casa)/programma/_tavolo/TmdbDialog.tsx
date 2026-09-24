'use client';

import { useState } from 'react';
import { catalogAddByTmdbId, catalogPreviewTmdb, catalogSearchTmdb } from '@/actions/catalogActions';
import Button from '@/components/cabina/Button';
import Dialog from '@/components/cabina/Dialog';
import { useToast } from '@/components/cabina/Toast';
import type { CatalogItem } from '../wizard/types';
import styles from './CatalogDrawer.module.css';

interface Hit {
  id: number;
  title?: string;
  original_title?: string;
  release_date?: string;
}

/**
 * Un film che non hai in libreria. Di norma vive solo nella bozza: scriverlo
 * in catalogo è una decisione d'archivio, e la prendi tu con la spunta.
 */
export default function TmdbDialog({ onClose, onPick }: { onClose: () => void; onPick: (film: CatalogItem) => void }) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [save, setSave] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      setHits(((await catalogSearchTmdb(query)) as Hit[]).slice(0, 12));
    } catch {
      toast('TMDB non ha risposto. Riprova fra poco.', 'alarm');
    } finally {
      setLoading(false);
    }
  };

  const pick = async (hit: Hit) => {
    setPicking(hit.id);
    try {
      if (save) await catalogAddByTmdbId(String(hit.id));
      const film = await catalogPreviewTmdb(String(hit.id));
      if (!film) throw new Error('film non trovato');
      onPick(film as unknown as CatalogItem);
    } catch {
      toast('Non sono riuscito a leggere questo film da TMDB.', 'alarm');
    } finally {
      setPicking(null);
    }
  };

  return (
    <Dialog open onClose={onClose} title="Cerca su TMDB" showTitle>
      <form onSubmit={search} className={styles.tmdbForm}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Titolo, oppure id TMDB" aria-label="Titolo o id TMDB" />
        <Button type="submit" variant="outline" disabled={loading}>{loading ? 'Cerco…' : 'Cerca'}</Button>
      </form>
      <label className={styles.tmdbSave}>
        <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
        Salvalo anche nel catalogo
      </label>
      <p className={styles.tmdbHint}>Se non lo spunti, il film vive solo in questa bozza.</p>
      {hits && hits.length === 0 && <p className={styles.tmdbHint}>Nessun film con questo nome.</p>}
      {hits && hits.length > 0 && (
        <ul className={styles.tmdbList}>
          {hits.map((h) => (
            <li key={h.id}>
              <span>
                {h.title || h.original_title} <em>{h.release_date?.slice(0, 4)}</em>
              </span>
              <Button variant="ghost" onClick={() => pick(h)} disabled={picking !== null}>
                {picking === h.id ? '…' : 'Usa'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
