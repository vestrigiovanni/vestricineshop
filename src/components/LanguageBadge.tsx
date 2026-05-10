import React from 'react';
import styles from './LanguageBadge.module.css';
import { Languages } from 'lucide-react';
import { getFullLanguageName } from '@/constants/languages';


interface LanguageBadgeProps {
  language?: string;
  subtitles?: string;
  version?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export default function LanguageBadge({ 
  language, 
  subtitles, 
  version,
  size = 'md',
  showLabel = true
}: LanguageBadgeProps) {
  const hasSubtitles = subtitles && subtitles !== 'NESSUNO' && subtitles !== 'Nessuno';

  const getShortLang = (lang: string) => {
    const l = lang.toLowerCase();
    if (l === 'italiano') return 'ITA';
    if (l === 'francese') return 'FRA';
    if (l === 'inglese') return 'ING';
    if (l === 'lingua originale') return 'V.O.';
    return lang.toUpperCase();
  };

  return (
    <div className={`${styles.badgeContainer} ${styles[size]}`}>
      {language && (
        <div className={styles.langBadge} title={getFullLanguageName(language)}>
          {getShortLang(language)}
        </div>
      )}
      {version && version !== 'Versione Originale' && version !== '' && (
        <div className={styles.versionBadge} title={`Versione: ${version}`}>
          {version.toUpperCase()}
        </div>
      )}
      {hasSubtitles && (
        <div className={styles.subBadge} title={`Sottotitoli: ${getFullLanguageName(subtitles)}`}>

          <Languages size={size === 'xs' ? 8 : (size === 'sm' ? 10 : 14)} className={styles.icon} />

          <span>{showLabel ? `SUB ${getShortLang(subtitles)}` : getShortLang(subtitles)}</span>
        </div>
      )}
    </div>
  );
}
