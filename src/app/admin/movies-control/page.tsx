'use client';

import { useState, useEffect } from 'react';
import { adminGetOverrides, adminSaveOverride, adminDeleteOverride, adminGetProgrammedMovies, adminGetMovieById } from '@/actions/adminActions';
import { searchMovies, MovieItem, getTMDBImageUrl } from '@/services/tmdb';
import Image from 'next/image';
import { Save, Trash2, Search, Edit3, X, Info, Globe, Languages } from 'lucide-react';
import styles from './MoviesControl.module.css';

export default function MoviesControlPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MovieItem[]>([]);
  const [overrides, setOverrides] = useState<Record<string, any>>({});
  const [programmedMovies, setProgrammedMovies] = useState<any[]>([]);
  const [editingMovie, setEditingMovie] = useState<MovieItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [formState, setFormState] = useState({
    customTitle: '',
    customOverview: '',
    versionLanguage: 'Versione Italiana',
    subtitles: 'Nessuno',
    customPosterPath: '',
    customBackdropPath: '',
    customDirector: '',
    customCast: '',
    customRoomName: '',
    customRating: '',
    manualSoldOut: false
  });

  useEffect(() => {
    loadOverrides();
  }, []);

  const loadOverrides = async () => {
    const [ovData, progData] = await Promise.all([
      adminGetOverrides(),
      adminGetProgrammedMovies()
    ]);
    setOverrides(ovData);
    setProgrammedMovies(progData);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    const results = await searchMovies(searchQuery);
    setSearchResults(results);
    setLoading(false);
  };

  const openEditor = (movie: MovieItem) => {
    const override = overrides[movie.id.toString()] || {};
    setEditingMovie(movie);
    setFormState({
      customTitle: override.customTitle || movie.title,
      customOverview: override.customOverview || movie.overview,
      versionLanguage: override.versionLanguage || 'Versione Italiana',
      subtitles: override.subtitles || 'Nessuno',
      customPosterPath: override.customPosterPath || movie.poster_path || '',
      customBackdropPath: override.customBackdropPath || movie.backdrop_path || '',
      customDirector: override.customDirector?.join(', ') || '',
      customCast: override.customCast?.join(', ') || '',
      customRoomName: override.customRoomName || '',
      customRating: override.customRating || movie.rating || '',
      manualSoldOut: override.manualSoldOut || false
    });
  };

  const handleSelectProgrammed = async (tmdbId: string) => {
    setLoading(true);
    try {
      const movie = await adminGetMovieById(tmdbId);
      if (movie) {
        openEditor(movie);
      }
    } catch (e) {
      alert('Errore nel recupero dettagli film');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editingMovie) return;
    setLoading(true);
    const savePayload = {
      ...formState,
      customDirector: formState.customDirector ? formState.customDirector.split(',').map(s => s.trim()) : undefined,
      customCast: formState.customCast ? formState.customCast.split(',').map(s => s.trim()) : undefined
    };
    await adminSaveOverride(editingMovie.id.toString(), savePayload);
    await loadOverrides();
    setEditingMovie(null);
    setLoading(false);
  };

  const handleDelete = async (tmdbId: string) => {
    if (!confirm('Sei sicuro di voler eliminare gli override per questo film?')) return;
    setLoading(true);
    await adminDeleteOverride(tmdbId);
    await loadOverrides();
    setLoading(false);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Torre di Controllo: Movie Overrides</h1>
          <p className={styles.subtitle}>Gestisci i metadati, la lingua e le versioni dei film indipendentemente da TMDB.</p>
        </div>
      </header>

      <div className={styles.mainGrid}>
        {/* Left Column: Search & Current Overrides */}
        <div className={styles.leftCol}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}><Edit3 size={18} /> Film Programmati sul Sito</h2>
            <p className={styles.sectionDesc}>Clicca su un film per sovrascrivere i suoi dati.</p>
            <div className={styles.programmedList}>
              {programmedMovies.length === 0 ? (
                <p className={styles.emptyState}>Nessun film programmato al momento.</p>
              ) : (
                programmedMovies.map(movie => (
                  <div key={movie.tmdbId} className={styles.programmedRow} onClick={() => handleSelectProgrammed(movie.tmdbId)}>
                    <div className={styles.programmedInfo}>
                      <strong>{movie.title}</strong>
                      <span>Ultima proiezione: {new Date(movie.lastDate).toLocaleDateString('it-IT')}</span>
                    </div>
                    {overrides[movie.tmdbId] && <span className={styles.overrideBadge}>Override Attivo</span>}
                    <Edit3 size={14} className={styles.editIcon} />
                  </div>
                ))
              )}
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}><Search size={18} /> Cerca Altri Film su TMDB</h2>
            <div className={styles.searchBar}>
              <input 
                type="text" 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cerca per titolo..."
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className={styles.input}
              />
              <button onClick={handleSearch} className={styles.btnPrimary} disabled={loading}>
                {loading ? '...' : 'Cerca'}
              </button>
            </div>

            <div className={styles.resultsGrid}>
              {searchResults.map(movie => (
                <div key={movie.id} className={styles.movieCard} onClick={() => openEditor(movie)}>
                  <div className={styles.posterThumb}>
                    {movie.poster_path ? (
                      <Image src={getTMDBImageUrl(movie.poster_path, 'w185')!} alt={movie.title} fill />
                    ) : (
                      <div className={styles.noPoster}>No Img</div>
                    )}
                  </div>
                  <div className={styles.movieInfo}>
                    <h3>{movie.title}</h3>
                    <p>{movie.release_date?.split('-')[0]}</p>
                    {overrides[movie.id.toString()] && <span className={styles.overrideBadge}>Override Attivo</span>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}><Edit3 size={18} /> Override Attivi</h2>
            <div className={styles.overridesList}>
              {Object.keys(overrides).length === 0 ? (
                <p className={styles.emptyState}>Nessun override configurato.</p>
              ) : (
                Object.entries(overrides).map(([id, ov]: [string, any]) => (
                  <div key={id} className={styles.overrideRow}>
                    <div className={styles.overrideMain}>
                      <strong>{ov.customTitle}</strong>
                      <span>ID: {id} • {ov.versionLanguage}</span>
                    </div>
                    <div className={styles.overrideActions}>
                      <button onClick={() => handleDelete(id)} className={styles.btnDelete}><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Editor */}
        <div className={styles.rightCol}>
          {editingMovie ? (
            <section className={styles.editorSection}>
              <div className={styles.editorHeader}>
                <h2>Editor Override</h2>
                <button onClick={() => setEditingMovie(null)} className={styles.btnClose}><X size={20} /></button>
              </div>

              <div className={styles.editorBody}>
                <div className={styles.formGroup}>
                  <label>Titolo Personalizzato</label>
                  <input 
                    type="text" 
                    value={formState.customTitle} 
                    onChange={(e) => setFormState({...formState, customTitle: e.target.value})}
                    className={styles.input}
                  />
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label><Globe size={14} /> Versione (Lingua)</label>
                    <select 
                      value={formState.versionLanguage} 
                      onChange={(e) => setFormState({...formState, versionLanguage: e.target.value})}
                      className={styles.input}
                    >
                      <option value="Versione Italiana">Versione Italiana</option>
                      <option value="Lingua Originale">Lingua Originale</option>
                      <option value="English Version">English Version</option>
                      <option value="Versione Originale">Versione Originale</option>
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <label><Languages size={14} /> Sottotitoli</label>
                    <select 
                      value={formState.subtitles} 
                      onChange={(e) => setFormState({...formState, subtitles: e.target.value})}
                      className={styles.input}
                    >
                      <option value="Nessuno">Nessuno</option>
                      <option value="Italiano">Sottotitoli in Italiano</option>
                      <option value="Sub ITA">Sub ITA</option>
                      <option value="English">Sub English</option>
                      <option value="Sub ENG">Sub ENG</option>
                    </select>
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label>Rating (Età)</label>
                  <select 
                    value={formState.customRating} 
                    onChange={(e) => setFormState({...formState, customRating: e.target.value})}
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
                  <label>Regista (separati da virgola)</label>
                  <input 
                    type="text" 
                    value={formState.customDirector} 
                    onChange={(e) => setFormState({...formState, customDirector: e.target.value})}
                    className={styles.input}
                    placeholder="Quentin Tarantino"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Cast (separati da virgola)</label>
                  <input 
                    type="text" 
                    value={formState.customCast} 
                    onChange={(e) => setFormState({...formState, customCast: e.target.value})}
                    className={styles.input}
                    placeholder="Brad Pitt, Leonardo DiCaprio"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Nome Sala Personalizzato</label>
                  <input 
                    type="text" 
                    value={formState.customRoomName} 
                    onChange={(e) => setFormState({...formState, customRoomName: e.target.value})}
                    className={styles.input}
                    placeholder="SALA CA GRANDA"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Poster URL (Opzionale)</label>
                  <input 
                    type="text" 
                    value={formState.customPosterPath} 
                    onChange={(e) => setFormState({...formState, customPosterPath: e.target.value})}
                    className={styles.input}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Backdrop URL (Opzionale)</label>
                  <input 
                    type="text" 
                    value={formState.customBackdropPath} 
                    onChange={(e) => setFormState({...formState, customBackdropPath: e.target.value})}
                    className={styles.input}
                  />
                </div>

                <div className={styles.formGroup} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '15px', padding: '10px', background: '#ffebee', borderRadius: '8px' }}>
                  <input 
                    type="checkbox" 
                    id="manualSoldOut"
                    checked={formState.manualSoldOut} 
                    onChange={(e) => setFormState({...formState, manualSoldOut: e.target.checked})}
                    style={{ width: '20px', height: '20px', accentColor: '#d32f2f' }}
                  />
                  <label htmlFor="manualSoldOut" style={{ color: '#d32f2f', fontWeight: 'bold', margin: 0, cursor: 'pointer' }}>Forza Sold Out (Kill-Switch)</label>
                </div>

                <div className={styles.formGroup} style={{ marginTop: '15px' }}>
                  <label>Overview (Trama)</label>
                  <textarea 
                    value={formState.customOverview} 
                    onChange={(e) => setFormState({...formState, customOverview: e.target.value})}
                    className={styles.textarea}
                    rows={6}
                  />
                </div>

                <button onClick={handleSave} className={styles.btnSave} disabled={loading}>
                  <Save size={18} /> {loading ? 'Salvataggio...' : 'Salva Override'}
                </button>
              </div>
            </section>
          ) : (
            <div className={styles.editorPlaceholder}>
              <Info size={48} strokeWidth={1} />
              <h3>Seleziona un film per iniziare</h3>
              <p>Cerca un film a sinistra o seleziona un override esistente per modificarlo.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
