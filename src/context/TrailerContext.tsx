'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

interface TrailerContextType {
  isOpen: boolean;
  videoId: string | null;
  openTrailer: (videoId: string) => void;
  closeTrailer: () => void;
}

const TrailerContext = createContext<TrailerContextType | undefined>(undefined);

export function TrailerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [videoId, setVideoId] = useState<string | null>(null);

  const openTrailer = useCallback((id: string) => {
    setVideoId(id);
    setIsOpen(true);
  }, []);

  const closeTrailer = useCallback(() => {
    setIsOpen(false);
    // Delay clearing videoId to allow close animation to finish
    setTimeout(() => setVideoId(null), 300);
  }, []);

  return (
    <TrailerContext.Provider value={{ isOpen, videoId, openTrailer, closeTrailer }}>
      {children}
    </TrailerContext.Provider>
  );
}

export function useTrailer() {
  const context = useContext(TrailerContext);
  if (context === undefined) {
    throw new Error('useTrailer must be used within a TrailerProvider');
  }
  return context;
}
