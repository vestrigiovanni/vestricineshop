import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Senza questa riga Next arriva a 3840px: su uno schermo Retina ogni
    // fondale a tutta pagina diventava un'immagine 4K da decodificare —
    // decine di megabyte di bitmap per una manciata di sezioni, ed è il peso
    // che rendeva lo scorrimento a scatti. I fondali di TMDB nascono a
    // 1280px, quindi oltre i 1920 si ingrandiva soltanto.
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'image.tmdb.org',
        pathname: '/t/p/**',
      },
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
        pathname: '/vi/**',
      },
    ],
  },
};

export default nextConfig;
// Test deploy trigger

