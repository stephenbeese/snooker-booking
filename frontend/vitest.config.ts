import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

// Merging reuses the path aliases from vite.config rather than duplicating them.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: true,
      // Playwright specs live in e2e/ and must not be picked up by Vitest.
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
  }),
);
