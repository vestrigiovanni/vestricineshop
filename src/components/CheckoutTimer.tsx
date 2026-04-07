'use client';

import { useState, useEffect } from 'react';
import { Timer } from 'lucide-react';
import styles from './CheckoutTimer.module.css';

interface CheckoutTimerProps {
  maxTimeSeconds: number;
  onExpire: () => void;
}

export default function CheckoutTimer({ maxTimeSeconds, onExpire }: CheckoutTimerProps) {
  const [timeLeft, setTimeLeft] = useState(maxTimeSeconds);

  useEffect(() => {
    if (timeLeft <= 0) {
      onExpire();
      return;
    }

    const interval = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [timeLeft, onExpire]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <div className={`${styles.timer} ${timeLeft < 60 ? styles.urgent : ''}`}>
      <Timer size={18} />
      <span>
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </span>
    </div>
  );
}
