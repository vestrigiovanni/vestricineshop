'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import styles from './MovieAwards.module.css';

export interface MovieAward {
  type: string;
  label: string;
  details?: string | null;
  year?: number | null;
}

interface AwardProps {
  awards?: MovieAward[];
  vertical?: boolean;
}

interface AwardConfig {
  src: string;
  width: number;
  height: number;
}

const DEFAULT_DIMENSION = 95;
const TORONTO_WIDTH = 200;
const TORONTO_HEIGHT = 95;

const festivalConfigs: Record<string, AwardConfig> = {
  oscar: { src: '/logos/oscars_v1.png', width: DEFAULT_DIMENSION, height: DEFAULT_DIMENSION },
  cannes: { src: '/logos/cannes_v1.png', width: DEFAULT_DIMENSION, height: DEFAULT_DIMENSION },
  venice: { src: '/logos/venezia_v1.png', width: DEFAULT_DIMENSION, height: DEFAULT_DIMENSION },
  berlin: { src: '/logos/berlinale_v1.png', width: DEFAULT_DIMENSION, height: DEFAULT_DIMENSION },
  ssiff: { src: '/logos/ssiff_v1.png', width: DEFAULT_DIMENSION, height: DEFAULT_DIMENSION },
  bafta: { src: '/logos/bafta_v1.png', width: DEFAULT_DIMENSION, height: DEFAULT_DIMENSION },
  telluride: { src: '/logos/telluride_v1.png', width: DEFAULT_DIMENSION, height: DEFAULT_DIMENSION },
  toronto: { src: '/logos/tiff.png', width: TORONTO_WIDTH, height: TORONTO_HEIGHT },
  locarno: { src: '/logos/locarno.png', width: DEFAULT_DIMENSION, height: DEFAULT_DIMENSION },
  davids: { src: '/logos/david.png', width: DEFAULT_DIMENSION, height: DEFAULT_DIMENSION },
  romacinemafest: { src: '/logos/roma.png', width: DEFAULT_DIMENSION, height: DEFAULT_DIMENSION }
};

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: -20 },
  visible: (i: number) => ({ 
    opacity: 1, 
    y: 0,
    transition: { 
      delay: 1.2 + (i * 0.15), // Manual stagger to ensure cross-column sequence
      duration: 0.8, 
      ease: [0.2, 1, 0.3, 1] 
    }
  })
};

const AwardBadge = ({ type, label, details, year, index = 0, isMounted = false }: MovieAward & { index?: number, isMounted?: boolean }) => {
  const [isHovered, setIsHovered] = useState(false);
  
  const config = useMemo(() => {
    const t = (type || '').toLowerCase().trim();
    if (t === 'toronto' || t === 'tiff' || t.includes('toronto') || t.includes('tiff')) {
      return festivalConfigs.toronto;
    }
    // Very explicit mapping to avoid defaults flipping
    if (festivalConfigs[t]) return festivalConfigs[t];
    return festivalConfigs.oscar;
  }, [type]);

  // Base structure must be identical on server and first client render
  return (
    <motion.div 
      variants={itemVariants}
      custom={index}
      initial="hidden"
      animate="visible"
      className={styles.badgeWrapper}
      onMouseEnter={() => isMounted && setIsHovered(true)}
      onMouseLeave={() => isMounted && setIsHovered(false)}
      onTouchStart={() => isMounted && setIsHovered(true)}
      onTouchEnd={() => isMounted && setIsHovered(false)}
      tabIndex={isMounted ? 0 : undefined}
    >
      <motion.div 
        whileHover={{ scale: 1.15 }}
        whileTap={{ scale: 0.95 }}
        className={styles.badge}
        style={{ width: config.width, height: config.height }}
      >
        <Image 
          src={config.src} 
          alt={label} 
          width={config.width} 
          height={config.height} 
          className={styles.icon}
          priority
          unoptimized={true} // Avoids srcSet mismatches between server/client environments
        />
      </motion.div>

      <AnimatePresence>
        {isMounted && isHovered && (details || year) && (
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            transition={{ 
              type: 'spring',
              stiffness: 300,
              damping: 25,
              mass: 0.8
            }}
            className={styles.tooltip}
          >
            <div className={styles.tooltipContainer}>
              <div className={styles.headerText}>
                <span className={styles.awardLabel}>{label}</span>
                {year && <span className={styles.awardYear}>{year}</span>}
              </div>
              <div className={styles.tooltipContent}>
                <div className={styles.awardDecoration} />
                {details && (
                  <div className={styles.prestigeWrapper}>
                    <p className={styles.prestigeText}>
                      {details.split(',')[0]}
                    </p>
                    {details.includes(',') && (
                      <p className={styles.subDetails}>
                        {details.split(',').slice(1).join(', ')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default function MovieAwards({ 
  awards = [],
  vertical = true
}: AwardProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);
  
  if (!awards || awards.length === 0) return null;

  // Multi-column logic is only active after mounting to prevent hydration mismatch
  const shouldSplit = isMounted && vertical && awards.length > 4;
  const mid = shouldSplit ? Math.ceil(awards.length / 2) : awards.length;
  const firstColumn = awards.slice(0, mid);
  const secondColumn = awards.slice(mid);

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className={vertical ? (shouldSplit ? styles.multiColumnContainer : styles.verticalContainer) : styles.horizontalContainer}
    >
      {shouldSplit ? (
        <>
          <div className={styles.awardColumn}>
            {firstColumn.map((award, index) => (
              <AwardBadge key={`${award.type}-${index}`} {...award} index={index} isMounted={isMounted} />
            ))}
          </div>
          <div className={styles.awardColumn}>
            {secondColumn.map((award, index) => (
              <AwardBadge key={`${award.type}-${index + firstColumn.length}`} {...award} index={index + firstColumn.length} isMounted={isMounted} />
            ))}
          </div>
        </>
      ) : (
        awards.map((award, index) => (
          <AwardBadge key={`${award.type}-${index}`} {...award} index={index} isMounted={isMounted} />
        ))
      )}
    </motion.div>
  );
}
