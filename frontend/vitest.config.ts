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
      // Playwright specs live in e2e/ and must not be picked up by Vitest. The reverse also
      // holds: Playwright collects everything under e2e/, so a Vitest test covering an e2e
      // helper lives in src/test/ and imports across (see src/test/e2eHelpers.test.ts).
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
  }),
);
