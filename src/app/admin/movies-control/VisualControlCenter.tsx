'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Sparkles, Filter, Search, Film, Save, Loader2, CheckCircle2, RefreshCw } from 'lucide-react';
import styles from './VisualControlCenter.module.css';
import VisualAssetCard from './VisualAssetCard';
import { adminSaveOverride, adminGetVisualControlData } from '@/actions/adminActions';
import ImagePickerModal from './ImagePickerModal';
import TrailerPickerModal from './TrailerPickerModal';
import { extractYouTubeId } from '@/utils/youtubeUtils';

interface HydratedMovie {
  tmdbId: string;
  title: string;
  lastDate: string;
  tmdbData: any;
  override: any;
}

interface VisualControlCenterProps {
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

export default function VisualControlCenter({ isOpen, onClose, onRefresh }: VisualControlCenterProps) {
  const [loading, setLoading] = useState(true);
  const [hydratedMovies, setHydratedMovies] = useState<HydratedMovie[]>([]);
  const [filter, setFilter] = useState<'all' | 'no-trailer'>('all');
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [debouncedSave, setDebouncedSave] = useState<{ id: string, data: any } | null>(null);
  const [pickerState, setPickerState] = useState<{
    isOpen: boolean; 
    type: 'poster' | 'backdrop' | 'trailer';
    movieId: string | null;
  }>({ isOpen: false, type: 'poster', movieId: null });

  const loadHydratedData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminGetVisualControlData();
      setHydratedMovies(data);
    } catch (error) {
      console.error('Error loading hydrated data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadHydratedData();
    }
  }, [isOpen, loadHydratedData]);

  // Debounce saving
  useEffect(() => {
    if (!debouncedSave) return;
    
    const timer = setTimeout(async () => {
      const { id, data } = debouncedSave;
      setSavingId(id);
      try {
        await adminSaveOverride(id, data);
        setSavedIds(prev => new Set(prev).add(id));
        setTimeout(() => {
          setSavedIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }, 2000);
        // Do not full refresh to avoid jumping, just update local state if needed
        // but since we updated the override in the local state already, it's fine.
      } catch (error) {
        console.error('Error saving override:', error);
      } finally {
        setSavingId(null);
        setDebouncedSave(null);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [debouncedSave]);

  const filteredMovies = useMemo(() => {
    return hydratedMovies.filter(movie => {
      const matchesSearch = movie.title.toLowerCase().includes(search.toLowerCase());
      const hasTrailer = movie.override.customTrailerUrl || movie.tmdbData?.trailerKey;
      
      if (!matchesSearch) return false;
      if (filter === 'no-trailer') return !hasTrailer;
      return true;
    });
  }, [hydratedMovies, search, filter]);

  const handleUpdate = (tmdbId: string, field: string, value: string) => {
    setHydratedMovies(prev => prev.map(m => {
      if (m.tmdbId === tmdbId) {
        const newOverride = { ...m.override, [field]: value };
        // Trigger debounce save
        setDebouncedSave({ id: tmdbId, data: newOverride });
        return { ...m, override: newOverride };
      }
      return m;
    }));
  };

  const handleImageSelect = (path: string) => {
    if (!pickerState.movieId) return;
    const field = pickerState.type === 'poster' ? 'customPosterPath' : 
                  pickerState.type === 'backdrop' ? 'customBackdropPath' : 
                  'customTrailerUrl';
    handleUpdate(pickerState.movieId, field, path);
    setPickerState(s => ({ ...s, isOpen: false }));
  };

  const openPicker = (movieId: string, type: 'poster' | 'backdrop' | 'trailer') => {
    setPickerState({ isOpen: true, type, movieId });
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <header className={styles.header}>
          <div className={styles.headerTitle}>
            <Sparkles className={styles.goldIcon} />
            <h2>Visual Control Center</h2>
            <span className={styles.badge}>PRO</span>
          </div>
          <div className={styles.headerActions}>
            <button onClick={loadHydratedData} className={styles.refreshBtn} disabled={loading}>
              <RefreshCw size={16} className={loading ? styles.spin : ''} />
            </button>
            <div className={styles.searchWrapper}>
              <Search size={16} />
              <input 
                type="text" 
                placeholder="Cerca film..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className={styles.filterGroup}>
              <button 
                className={filter === 'all' ? styles.activeFilter : ''} 
                onClick={() => setFilter('all')}
              >
                Tutti
              </button>
              <button 
                className={filter === 'no-trailer' ? styles.activeFilter : ''} 
                onClick={() => setFilter('no-trailer')}
              >
                Senza Trailer
              </button>
            </div>
            <button className={styles.closeBtn} onClick={() => { onClose(); onRefresh(); }}>
              <X size={20} />
            </button>
          </div>
        </header>

        <div className={styles.content}>
          {loading && hydratedMovies.length === 0 ? (
            <div className={styles.loadingState}>
              <Loader2 size={48} className={styles.spin} />
              <p>Sincronizzazione dati TMDB in corso...</p>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.movieCol}>FILM</th>
                  <th>POSTER</th>
                  <th>BACKDROP</th>
                  <th>TRAILER</th>
                  <th>INFO TRAILER</th>
                  <th className={styles.actionCol}>STATO</th>
                </tr>
              </thead>
              <tbody>
                {filteredMovies.map(movie => {
                  const isSaving = savingId === movie.tmdbId;
                  const isSaved = savedIds.has(movie.tmdbId);

                  return (
                    <tr key={movie.tmdbId} className={styles.row}>
                      <td className={styles.movieInfo}>
                        <div className={styles.movieTitle}>{movie.title}</div>
                        <div className={styles.movieMeta}>TMDB ID: {movie.tmdbId}</div>
                        <div className={styles.movieDate}>Prossima: {new Date(movie.lastDate).toLocaleDateString('it-IT')}</div>
                      </td>
                      <td>
                        <VisualAssetCard
                          label="Poster"
                          type="poster"
                          value={movie.override.customPosterPath || ''}
                          tmdbFallback={movie.tmdbData?.poster_path}
                          onChange={(val) => handleUpdate(movie.tmdbId, 'customPosterPath', val)}
                          onPickClick={() => openPicker(movie.tmdbId, 'poster')}
                        />
                      </td>
                      <td>
                        <VisualAssetCard
                          label="Backdrop"
                          type="backdrop"
                          value={movie.override.customBackdropPath || ''}
                          tmdbFallback={movie.tmdbData?.backdrop_path}
                          onChange={(val) => handleUpdate(movie.tmdbId, 'customBackdropPath', val)}
                          onPickClick={() => openPicker(movie.tmdbId, 'backdrop')}
                        />
                      </td>
                      <td>
                        <VisualAssetCard
                          label="Trailer URL"
                          type="trailer"
                          value={movie.override.customTrailerUrl || ''}
                          tmdbFallback={movie.tmdbData?.trailerKey ? `https://www.youtube.com/watch?v=${movie.tmdbData.trailerKey}` : ''}
                          onChange={(val) => handleUpdate(movie.tmdbId, 'customTrailerUrl', val)}
                          onPickClick={() => openPicker(movie.tmdbId, 'trailer')}
                        />
                      </td>
                      <td>
                        <div className={styles.trailerInfoInput}>
                          <label>Titolo Trailer</label>
                          <input 
                            type="text" 
                            value={movie.override.customTrailerTitle || ''}
                            placeholder={movie.tmdbData?.trailerKey ? "Trailer Ufficiale" : "Nessun trailer trovato"}
                            className={movie.override.customTrailerTitle ? styles.inputModified : ''}
                            onChange={e => handleUpdate(movie.tmdbId, 'customTrailerTitle', e.target.value)}
                          />
                        </div>
                      </td>
                      <td className={styles.actionCol}>
                        <div className={`${styles.statusBadge} ${isSaving ? styles.saving : isSaved ? styles.saved : ''}`}>
                          {isSaving ? <Loader2 size={16} className={styles.spin} /> : isSaved ? <CheckCircle2 size={16} /> : <Film size={16} />}
                          <span>{isSaving ? 'Salvataggio...' : isSaved ? 'Salvato' : 'In Linea'}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          
          {!loading && filteredMovies.length === 0 && (
            <div className={styles.emptyState}>
              <Film size={48} />
              <p>Nessun film trovato con questi filtri.</p>
            </div>
          )}
        </div>
      </div>
      {pickerState.isOpen && pickerState.movieId && pickerState.type !== 'trailer' && (
        <ImagePickerModal
          movieId={pickerState.movieId}
          type={pickerState.type as 'poster' | 'backdrop'}
          onSelect={handleImageSelect}
          onClose={() => setPickerState(s => ({ ...s, isOpen: false }))}
        />
      )}

      {pickerState.isOpen && pickerState.movieId && pickerState.type === 'trailer' && (
        <TrailerPickerModal
          movieId={pickerState.movieId}
          onSelect={handleImageSelect}
          onClose={() => setPickerState(s => ({ ...s, isOpen: false }))}
          currentKey={(() => {
            const m = hydratedMovies.find(mv => mv.tmdbId === pickerState.movieId);
            const url = m?.override.customTrailerUrl;
            return url ? (extractYouTubeId(url) || undefined) : undefined;
          })()}
        />
      )}
    </div>
  );
}
