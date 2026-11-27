import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// `@/…` come nel sito (tsconfig): i test della programmazione lo usano.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
