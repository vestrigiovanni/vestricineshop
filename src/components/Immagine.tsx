'use client';

import NextImage, { type ImageProps } from 'next/image';
import { tmdbLoader } from '@/services/tmdbLoader';

/** `next/image`, ma le immagini di TMDB arrivano dritte da TMDB (vedi tmdbLoader). */
export default function Image(props: ImageProps) {
  return <NextImage loader={tmdbLoader} {...props} />;
}
