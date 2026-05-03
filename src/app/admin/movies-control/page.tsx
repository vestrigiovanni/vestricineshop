'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import {
  adminGetOverrides,
  upsertMovieOverride,
  adminDeleteOverride,
  adminGetProgrammedMovies,
  adminGetMovieById,
  adminClearMovieMetadata,
  adminSyncSoldOutStatus,
  adminSyncAllMovies
} from '@/actions/adminActions';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import Image from 'next/image';
import {
  Save, Trash2, Edit3, X, Info, Globe, Languages,
  Image as ImageIcon, RefreshCw, Play, CheckCircle2, Film,
  AlertTriangle, Loader2, ChevronRight, Star, Sparkles, LayoutGrid
} from 'lucide-react';
import styles from './MoviesControl.module.css';
import ImagePickerModal from './ImagePickerModal';
import TrailerPickerModal from './TrailerPickerModal';
import VisualControlCenter from './VisualControlCenter';
import { extractYouTubeId } from '@/utils/youtubeUtils';
import { LANGUAGE_MAP, SUBTITLE_OPTIONS } from '@/constants/languages';
import RatingBadge from '@/components/RatingBadge';


const EMPTY_FORM = {
  customTitle: '',
  customOverview: '',
  versionLanguage: 'ITA',
  subtitles: 'NESSUNO',

  customPosterPath: '',
  customBackdropPath: '',
  customLogoPath: '',
  customDirector: '',
  customCast: '',
  customRoomName: 'SALA CA GRANDA',
  customRating: '',
  manualSoldOut: false,
  customTrailerUrl: '',
  mubiId: '',
};

export default function MoviesControlPage() {
  const [overrides, setOverrides] = useState<Record<string, any>>({});
  const [programmedMovies, setProgrammedMovies] = useState<any[]>([]);
  const [editingMovie, setEditingMovie] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [formState, setFormState] = useState({ ...EMPTY_FORM });
  const [pickerState, setPickerState] = useState<{
    isOpen: boolean; type: 'poster' | 'backdrop' | 'trailer';
  }>({ isOpen: false, type: 'poster' });
  const [isPending, startTransition] = useTransition();
  const [isVisualCenterOpen, setIsVisualCenterOpen] = useState(false);

  const loadData = useCallback(async () => {
    const [ovData, progData] = await Promise.all([
      adminGetOverrides(),
      adminGetProgrammedMovies(),
    ]);
    setOverrides(ovData);
    setProgrammedMovies(progData);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);



  const openEditor = (movie: any) => {
    const override = overrides[movie.id?.toString() || movie.tmdbId] || {};
    setEditingMovie(movie);
    setSaveSuccess(false);
    setFormState({
      customTitle: override.customTitle ?? (movie.title || ''),
      customOverview: override.customOverview ?? (movie.overview || ''),
      versionLanguage: override.versionLanguage || 'ITA',
      subtitles: override.subtitles || 'NESSUNO',

      customPosterPath: override.customPosterPath ?? (movie.poster_path || ''),
      customBackdropPath: override.customBackdropPath ?? (movie.backdrop_path || ''),
      customLogoPath: override.customLogoPath ?? (movie.logo_path || ''),
      customDirector: override.customDirector ?? (Array.isArray(movie.director) ? movie.director.join(', ') : (movie.director || '')),
      customCast: override.customCast ?? (Array.isArray(movie.cast) ? movie.cast.join(', ') : (movie.cast || '')),
      customRoomName: override.customRoomName || 'SALA CA GRANDA',
      customRating: override.customRating ?? (movie.rating || ''),
      manualSoldOut: override.manualSoldOut || false,
      customTrailerUrl: override.customTrailerUrl ?? (movie.trailerKey ? `https://www.youtube.com/watch?v=${movie.trailerKey}` : ''),
      mubiId: override.mubiId ?? (movie.mubiId || ''),
    });
  };

  const handleSelectProgrammed = async (tmdbId: string) => {
    setLoading(true);
    try {
      const movie = await adminGetMovieById(tmdbId);
      if (movie) openEditor(movie);
    } catch (err: any) {
      console.error('[MOS handleSelectProgrammed] Error:', err);
      alert(`Errore nel recupero dettagli film: ${err?.message || 'Errore sconosciuto'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editingMovie) return;
    setLoading(true);
    setSaveSuccess(false);
    const id = editingMovie.id?.toString() || editingMovie.tmdbId;
    if (!id) {
      alert('Errore: ID film mancante. Impossibile salvare.');
      setLoading(false);
      return;
    }
    const payload = {
      ...formState,
      customDirector: formState.customDirector
        ? formState.customDirector.split(',').map((s: string) => s.trim()).filter(Boolean)
        : undefined,
      customCast: formState.customCast
        ? formState.customCast.split(',').map((s: string) => s.trim()).filter(Boolean)
        : undefined,
      awardYear: formState.awardYear ? parseInt(formState.awardYear) : null,
    };
    try {
      const result = await upsertMovieOverride(id, payload);
      if (result?.success) {
        // Re-fetch overrides immediately so the UI reflects the change
        await loadData();
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        alert('Salvataggio non confermato dal DB. Riprova.');
      }
    } catch (err: any) {
      console.error('[MOS handleSave] Error:', err);
      alert(`Errore durante il salvataggio: ${err?.message || 'Errore sconosciuto'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (tmdbId: string) => {
    if (!confirm('Eliminare gli override per questo film?')) return;
    setLoading(true);
    await adminDeleteOverride(tmdbId);
    await loadData();
    if (editingMovie && (editingMovie.id?.toString() === tmdbId || editingMovie.tmdbId === tmdbId)) {
      setEditingMovie(null);
    }
    setLoading(false);
  };

  const handleRefreshMetadata = async () => {
    if (!editingMovie) return;
    if (!confirm('Ricaricare i metadati da TMDB? La cache locale verrà cancellata.')) return;
    setLoading(true);
    const id = editingMovie.id?.toString() || editingMovie.tmdbId;
    await adminClearMovieMetadata(id);
    const freshMovie = await adminGetMovieById(id);
    if (freshMovie) setEditingMovie(freshMovie);
    setLoading(false);
  };

  const handleImageSelect = (path: string) => {
    if (pickerState.type === 'poster') {
      setFormState(f => ({ ...f, customPosterPath: path }));
    } else if (pickerState.type === 'backdrop') {
      setFormState(f => ({ ...f, customBackdropPath: path }));
    } else {
      setFormState(f => ({ ...f, customTrailerUrl: path }));
    }
  };

  const handleSyncSoldOut = async () => {
    if (!confirm('Controllare tutte le quote su Pretix e aggiornare gli stati Sold Out?')) return;
    setSyncing(true);
    try {
      await adminSyncSoldOutStatus();
      await loadData();
      alert('Sincronizzazione completata!');
    } catch {
      alert('Errore durante la sincronizzazione');
    } finally {
      setSyncing(false);
    }
  };

  const editingId = editingMovie?.id?.toString() || editingMovie?.tmdbId;
  const posterUrl = formState.customPosterPath
    ? (formState.customPosterPath.startsWith('/')
        ? getTMDBImageUrl(formState.customPosterPath, 'w342')
        : formState.customPosterPath)
    : null;

  const programmedMovieData = editingId ? programmedMovies.find(p => p.tmdbId === editingId) : null;

  return (
    <div className={styles.container}>
      {/* ── HEADER ─────────────────────────────────────────────── */}
      <header className={styles.header}>
        <div>
          <div className={styles.headerBadge}><Film size={14} /> Torre di Controllo</div>
          <h1 className={styles.title}>Movie Override System</h1>
          <p className={styles.subtitle}>
            Personalizza metadati, poster, trailer e versione linguistica indipendentemente da TMDB.
          </p>
        </div>
        <div className={styles.headerButtons}>
          <button
            onClick={() => setIsVisualCenterOpen(true)}
            className={styles.btnVisualCenter}
            title="Gestione rapida estetica film"
          >
            <Sparkles size={16} />
            Cambia meta dati velocemente
          </button>
          <button
            onClick={handleSyncSoldOut}
            className={styles.btnSync}
            disabled={syncing}
            title="Controlla disponibilità su Pretix"
          >
            <RefreshCw size={16} className={syncing ? styles.spin : ''} />
            {syncing ? 'Sincronizzazione…' : 'Sync Sold Out'}
          </button>
          <button
            onClick={async () => {
              const forceRefresh = confirm('ESEGUIRE IL GRANDE POPOLAMENTO?\n\nPremi OK per scansionare Pretix e cercare i dati mancanti.\nPremi ANNULLA se invece vuoi FORZARE il rinfresco di TUTTI i metadati da TMDB (rinnovabili).');
              
              // Se l'utente preme "Annulla" nel confirm, potremmo usare un altro prompt o semplicemente interpretare i due stati.
              // Per semplicità facciamo due confirm separati o un prompt.
              
              let mode: 'normal' | 'force' | 'cancel' = 'normal';
              if (!forceRefresh) {
                const reallyForce = confirm('Vuoi FORZARE il rinnovo di tutti i metadati esistenti da TMDB?');
                if (reallyForce) mode = 'force';
                else mode = 'cancel';
              }

              if (mode === 'cancel') return;

              setSyncing(true);
              try {
                const res = await adminSyncAllMovies(mode === 'force');
                alert(`Popolamento completato! Processati ${res?.upserted || 0} spettacoli.`);
                await loadData();
              } catch (e: any) {
                alert(`Errore: ${e.message}`);
              } finally {
                setSyncing(false);
              }
            }}
            className={styles.btnBigBang}
            disabled={syncing}
            title="Popolamento totale database"
          >
            <Sparkles size={16} className={syncing ? styles.spin : ''} />
            Sincronizza Tutto Ora
          </button>
        </div>
      </header>

      <div className={styles.mainGrid}>
        {/* ── LEFT COLUMN ────────────────────────────────────────── */}
        <div className={styles.leftCol}>

          {/* Programmed Movies */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <Film size={16} className={styles.cardIcon} />
              <span>Film in Programmazione</span>
              <span className={styles.countBadge}>{programmedMovies.length}</span>
            </div>
            <p className={styles.cardDesc}>Clicca su un film per aprire l'editor.</p>
            <div className={styles.programmedList}>
              {programmedMovies.length === 0 ? (
                <div className={styles.emptyState}>
                  <Info size={32} strokeWidth={1} />
                  <p>Nessun film programmato.</p>
                </div>
              ) : (
                    programmedMovies.map(movie => {
                      const isEditing = editingId === movie.tmdbId;
                      const override = overrides[movie.tmdbId];
                      const hasOverride = !!override;
                      
                      return (
                        <div
                          key={movie.tmdbId}
                          className={`${styles.programmedRow} ${isEditing ? styles.programmedRowActive : ''}`}
                          onClick={() => handleSelectProgrammed(movie.tmdbId)}
                        >
                          <div className={styles.programmedInfo}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                              <RatingBadge rating={override?.customRating} size="xs" />
                              <strong>{movie.title}</strong>
                            </div>
                            <span>Prossima: {new Date(movie.lastDate).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}</span>
                          </div>
                          <div className={styles.programmedRight}>
                            {hasOverride && (
                              override.isManualOverride ? (
                                <span className={styles.manualBadge}><Edit3 size={10} /> Override Personalizzato</span>
                              ) : (
                                <span className={styles.tmdbBadge}><Sparkles size={10} /> TMDB Original</span>
                              )
                            )}
                            <ChevronRight size={16} className={styles.chevron} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
    
    
              {/* Active Overrides */}
              {Object.keys(overrides).length > 0 && (
                <section className={styles.card}>
                  <div className={styles.cardHeader}>
                    <Star size={16} className={styles.cardIcon} />
                    <span>Metadati Salvati</span>
                    <span className={styles.countBadge}>{Object.keys(overrides).length}</span>
                  </div>
                  <div className={styles.overridesList}>
                    {Object.entries(overrides).map(([id, ov]: [string, any]) => (
                      <div key={id} className={styles.overrideRow}>
                        <div className={styles.overrideInfo}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <RatingBadge rating={ov.customRating} size="xs" />
                            <strong>{ov.customTitle || 'Film senza titolo'}</strong>
                            {ov.isManualOverride ? (
                              <span className={styles.manualBadge} style={{ fontSize: '0.55rem' }}>Personalizzato</span>
                            ) : (
                              <span className={styles.tmdbBadge} style={{ fontSize: '0.55rem' }}>Original</span>
                            )}
                            {ov.isDraft && (
                              <span className={styles.draftBadge} style={{ fontSize: '0.55rem' }}>Bozza</span>
                            )}
                          </div>
                          <span>{ov.versionLanguage} {ov.subtitles !== 'Nessuno' ? `• ${ov.subtitles}` : ''}</span>
                        </div>
                        <button
                          onClick={() => handleDelete(id)}
                          className={styles.btnDeleteSmall}
                          title="Elimina override"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}
        </div>

        {/* ── RIGHT COLUMN: EDITOR ──────────────────────────────── */}
        <div className={styles.rightCol}>
          {editingMovie ? (
            <section className={styles.editorSection}>
              {/* Editor Header with poster preview */}
              <div className={styles.editorTopBar}>
                <div className={styles.editorPosterPreview}>
                  {posterUrl ? (
                    <img src={posterUrl} alt="Poster" />
                  ) : (
                    <div className={styles.editorPosterPlaceholder}><Film size={32} strokeWidth={1} /></div>
                  )}
                </div>
                <div className={styles.editorMovieInfo}>
                  <div className={styles.editorMovieTitle}>{editingMovie.title}</div>
                  <div className={styles.editorMovieMeta}>
                    {editingMovie.release_date?.slice(0, 4)} · {editingMovie.original_language?.toUpperCase()}
                    {editingId && overrides[editingId] && (
                      <span className={styles.overrideBadge} style={{ marginLeft: 8 }}>✓ Override Attivo</span>
                    )}
                  </div>
                </div>
                <div className={styles.editorActions}>
                  <button 
                    onClick={handleSave} 
                    className={`${styles.btnSaveTop} ${saveSuccess ? styles.btnSaveSuccess : ''}`} 
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 size={16} className={styles.spin} />
                    ) : saveSuccess ? (
                      <CheckCircle2 size={16} />
                    ) : (
                      <Save size={16} />
                    )}
                    <span>{saveSuccess ? 'Salvato!' : 'Salva'}</span>
                  </button>
                  <button onClick={handleRefreshMetadata} className={styles.btnIconGhost} title="Ricarica da TMDB">
                    <RefreshCw size={16} className={loading ? styles.spin : ''} />
                  </button>
                  {editingId && overrides[editingId] && (
                    <button onClick={() => handleDelete(editingId)} className={styles.btnIconDanger} title="Elimina override">
                      <Trash2 size={16} />
                    </button>
                  )}
                  <button onClick={() => setEditingMovie(null)} className={styles.btnIconGhost} title="Chiudi">
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className={styles.editorBody}>
                {/* Title */}
                <div className={styles.formGroup}>
                  <label className={styles.label}>Titolo Personalizzato</label>
                  <input
                    type="text"
                    value={formState.customTitle}
                    onChange={e => setFormState(f => ({ ...f, customTitle: e.target.value }))}
                    className={styles.input}
                    placeholder="Titolo visualizzato sul sito"
                  />
                </div>

                {/* Version + Subtitles */}
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}><Globe size={12} /> Versione Lingua</label>
                    <select
                      value={formState.versionLanguage}
                      onChange={e => setFormState(f => ({ ...f, versionLanguage: e.target.value }))}
                      className={styles.input}
                    >
                      <option value="ITA">ITA (Italiano)</option>
                      {Object.entries(LANGUAGE_MAP).filter(([k]) => k !== 'it').map(([k, v]) => (
                        <option key={k} value={v}>{v} ({k.toUpperCase()})</option>
                      ))}

                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label}><Languages size={12} /> Sottotitoli</label>
                    <select
                      value={formState.subtitles}
                      onChange={e => setFormState(f => ({ ...f, subtitles: e.target.value }))}
                      className={styles.input}
                    >
                      {SUBTITLE_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt === 'NESSUNO' ? 'Nessuno' : `SUB ${opt}`}</option>
                      ))}

                    </select>
                  </div>
                </div>

                {/* Rating + Room */}
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Classificazione Età</label>
                    <select
                      value={formState.customRating}
                      onChange={e => setFormState(f => ({ ...f, customRating: e.target.value }))}
                      className={styles.input}
                    >
                      <option value="">Default TMDB</option>
                      <option value="T">T (Tutti)</option>
                      <option value="6+">6+</option>
                      <option value="10+">10+</option>
                      <option value="14+">14+</option>
                      <option value="18+">18+</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Nome Sala</label>
                    <input
                      type="text"
                      value={formState.customRoomName}
                      onChange={e => setFormState(f => ({ ...f, customRoomName: e.target.value }))}
                      className={styles.input}
                      placeholder="SALA CA GRANDA"
                    />
                  </div>
                </div>

                {/* Director + Cast */}
                <div className={styles.formGroup}>
                  <label className={styles.label}>Regista (separati da virgola)</label>
                  <input
                    type="text"
                    value={formState.customDirector}
                    onChange={e => setFormState(f => ({ ...f, customDirector: e.target.value }))}
                    className={styles.input}
                    placeholder="Nome Regista"
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Cast (separati da virgola)</label>
                  <input
                    type="text"
                    value={formState.customCast}
                    onChange={e => setFormState(f => ({ ...f, customCast: e.target.value }))}
                    className={styles.input}
                    placeholder="Attore 1, Attore 2, …"
                  />
                </div>

                {/* Divider */}
                <div className={styles.sectionDivider}><ImageIcon size={14} /> Immagini &amp; Media</div>

                {/* Poster */}
                <div className={styles.formGroup}>
                  <label className={styles.label}>Poster</label>
                  <div className={styles.mediaInputRow}>
                    {formState.customPosterPath && (
                      <div className={styles.thumbPoster}>
                        <img
                          src={formState.customPosterPath.startsWith('/')
                            ? getTMDBImageUrl(formState.customPosterPath, 'w92')!
                            : formState.customPosterPath}
                          alt="Poster"
                        />
                      </div>
                    )}
                    <input
                      type="text"
                      value={formState.customPosterPath}
                      onChange={e => setFormState(f => ({ ...f, customPosterPath: e.target.value }))}
                      className={styles.input}
                      placeholder="/path.jpg oppure URL completo"
                    />
                    <button
                      type="button"
                      className={styles.btnPick}
                      onClick={() => setPickerState({ isOpen: true, type: 'poster' })}
                      title="Scegli da TMDB"
                    >
                      <ImageIcon size={16} />
                    </button>
                  </div>
                </div>

                {/* Backdrop */}
                <div className={styles.formGroup}>
                  <label className={styles.label}>Backdrop</label>
                  <div className={styles.mediaInputRow}>
                    {formState.customBackdropPath && (
                      <div className={styles.thumbBackdrop}>
                        <img
                          src={formState.customBackdropPath.startsWith('/')
                            ? getTMDBImageUrl(formState.customBackdropPath, 'w300')!
                            : formState.customBackdropPath}
                          alt="Backdrop"
                        />
                      </div>
                    )}
                    <input
                      type="text"
                      value={formState.customBackdropPath}
                      onChange={e => setFormState(f => ({ ...f, customBackdropPath: e.target.value }))}
                      className={styles.input}
                      placeholder="/path.jpg oppure URL completo"
                    />
                    <button
                      type="button"
                      className={styles.btnPick}
                      onClick={() => setPickerState({ isOpen: true, type: 'backdrop' })}
                      title="Scegli da TMDB"
                    >
                      <ImageIcon size={16} />
                    </button>
                  </div>
                </div>

                {/* Logo */}
                <div className={styles.formGroup}>
                  <label className={styles.label}>Logo Film (TMDB)</label>
                  <div className={styles.mediaInputRow}>
                    {formState.customLogoPath && (
                      <div className={styles.thumbBackdrop} style={{ height: '50px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>
                        <img
                          src={formState.customLogoPath.startsWith('/')
                            ? getTMDBImageUrl(formState.customLogoPath, 'w300')!
                            : formState.customLogoPath}
                          alt="Logo"
                          style={{ maxHeight: '100%', objectFit: 'contain' }}
                        />
                      </div>
                    )}
                    <input
                      type="text"
                      value={formState.customLogoPath}
                      onChange={e => setFormState(f => ({ ...f, customLogoPath: e.target.value }))}
                      className={styles.input}
                      placeholder="/logo.png oppure URL completo"
                    />
                  </div>
                </div>

                {/* Trailer */}
                <div className={styles.formGroup}>
                  <label className={styles.label}><Play size={12} /> Trailer YouTube (Override)</label>
                  <div className={styles.mediaInputRow}>
                    {formState.customTrailerUrl && extractYouTubeId(formState.customTrailerUrl) && (
                      <div className={styles.thumbTrailer}>
                        <img
                          src={`https://img.youtube.com/vi/${extractYouTubeId(formState.customTrailerUrl)}/mqdefault.jpg`}
                          alt="Trailer"
                        />
                        <div className={styles.thumbPlayOverlay}><Play size={10} fill="white" color="white" /></div>
                      </div>
                    )}
                    <input
                      type="text"
                      value={formState.customTrailerUrl}
                      onChange={e => setFormState(f => ({ ...f, customTrailerUrl: e.target.value }))}
                      className={styles.input}
                      placeholder="https://www.youtube.com/watch?v=…"
                    />
                    <button
                      type="button"
                      className={styles.btnPick}
                      onClick={() => setPickerState({ isOpen: true, type: 'trailer' })}
                      title="Scegli da TMDB"
                    >
                      <Play size={16} />
                    </button>
                  </div>
                </div>

                {/* Overview */}
                <div className={styles.formGroup}>
                  <label className={styles.label}>Trama (Overview)</label>
                  <textarea
                    value={formState.customOverview}
                    onChange={e => setFormState(f => ({ ...f, customOverview: e.target.value }))}
                    className={styles.textarea}
                    rows={5}
                    placeholder="Descrizione del film…"
                  />
                </div>
                
                {/* MUBI Sync Info */}
                <div className={styles.sectionDivider}><Star size={14} /> MUBI Sync</div>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>MUBI ID / Slug</label>
                    <input 
                      type="text" 
                      value={formState.mubiId} 
                      onChange={e => setFormState(f => ({ ...f, mubiId: e.target.value }))} 
                      className={styles.input} 
                      placeholder="ID per sync manuale"
                    />
                  </div>
                </div>

                {/* Projections Table */}
                {programmedMovieData && programmedMovieData.projections && programmedMovieData.projections.length > 0 && (
                  <div className={styles.formGroup} style={{ marginTop: '24px' }}>
                    <div className={styles.sectionDivider}><Film size={14} /> Proiezioni Sincronizzate (PretixSync)</div>
                    <div style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px' }}>
                      <table style={{ width: '100%', fontSize: '0.85rem', textAlign: 'left', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ opacity: 0.7, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            <th style={{ padding: '8px' }}>Sala</th>
                            <th style={{ padding: '8px' }}>Data</th>
                            <th style={{ padding: '8px' }}>Ora Inizio</th>
                            <th style={{ padding: '8px' }}>Ora Fine</th>
                            <th style={{ padding: '8px' }}>Posti</th>
                          </tr>
                        </thead>
                        <tbody>
                          {programmedMovieData.projections.map((proj: any) => (
                            <tr key={proj.pretixId} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                              <td style={{ padding: '8px' }}>{proj.roomName || 'Sala'}</td>
                              <td style={{ padding: '8px' }}>{new Date(proj.dateFrom).toLocaleDateString('it-IT')}</td>
                              <td style={{ padding: '8px' }}>{proj.startTime || '-'}</td>
                              <td style={{ padding: '8px' }}>{proj.endTime || '-'}</td>
                              <td style={{ padding: '8px' }}>
                                {proj.isSoldOut ? (
                                  <span style={{ color: '#ff4444', fontWeight: 'bold' }}>SOLD OUT</span>
                                ) : (
                                  <span>{proj.availableSeats ?? '?'} / {proj.totalSeats ?? '?'}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Sold Out Kill Switch */}
                <label className={styles.killSwitchLabel}>
                  <input
                    type="checkbox"
                    checked={formState.manualSoldOut}
                    onChange={e => setFormState(f => ({ ...f, manualSoldOut: e.target.checked }))}
                    className={styles.killSwitchCheck}
                  />
                  <AlertTriangle size={14} />
                  Forza SOLD OUT (Kill-Switch)
                </label>

              </div>
            </section>
          ) : (
            <div className={styles.editorPlaceholder}>
              <div className={styles.placeholderIcon}><Film size={56} strokeWidth={0.8} /></div>
              <h3>Nessun film selezionato</h3>
              <p>Seleziona un film dalla lista a sinistra per aprire l'editor dei metadati.</p>

            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {pickerState.isOpen && editingMovie && pickerState.type !== 'trailer' && (
        <ImagePickerModal
          movieId={editingMovie.id?.toString() || editingMovie.tmdbId}
          type={pickerState.type as 'poster' | 'backdrop'}
          onSelect={handleImageSelect}
          onClose={() => setPickerState(s => ({ ...s, isOpen: false }))}
        />
      )}

      {pickerState.isOpen && editingMovie && pickerState.type === 'trailer' && (
        <TrailerPickerModal
          movieId={editingMovie.id?.toString() || editingMovie.tmdbId}
          onSelect={handleImageSelect}
          onClose={() => setPickerState(s => ({ ...s, isOpen: false }))}
          currentKey={extractYouTubeId(formState.customTrailerUrl) || undefined}
        />
      )}
      {isVisualCenterOpen && (
        <VisualControlCenter
          isOpen={isVisualCenterOpen}
          onClose={() => setIsVisualCenterOpen(false)}
          onRefresh={loadData}
        />
      )}
    </div>
  );
}
