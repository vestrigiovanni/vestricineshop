'use client';

import React, { useState, useEffect } from 'react';
import { X, Play, Globe, CheckCircle2, Loader2 } from 'lucide-react';
import Image from 'next/image';
import styles from './ImagePickerModal.module.css';

interface TrailerPickerModalProps {
  movieId: string;
  onSelect: (youtubeUrl: string) => void;
  onClose: () => void;
  currentKey?: string;
}

export default function TrailerPickerModal({ movieId, onSelect, onClose, currentKey }: TrailerPickerModalProps) {
  const [activeTab, setActiveTab] = useState<'it' | 'en'>('it');
  const [videos, setVideos] = useState<{ it: any[]; en: any[] }>({ it: [], en: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadVideos() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/tmdb/videos/${movieId}`);
        if (!res.ok) throw new Error('Errore nel caricamento trailer');
        const data = await res.json();
        setVideos(data);
        // If no Italian videos, switch to English tab automatically
        if (!data.it || data.it.length === 0) setActiveTab('en');
      } catch (e: any) {
        setError(e.message || 'Errore sconosciuto');
      } finally {
        setLoading(false);
      }
    }
    loadVideos();
  }, [movieId]);

  const currentVideos = activeTab === 'it' ? videos.it : videos.en;

  const handleSelect = (video: any) => {
    onSelect(`https://www.youtube.com/watch?v=${video.key}`);
    onClose();
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal} style={{ maxWidth: '820px', width: '90%' }}>
        <div className={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Play size={20} color="#e50914" />
            <h2 style={{ margin: 0 }}>Scegli Trailer da TMDB</h2>
          </div>
          <button onClick={onClose} className={styles.closeBtn}><X size={20} /></button>
        </div>

        {/* Language Tabs */}
        <div style={{ display: 'flex', gap: '10px', padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          {(['it', 'en'] as const).map(lang => (
            <button
              key={lang}
              onClick={() => setActiveTab(lang)}
              style={{
                padding: '8px 20px',
                borderRadius: '8px',
                background: activeTab === lang ? '#e50914' : 'rgba(255,255,255,0.05)',
                color: '#fff',
                border: activeTab === lang ? '1px solid #e50914' : '1px solid rgba(255,255,255,0.15)',
                cursor: 'pointer',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.9rem',
                transition: 'all 0.2s'
              }}
            >
              {lang === 'it' ? '🇮🇹 Italiano' : '🇺🇸 English'}
              <span style={{
                background: 'rgba(255,255,255,0.15)',
                borderRadius: '10px',
                padding: '1px 7px',
                fontSize: '0.75rem',
                fontWeight: 700
              }}>
                {loading ? '…' : (lang === 'it' ? videos.it.length : videos.en.length)}
              </span>
            </button>
          ))}
        </div>

        <div className={styles.body}>
          {loading ? (
            <div className={styles.loading}>
              <Loader2 className={styles.spinner} size={48} />
              <p>Caricamento trailer da TMDB...</p>
            </div>
          ) : error ? (
            <div className={styles.empty}>⚠️ {error}</div>
          ) : currentVideos.length === 0 ? (
            <div className={styles.empty}>
              <Play size={48} style={{ opacity: 0.2, marginBottom: '1rem', display: 'block', margin: '0 auto 1rem' }} />
              <p style={{ opacity: 0.6 }}>Nessun trailer trovato in {activeTab === 'it' ? 'Italiano' : 'Inglese'} su TMDB.</p>
              {activeTab === 'it' && (
                <button
                  onClick={() => setActiveTab('en')}
                  style={{
                    marginTop: '1rem',
                    padding: '8px 16px',
                    background: 'none',
                    border: '1px solid #e50914',
                    color: '#e50914',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  Prova in Inglese
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
              {currentVideos.map((video: any) => {
                const isActive = currentKey === video.key;
                return (
                  <div
                    key={video.key}
                    onClick={() => handleSelect(video)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: isActive ? '2px solid #e50914' : '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      position: 'relative'
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)';
                      (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                      (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                    }}
                  >
                    <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9' }}>
                      <Image
                        src={`https://img.youtube.com/vi/${video.key}/mqdefault.jpg`}
                        alt={video.name}
                        fill
                        style={{ objectFit: 'cover' }}
                        sizes="240px"
                      />
                      {/* Play button overlay */}
                      <div style={{
                        position: 'absolute', inset: 0,
                        background: 'rgba(0,0,0,0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        <div style={{
                          background: isActive ? '#e50914' : 'rgba(229,9,20,0.85)',
                          width: '44px', height: '44px',
                          borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                        }}>
                          <Play size={20} color="#fff" fill="#fff" />
                        </div>
                      </div>
                      {/* Badges */}
                      {video.official && (
                        <div style={{
                          position: 'absolute', top: '8px', right: '8px',
                          background: '#10b981', color: '#fff',
                          fontSize: '0.6rem', fontWeight: 800,
                          padding: '2px 6px', borderRadius: '4px',
                          textTransform: 'uppercase', letterSpacing: '0.5px'
                        }}>
                          Official
                        </div>
                      )}
                      {isActive && (
                        <div style={{ position: 'absolute', top: '8px', left: '8px' }}>
                          <CheckCircle2 size={22} color="#fff" fill="#e50914" />
                        </div>
                      )}
                    </div>
                    <div style={{ padding: '12px' }}>
                      <div style={{
                        fontWeight: 700, fontSize: '0.875rem', color: '#fff',
                        marginBottom: '4px',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}>
                        {video.name}
                      </div>
                      <div style={{
                        fontSize: '0.75rem', opacity: 0.55,
                        display: 'flex', alignItems: 'center', gap: '6px'
                      }}>
                        <Globe size={10} />
                        {video.iso_639_1?.toUpperCase()} • {video.type}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button onClick={onClose} className={styles.cancelBtn}>Chiudi</button>
        </div>
      </div>
    </div>
  );
}
