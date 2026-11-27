import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // La pagina del film non c'è più: i link vecchi (post, messaggi, app) aprono la home su quel film.
      { source: '/movie/:id', destination: '/?film=:id', permanent: false },
    ];
  },
};

export default nextConfig;
