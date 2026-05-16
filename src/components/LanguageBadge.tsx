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

  const getDisplayLang = (lang: string) => {
    const l = lang.toLowerCase();
    if (l === 'ita' || l === 'italiano') return 'ITALIANO';
    if (l === 'fra' || l === 'francese') return 'FRANCESE';
    if (l === 'eng' || l === 'inglese' || l === 'english') return 'INGLESE';
    if (l === 'gia' || l === 'jpn' || l === 'giapponese') return 'GIAPPONESE';
    if (l === 'lingua originale' || l === 'originale') return 'V.O.';
    return getFullLanguageName(lang).toUpperCase();
  };

  const getShortLang = (lang: string) => {
    const l = lang.toLowerCase();
    if (l === 'italiano' || l === 'ita') return 'ITA';
    if (l === 'francese' || l === 'fra') return 'FRA';
    if (l === 'inglese' || l === 'eng' || l === 'english') return 'ENG';
    if (l === 'giapponese' || l === 'jpn' || l === 'gia') return 'GIA';
    if (l === 'lingua originale' || l === 'originale') return 'V.O.';
    return lang.toUpperCase().substring(0, 3);
  };

  return (
    <div className={`${styles.badgeContainer} ${styles[size]}`}>
      {language && (
        <div className={styles.langBadge} title={getFullLanguageName(language)}>
          {getDisplayLang(language)}
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
