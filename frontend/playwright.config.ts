import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the real stack: real browser, real Vite build, real Spring
 * backend, real PostgreSQL.
 *
 * <p>These exist to cover what no other layer can. The integration suite proves the API
 * behaves; the Vitest suite proves components render given fixed props. Neither proves that
 * a person can complete a booking, which is the only thing the club actually needs.
 */
export default defineConfig({
  testDir: './e2e',
  // Serial. The specs change club-wide settings and book real slots, so two workers would
  // race over shared state and fail in ways that have nothing to do with the code.
  workers: 1,
  fullyParallel: false,
  // A retry masks a genuine flake, and a flaky booking test is a real signal about
  // concurrency. Locally there are none; on CI one retry absorbs infrastructure noise.
  retries: process.env.CI ? 1 : 0,
  // Fails the run if a spec is left with test.only, which would silently skip the rest.
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: 'http://localhost:5173',
    // Only kept for failures: traces for passing tests are gigabytes of noise nobody reads.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // Without this exclusion the mobile specs also run here, in a desktop viewport where
      // the hamburger menu does not exist and the sticky summary behaves differently — they
      // fail for reasons that say nothing about either layout.
      testIgnore: /.*\.mobile\.spec\.ts/,
    },
    {
      // The grid is the hardest thing to get right on a phone, and it is where most
      // customers will book. Worth its own project rather than a resize inside one spec.
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      testMatch: /.*\.mobile\.spec\.ts/,
    },
  ],

  // Both servers, started by Playwright and reused if already running. The backend command
  // goes through run-backend.sh because Gradle has no dotenv support and the app refuses to
  // start without the Stripe keys — a deliberate design choice, not an obstacle to work
  // around here.
  webServer: [
    {
      command: 'cd .. && FORCE_RESTART=1 ./run-backend.sh',
      url: 'http://localhost:8080/api/health',
      // Gradle may need to compile first, and bootRun never "finishes" — readiness is the
      // health endpoint answering, not the process exiting.
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'yarn dev',
      url: 'http://localhost:5173',
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
