import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Lo stesso alias di tsconfig.json: senza, un modulo testato non può
    // importare nulla con "@/" e i test sono costretti a percorsi relativi.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // Anche `scripts/`: la fusione dei film fra librerie Plex vive lì, gira sul
    // Mac del cinema in Node puro, e sbagliarla riempie il catalogo di doppioni.
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    environment: 'node',
  },
});
