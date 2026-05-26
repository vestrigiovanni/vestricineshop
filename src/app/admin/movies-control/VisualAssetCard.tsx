'use client';

import React, { useState, useEffect } from 'react';
import { ImageIcon, Play, Link, CheckCircle2, Globe, Search, Eye, EyeOff } from 'lucide-react';
import styles from './VisualControlCenter.module.css';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import { extractYouTubeId } from '@/utils/youtubeUtils';

interface VisualAssetCardProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onPickClick?: () => void;
  type: 'poster' | 'backdrop' | 'trailer' | 'logo';
  tmdbFallback?: string;
}

export default function VisualAssetCard({ label, value, onChange, onPickClick, type, tmdbFallback }: VisualAssetCardProps) {
  const [inputValue, setInputValue] = useState(value);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setInputValue(newVal);
    onChange(newVal);
  };

  const isOverridden = !!value;
  const isHidden = value === 'none';
  const currentPath = isHidden ? '' : (value || tmdbFallback);
  
  let previewUrl = '';
  if (currentPath) {
    if (type === 'trailer') {
      const ytId = extractYouTubeId(currentPath);
      if (ytId) previewUrl = `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`;
    } else {
      previewUrl = currentPath.startsWith('/') 
        ? getTMDBImageUrl(currentPath, type === 'poster' ? 'w185' : 'w300')! 
        : currentPath;
    }
  }

  return (
    <div className={styles.assetCard}>
      <div className={styles.assetHeader}>
        <span className={styles.assetLabel}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {type === 'logo' && (
            <button
              type="button"
              onClick={() => {
                const newVal = isHidden ? '' : 'none';
                setInputValue(newVal);
                onChange(newVal);
              }}
              style={{
                background: isHidden ? 'rgba(39, 174, 96, 0.1)' : 'rgba(255, 69, 58, 0.1)',
                border: `1px solid ${isHidden ? 'rgba(39, 174, 96, 0.3)' : 'rgba(255, 69, 58, 0.3)'}`,
                color: isHidden ? '#27ae60' : '#ff453a',
                fontSize: '0.6rem',
                fontWeight: 800,
                padding: '2px 6px',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s'
              }}
              title={isHidden ? 'Mostra il logo sul sito' : 'Nascondi completamente il logo sul sito e usa il titolo testuale'}
            >
              {isHidden ? <Eye size={10} /> : <EyeOff size={10} />}
              {isHidden ? 'MOSTRA' : 'NASCONDI'}
            </button>
          )}
          {isOverridden ? (
            <span className={styles.badgeMod}>
              <CheckCircle2 size={10} /> PERSONALIZZATO
            </span>
          ) : (
            <span className={styles.badgeTmdb}>
              <Globe size={10} /> TMDB ORIGINAL
            </span>
          )}
        </div>
      </div>
      
      <div 
        className={`${styles.assetPreview} ${styles[type]} ${!isOverridden ? styles.tmdbOpacity : ''} ${onPickClick && !isHidden ? styles.clickable : ''}`}
        onClick={isHidden ? undefined : onPickClick}
      >
        {isHidden ? (
          <div className={styles.previewPlaceholder} style={{ background: 'rgba(255, 69, 58, 0.08)', color: '#ff453a', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <EyeOff size={24} />
            <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Logo Nascosto</span>
          </div>
        ) : previewUrl ? (
          <img 
            src={previewUrl} 
            alt={label} 
            className={styles.previewImage}
            loading="lazy"
          />
        ) : (
          <div className={styles.previewPlaceholder}>
            {type === 'trailer' ? <Play size={24} /> : <ImageIcon size={24} />}
          </div>
        )}
        {!isOverridden && !isHidden && <div className={styles.tmdbOverlay}>DATA FROM TMDB</div>}
        
        {!isHidden && (
          <div className={styles.assetHoverOverlay}>
            <Search size={24} />
            <span>Sfoglia TMDB</span>
          </div>
        )}
      </div>

      <div className={styles.assetInputWrapper}>
        <input
          type="text"
          value={inputValue === 'none' ? 'LOGO NASCOSTO / HIDDEN' : inputValue}
          disabled={isHidden}
          onChange={handleChange}
          placeholder={tmdbFallback ? `TMDB: ${tmdbFallback}` : "Incolla URL..."}
          className={`${styles.assetInput} ${isOverridden ? styles.inputModified : ''}`}
          style={isHidden ? { opacity: 0.6, color: '#ff453a', fontStyle: 'italic', fontWeight: 'bold' } : undefined}
        />
        <div className={styles.assetInputIcon}>
          <Link size={14} />
        </div>
      </div>
    </div>
  );
}
