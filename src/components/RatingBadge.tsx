'use client';

import React from 'react';
import styles from './RatingBadge.module.css';
import { isVM18, isVM14, normalizeRating } from '@/utils/ratingUtils';

interface RatingBadgeProps {
  rating?: string;
  id?: string; // Alias for rating
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const RatingBadge: React.FC<RatingBadgeProps> = ({ 
  rating, 
  id,
  size = 'md',
  className = ''
}) => {
  const effectiveRating = (id || rating || 'T').toUpperCase();
  if (!effectiveRating) return null;

  const getBadgeClass = () => {
    const r = effectiveRating;
    if (r === 'T' || r === 'PT') return styles.green;
    if (r === '6' || r === '6+') return styles.yellow;
    if (isVM18(r)) return styles.red;
    if (isVM14(r)) return styles.orange;
    return styles.green;
  };

  const currentRating = () => {
    return normalizeRating(effectiveRating);
  };

  return (
    <div 
      className={[styles.badge, getBadgeClass(), styles[size], className].filter(Boolean).join(' ')}
      title={`Classificazione: ${currentRating()}`}
    >
      {currentRating()}
    </div>
  );
};

export default RatingBadge;
