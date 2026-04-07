'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface AutoScrollContextType {
  isAutoScrollEnabled: boolean;
  disableAutoScroll: () => void;
}

const AutoScrollContext = createContext<AutoScrollContextType | undefined>(undefined);

export function AutoScrollProvider({ children }: { children: ReactNode }) {
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);

  const disableAutoScroll = useCallback(() => {
    if (isAutoScrollEnabled) {
      console.log("🛡️ Auto-scroll disattivato per interazione utente");
      setIsAutoScrollEnabled(false);
    }
  }, [isAutoScrollEnabled]);

  return (
    <AutoScrollContext.Provider value={{ isAutoScrollEnabled, disableAutoScroll }}>
      {children}
    </AutoScrollContext.Provider>
  );
}

export function useAutoScroll() {
  const context = useContext(AutoScrollContext);
  if (context === undefined) {
    throw new Error('useAutoScroll must be used within an AutoScrollProvider');
  }
  return context;
}
