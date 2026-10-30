// Playwright config for the launch-film UI captures. Runs the real web app
// (apps/web) against the mocked Supabase from apps/web/e2e/fixtures.ts.
//
//   cd apps/web && pnpm exec playwright test -c ../../pilego-launch/capture/capture.config.ts
//
// CAPTURE_SCHEME=light captures the light theme; the film uses dark (the default).
//
import { defineConfig } from '@playwright/test';

const PORT = 4179;

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.capture\.ts$/,
  timeout: 240_000,
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: process.env.CAPTURE_SCHEME === 'light' ? 'light' : 'dark',
    locale: 'en-US',
    timezoneId: 'America/New_York',
    launchOptions: { executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium' },
  },
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    cwd: '../../apps/web',
    port: PORT,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { VITE_SUPABASE_URL: 'http://supabase.test', VITE_SUPABASE_ANON_KEY: 'test-anon-key' },
  },
});
