'use client';

import React, { useState } from 'react';
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

const festivalLogos: Record<string, string> = {
  oscar: '/logos/oscars_v1.png',
  cannes: '/logos/cannes_v1.png',
  venice: '/logos/venezia_v1.png',
  berlin: '/logos/berlinale_v1.png',
  ssiff: '/logos/ssiff_v1.png',
  bafta: '/logos/bafta_v1.png',
  telluride: '/logos/telluride_v1.png'
};

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      delayChildren: 1.2,
      staggerChildren: 0.2
    }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: -20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { 
      duration: 0.8, 
      ease: [0.2, 1, 0.3, 1] 
    }
  }
};

const AwardBadge = ({ type, label, details, year }: MovieAward) => {
  const [isHovered, setIsHovered] = useState(false);
  const icon = festivalLogos[type] || festivalLogos.oscar;

  return (
    <motion.div 
      variants={itemVariants}
      className={styles.badgeWrapper}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={() => setIsHovered(true)}
      onTouchEnd={() => setIsHovered(false)}
    >
      <motion.div 
        whileHover={{ scale: 1.15 }}
        whileTap={{ scale: 0.95 }}
        className={styles.badge}
      >
        <Image 
          src={icon} 
          alt={label} 
          width={95} 
          height={95} 
          className={styles.icon}
          priority
        />
      </motion.div>

      <AnimatePresence>
        {isHovered && (details || year) && (
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
                  <>
                    <p className={styles.prestigeText}>
                      {details.split(',')[0]}
                    </p>
                    {details.includes(',') && (
                      <p className={styles.subDetails}>
                        {details.split(',').slice(1).join(', ')}
                      </p>
                    )}
                  </>
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
  
  if (!awards || awards.length === 0) return null;

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className={vertical ? styles.verticalContainer : styles.horizontalContainer}
    >
      {awards.map((award, index) => (
        <AwardBadge key={`${award.type}-${index}`} {...award} />
      ))}
    </motion.div>
  );
}
