import React from 'react';
import styles from './LanguageBadge.module.css';
import { Languages } from 'lucide-react';
import { getFullLanguageName } from '@/constants/languages';


interface LanguageBadgeProps {
  language?: string;
  subtitles?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showLabel?: boolean;

}

export default function LanguageBadge({ 
  language, 
  subtitles, 
  size = 'md',
  showLabel = true
}: LanguageBadgeProps) {
  const hasSubtitles = subtitles && subtitles !== 'NESSUNO' && subtitles !== 'Nessuno';

  return (
    <div className={`${styles.badgeContainer} ${styles[size]}`}>
      {language && (
        <div className={styles.langBadge} title={getFullLanguageName(language)}>
          {language.toUpperCase()}
        </div>
      )}
      {hasSubtitles && (
        <div className={styles.subBadge} title={`Sottotitoli: ${getFullLanguageName(subtitles)}`}>

          <Languages size={size === 'xs' ? 8 : (size === 'sm' ? 10 : 14)} className={styles.icon} />

          <span>{showLabel ? `SUB ${subtitles.toUpperCase()}` : subtitles.toUpperCase()}</span>
        </div>
      )}
    </div>
  );
}
