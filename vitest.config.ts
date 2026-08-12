import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Anche `scripts/`: la fusione dei film fra librerie Plex vive lì, gira sul
    // Mac del cinema in Node puro, e sbagliarla riempie il catalogo di doppioni.
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    environment: 'node',
  },
});
