'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { X, Loader2, Check } from 'lucide-react';
import styles from './ImagePickerModal.module.css';

const getTMDBImageUrl = (path: string, size: string = 'w500') =>
  `https://image.tmdb.org/t/p/${size}${path}`;

interface ImagePickerModalProps {
  movieId: string;
  type: 'poster' | 'backdrop' | 'logo';
  onSelect: (path: string) => void;
  onClose: () => void;
}

export default function ImagePickerModal({ movieId, type, onSelect, onClose }: ImagePickerModalProps) {
  const [images, setImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadImages() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/tmdb/images/${movieId}`);
        if (!res.ok) throw new Error('Errore nel caricamento immagini');
        const data = await res.json();
        if (type === 'poster') {
          setImages(data.posters || []);
        } else if (type === 'backdrop') {
          setImages(data.backdrops || []);
        } else {
          setImages(data.logos || []);
        }
      } catch (e: any) {
        setError(e.message || 'Errore sconosciuto');
      } finally {
        setLoading(false);
      }
    }
    loadImages();
  }, [movieId, type]);

  const confirmSelection = () => {
    if (selectedPath) {
      onSelect(selectedPath);
      onClose();
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Seleziona {type === 'poster' ? 'Poster' : type === 'backdrop' ? 'Backdrop' : 'Logo'}</h2>
          <button onClick={onClose} className={styles.closeBtn}><X size={24} /></button>
        </div>

        <div className={styles.body}>
          {loading ? (
            <div className={styles.loading}>
              <Loader2 className={styles.spinner} size={48} />
              <p>Caricamento immagini da TMDB...</p>
            </div>
          ) : error ? (
            <div className={styles.empty}>⚠️ {error}</div>
          ) : images.length === 0 ? (
            <div className={styles.empty}>Nessun logo o immagine trovato su TMDB per questa categoria.</div>
          ) : (
            <div className={type === 'poster' ? styles.posterGrid : styles.backdropGrid}>
              {images.map((img) => (
                <div
                  key={img.file_path}
                  className={`${styles.imageItem} ${selectedPath === img.file_path ? styles.selected : ''}`}
                  onClick={() => setSelectedPath(img.file_path)}
                >
                  <div className={styles.imageWrapper}>
                    <Image
                      src={getTMDBImageUrl(img.file_path, type === 'poster' ? 'w342' : 'w780')}
                      alt="TMDB Image"
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      style={type === 'logo' ? { objectFit: 'contain', padding: '12px', background: 'rgba(255,255,255,0.03)' } : { objectFit: 'cover' }}
                    />
                    {selectedPath === img.file_path && (
                      <div className={styles.checkOverlay}>
                        <Check size={32} color="white" />
                      </div>
                    )}
                  </div>
                  {img.iso_639_1 && (
                    <span className={styles.langBadge}>{img.iso_639_1.toUpperCase()}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button onClick={onClose} className={styles.cancelBtn}>Annulla</button>
          <button
            onClick={confirmSelection}
            className={styles.confirmBtn}
            disabled={!selectedPath}
          >
            Conferma Selezione
          </button>
        </div>
      </div>
    </div>
  );
}
