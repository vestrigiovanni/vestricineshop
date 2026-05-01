'use client';

import React, { useState, useEffect } from 'react';
import { ImageIcon, Play, Link, CheckCircle2, Globe, Search } from 'lucide-react';
import styles from './VisualControlCenter.module.css';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import { extractYouTubeId } from '@/utils/youtubeUtils';

interface VisualAssetCardProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onPickClick?: () => void;
  type: 'poster' | 'backdrop' | 'trailer';
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
  const currentPath = value || tmdbFallback;
  
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
      
      <div 
        className={`${styles.assetPreview} ${styles[type]} ${!isOverridden ? styles.tmdbOpacity : ''} ${onPickClick ? styles.clickable : ''}`}
        onClick={onPickClick}
      >
        {previewUrl ? (
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
        {!isOverridden && <div className={styles.tmdbOverlay}>DATA FROM TMDB</div>}
        
        <div className={styles.assetHoverOverlay}>
          <Search size={24} />
          <span>Sfoglia TMDB</span>
        </div>
      </div>

      <div className={styles.assetInputWrapper}>
        <input
          type="text"
          value={inputValue}
          onChange={handleChange}
          placeholder={tmdbFallback ? `TMDB: ${tmdbFallback}` : "Incolla URL..."}
          className={`${styles.assetInput} ${isOverridden ? styles.inputModified : ''}`}
        />
        <div className={styles.assetInputIcon}>
          <Link size={14} />
        </div>
      </div>
    </div>
  );
}
