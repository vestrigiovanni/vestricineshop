'use client';

import { useState } from 'react';
import { Search, Loader2, Plus, Calendar } from 'lucide-react';
import { searchMovies, MovieItem, getTMDBImageUrl } from '@/services/tmdb';
import RatingBadge from './RatingBadge';
import styles from './AdminSearch.module.css';

export default function AdminSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MovieItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    try {
      const data = await searchMovies(query);
      setResults(data);
    } catch (error) {
      console.error('Search failed', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.searchWrapper}>
      <form onSubmit={handleSearch} className={styles.searchBar}>
        <input
          type="text"
          placeholder="Cerca un film su TMDB..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={styles.searchInput}
        />
        <button type="submit" className={styles.searchButton} disabled={isLoading}>
          {isLoading ? <Loader2 className={styles.spinner} /> : <Search size={20} />}
        </button>
      </form>

      <div className={styles.resultsGrid}>
        {results.map((movie) => (
          <div key={movie.id} className={styles.movieCard}>
            <div className={styles.posterWrapper}>
              {movie.poster_path ? (
                <img src={getTMDBImageUrl(movie.poster_path)!} alt={movie.title} />
              ) : (
                <div className={styles.noPoster}>Nessuna immagine</div>
              )}
            </div>
            <div className={styles.movieInfo}>
              <div className={styles.titleRow}>
                <h3>{movie.title}</h3>
                {movie.rating && <RatingBadge id={movie.rating} size="sm" />}
              </div>
              <p className={styles.date}>{movie.release_date}</p>
              <button className={styles.addButton}>
                <Plus size={16} />
                Programma
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
