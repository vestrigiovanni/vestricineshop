'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import {
  adminGetOverrides,
  adminSaveOverride,
  adminDeleteOverride,
  adminGetProgrammedMovies,
  adminGetMovieById,
  adminClearMovieMetadata,
  adminSyncSoldOutStatus,
  adminSearchMovies,
} from '@/actions/adminActions';
import { getTMDBImageUrl } from '@/services/tmdb';
import Image from 'next/image';
import {
  Save, Trash2, Search, Edit3, X, Info, Globe, Languages,
  Image as ImageIcon, RefreshCw, Play, CheckCircle2, Film,
  AlertTriangle, Loader2, ChevronRight, Star, Sparkles, LayoutGrid
} from 'lucide-react';
import styles from './MoviesControl.module.css';
import ImagePickerModal from './ImagePickerModal';
import TrailerPickerModal from './TrailerPickerModal';
import VisualControlCenter from './VisualControlCenter';
import { extractYouTubeId } from '@/utils/youtubeUtils';

const EMPTY_FORM = {
  customTitle: '',
  customOverview: '',
  versionLanguage: 'Lingua Originale',
  subtitles: 'Nessuno',
  customPosterPath: '',
  customBackdropPath: '',
  customDirector: '',
  customCast: '',
  customRoomName: 'SALA CA GRANDA',
  customRating: '',
  manualSoldOut: false,
  customTrailerUrl: '',
};

export default function MoviesControlPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [overrides, setOverrides] = useState<Record<string, any>>({});
  const [programmedMovies, setProgrammedMovies] = useState<any[]>([]);
  const [editingMovie, setEditingMovie] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
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

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    const results = await adminSearchMovies(searchQuery);
    setSearchResults(results);
    setSearching(false);
  };

  const openEditor = (movie: any) => {
    const override = overrides[movie.id?.toString() || movie.tmdbId] || {};
    setEditingMovie(movie);
    setSaveSuccess(false);
    setFormState({
      customTitle: override.customTitle || movie.title || '',
      customOverview: override.customOverview || movie.overview || '',
      versionLanguage: override.versionLanguage || 'Lingua Originale',
      subtitles: override.subtitles || 'Nessuno',
      customPosterPath: override.customPosterPath || movie.poster_path || '',
      customBackdropPath: override.customBackdropPath || movie.backdrop_path || '',
      customDirector: override.customDirector?.join(', ') || movie.director || '',
      customCast: override.customCast?.join(', ') || movie.cast?.join(', ') || '',
      customRoomName: override.customRoomName || 'SALA CA GRANDA',
      customRating: override.customRating || movie.rating || '',
      manualSoldOut: override.manualSoldOut || false,
      customTrailerUrl: override.customTrailerUrl || (movie.trailerKey ? `https://www.youtube.com/watch?v=${movie.trailerKey}` : ''),
    });
  };

  const handleSelectProgrammed = async (tmdbId: string) => {
    setLoading(true);
    try {
      const movie = await adminGetMovieById(tmdbId);
      if (movie) openEditor(movie);
    } catch {
      alert('Errore nel recupero dettagli film');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editingMovie) return;
    setLoading(true);
    setSaveSuccess(false);
    const id = editingMovie.id?.toString() || editingMovie.tmdbId;
    const payload = {
      ...formState,
      customDirector: formState.customDirector
        ? formState.customDirector.split(',').map((s: string) => s.trim()).filter(Boolean)
        : undefined,
      customCast: formState.customCast
        ? formState.customCast.split(',').map((s: string) => s.trim()).filter(Boolean)
        : undefined,
    };
    await adminSaveOverride(id, payload);
    // Re-fetch overrides immediately so the UI reflects the change
    await loadData();
    setSaveSuccess(true);
    setLoading(false);
    setTimeout(() => setSaveSuccess(false), 3000);
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
                  const hasOverride = !!overrides[movie.tmdbId];
                  return (
                    <div
                      key={movie.tmdbId}
                      className={`${styles.programmedRow} ${isEditing ? styles.programmedRowActive : ''}`}
                      onClick={() => handleSelectProgrammed(movie.tmdbId)}
                    >
                      <div className={styles.programmedInfo}>
                        <strong>{movie.title}</strong>
                        <span>Prossima: {new Date(movie.lastDate).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}</span>
                      </div>
                      <div className={styles.programmedRight}>
                        {hasOverride && <span className={styles.overrideBadge}>✓ Override</span>}
                        <ChevronRight size={16} className={styles.chevron} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Search TMDB */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <Search size={16} className={styles.cardIcon} />
              <span>Cerca Film su TMDB</span>
            </div>
            <div className={styles.searchBar}>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Titolo del film…"
                className={styles.input}
              />
              <button onClick={handleSearch} className={styles.btnSearch} disabled={searching}>
                {searching ? <Loader2 size={16} className={styles.spin} /> : <Search size={16} />}
              </button>
            </div>
            {searchResults.length > 0 && (
              <div className={styles.resultsGrid}>
                {searchResults.map(movie => (
                  <div
                    key={movie.id}
                    className={`${styles.movieCard} ${editingId === movie.id?.toString() ? styles.movieCardActive : ''}`}
                    onClick={() => openEditor(movie)}
                    title={movie.title}
                  >
                    <div className={styles.posterThumb}>
                      {movie.poster_path ? (
                        <Image
                          src={getTMDBImageUrl(movie.poster_path, 'w185')!}
                          alt={movie.title}
                          fill
                          sizes="120px"
                          style={{ objectFit: 'cover' }}
                        />
                      ) : (
                        <div className={styles.noPoster}><Film size={24} /></div>
                      )}
                      {overrides[movie.id?.toString()] && (
                        <div className={styles.overlayCk}><CheckCircle2 size={16} /></div>
                      )}
                    </div>
                    <div className={styles.movieCardInfo}>
                      <span className={styles.movieCardTitle}>{movie.title}</span>
                      <span className={styles.movieCardYear}>{movie.release_date?.slice(0, 4)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Active Overrides */}
          {Object.keys(overrides).length > 0 && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <Star size={16} className={styles.cardIcon} />
                <span>Override Attivi</span>
                <span className={styles.countBadge}>{Object.keys(overrides).length}</span>
              </div>
              <div className={styles.overridesList}>
                {Object.entries(overrides).map(([id, ov]: [string, any]) => (
                  <div key={id} className={styles.overrideRow}>
                    <div className={styles.overrideInfo}>
                      <strong>{ov.customTitle || 'Film senza titolo'}</strong>
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
                      <option value="Lingua Originale">Lingua Originale</option>
                      <option value="English Version">English Version</option>
                      <option value="Versione Originale">Versione Originale</option>
                      <option value="Version Française">Version Française</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label}><Languages size={12} /> Sottotitoli</label>
                    <select
                      value={formState.subtitles}
                      onChange={e => setFormState(f => ({ ...f, subtitles: e.target.value }))}
                      className={styles.input}
                    >
                      <option value="Nessuno">Nessuno</option>
                      <option value="Italiano">Sottotitoli Italiano</option>
                      <option value="Sub ITA">Sub ITA</option>
                      <option value="English">Sub English</option>
                      <option value="Sub ENG">Sub ENG</option>
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

                {/* Save Button */}
                <button onClick={handleSave} className={`${styles.btnSave} ${saveSuccess ? styles.btnSaveSuccess : ''}`} disabled={loading}>
                  {loading ? (
                    <><Loader2 size={18} className={styles.spin} /> Salvataggio…</>
                  ) : saveSuccess ? (
                    <><CheckCircle2 size={18} /> Salvato con Successo!</>
                  ) : (
                    <><Save size={18} /> Salva Override</>
                  )}
                </button>
              </div>
            </section>
          ) : (
            <div className={styles.editorPlaceholder}>
              <div className={styles.placeholderIcon}><Film size={56} strokeWidth={0.8} /></div>
              <h3>Nessun film selezionato</h3>
              <p>Seleziona un film dalla lista a sinistra oppure cercane uno su TMDB per aprire l'editor dei metadati.</p>
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
