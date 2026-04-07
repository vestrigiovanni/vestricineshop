"use client";

import React, { useState } from 'react';
import styles from './TMDBSearch.module.css';

interface TMDBMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  release_date: string;
}

export default function TMDBSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TMDBMovie[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setError('');
    setResults([]);

    try {
      const response = await fetch(`/api/admin/tmdb?q=${encodeURIComponent(query)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Errore durante la ricerca');
      }

      if (data.results && data.results.length > 0) {
        setResults(data.results);
      } else {
        setError('Nessun film trovato per questa ricerca.');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectMovie = async (movie: TMDBMovie) => {
    const dateTimeStr = prompt(`Pianifica spettacolo per "${movie.title}". Inserisci data e ora (Formato consigliato: YYYY-MM-DDTHH:mm):`, new Date().toISOString().slice(0, 16));
    if (!dateTimeStr) return;

    const generateRandomSlug = () => Math.random().toString(36).substring(2, 7);

    try {
      const res = await fetch('/api/admin/pretix/events/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: { it: movie.title, en: movie.title },
          date_from: new Date(dateTimeStr).toISOString(),
          slug: generateRandomSlug(),
          live: true
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.detail || JSON.stringify(data));
      }
      
      alert(`Spettacolo "${movie.title}" programmato con successo!`);
      // L'evento verrà ora visualizzato nella colonna "Prossimi Eventi" se ricaricati.
    } catch (err: any) {
      alert(`Errore nella pianificazione: ${err.message}`);
    }
  };

  return (
    <div className={styles.container}>
      <form onSubmit={handleSearch} className={styles.searchForm}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Inserisci il titolo del film..."
          className={styles.input}
        />
        <button type="submit" className={styles.searchButton} disabled={isLoading}>
          {isLoading ? 'Ricerca...' : 'Cerca su TMDB'}
        </button>
      </form>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.resultsGrid}>
        {results.map((movie) => (
          <div key={movie.id} className={styles.movieCard}>
            {movie.poster_path ? (
              <img
                src={`https://image.tmdb.org/t/p/w200${movie.poster_path}`}
                alt={movie.title}
                className={styles.poster}
              />
            ) : (
              <div className={styles.noPoster}>Nessuna locandina</div>
            )}
            <div className={styles.movieInfo}>
              <h3>{movie.title} <span>({movie.release_date?.substring(0, 4) || 'N/D'})</span></h3>
              <p className={styles.plot}>{movie.overview || 'Trama non disponibile.'}</p>
              <button 
                onClick={() => handleSelectMovie(movie)}
                className={styles.selectButton}
              >
                Pianifica Spettacolo
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
