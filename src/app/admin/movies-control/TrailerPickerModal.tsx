'use client';

import React, { useState } from 'react';
import { X, Play, Globe, CheckCircle2 } from 'lucide-react';
import Image from 'next/image';
import styles from './ImagePickerModal.module.css';

interface TrailerPickerModalProps {
  multiLangVideos: {
    it: any[];
    en: any[];
  };
  onSelect: (key: string) => void;
  onClose: () => void;
  currentKey?: string;
}

export default function TrailerPickerModal({ multiLangVideos, onSelect, onClose, currentKey }: TrailerPickerModalProps) {
  const [activeTab, setActiveTab] = useState<'it' | 'en'>('it');
  
  // Ensure we have arrays even if undefined
  const itVideos = multiLangVideos?.it || [];
  const enVideos = multiLangVideos?.en || [];
  const videos = activeTab === 'it' ? itVideos : enVideos;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal} style={{ maxWidth: '800px', width: '90%' }}>
        <div className={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Play size={20} color="#e50914" />
            <h3>Scegli Trailer da TMDB</h3>
          </div>
          <button onClick={onClose} className={styles.closeBtn}><X size={20} /></button>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>
          <button 
            onClick={() => setActiveTab('it')}
            style={{ 
              padding: '10px 20px', 
              borderRadius: '8px', 
              background: activeTab === 'it' ? '#e50914' : 'rgba(255,255,255,0.05)',
              color: '#fff',
              border: activeTab === 'it' ? '1px solid #e50914' : '1px solid rgba(255,255,255,0.1)',
              cursor: 'pointer',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
          >
            🇮🇹 Italiano ({itVideos.length})
          </button>
          <button 
            onClick={() => setActiveTab('en')}
            style={{ 
              padding: '10px 20px', 
              borderRadius: '8px', 
              background: activeTab === 'en' ? '#e50914' : 'rgba(255,255,255,0.05)',
              color: '#fff',
              border: activeTab === 'en' ? '1px solid #e50914' : '1px solid rgba(255,255,255,0.1)',
              cursor: 'pointer',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
          >
            🇺🇸 English ({enVideos.length})
          </button>
        </div>
        
        <div className={styles.grid} style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', maxHeight: '500px', overflowY: 'auto', gap: '15px' }}>
          {videos.length > 0 ? (
            videos.map((video) => (
              <div 
                key={video.key} 
                className={`${styles.imageCard} ${currentKey === video.key ? styles.activeCard : ''}`} 
                onClick={() => onSelect(video.key)}
                style={{ 
                  display: 'flex', 
                  flexDirection: 'column',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: currentKey === video.key ? '2px solid #e50914' : '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'transform 0.2s'
                }}
              >
                <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9' }}>
                  <Image 
                    src={video.thumbnail} 
                    alt={video.name}
                    fill
                    style={{ objectFit: 'cover' }}
                    sizes="240px"
                  />
                  <div style={{ 
                    position: 'absolute', 
                    top: '50%', 
                    left: '50%', 
                    transform: 'translate(-50%, -50%)',
                    background: 'rgba(229, 9, 20, 0.8)',
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Play size={20} color="#fff" fill="#fff" />
                  </div>
                  {video.official && (
                    <div style={{ 
                      position: 'absolute', 
                      top: '8px', 
                      right: '8px',
                      background: '#10b981',
                      color: '#fff',
                      fontSize: '0.65rem',
                      fontWeight: '800',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      textTransform: 'uppercase'
                    }}>
                      Official
                    </div>
                  )}
                  {currentKey === video.key && (
                    <div style={{ 
                      position: 'absolute', 
                      top: '8px', 
                      left: '8px',
                      color: '#10b981',
                    }}>
                      <CheckCircle2 size={24} fill="rgba(255,255,255,0.9)" />
                    </div>
                  )}
                </div>
                <div style={{ padding: '12px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#fff', marginBottom: '4px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', height: '2.4em' }}>
                    {video.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.6, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Globe size={10} /> {video.iso_639_1.toUpperCase()} • {video.type}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem 2rem' }}>
              <Play size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
              <p style={{ opacity: 0.5, fontSize: '1.1rem' }}>
                Nessun video trovato in {activeTab === 'it' ? 'Italiano' : 'Inglese'} su TMDB.
              </p>
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
                  Prova a cercare in Inglese
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
