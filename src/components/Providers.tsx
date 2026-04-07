'use client';

import React, { ReactNode } from 'react';
import { AutoScrollProvider } from '@/context/AutoScrollContext';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <AutoScrollProvider>
      {children}
    </AutoScrollProvider>
  );
}
