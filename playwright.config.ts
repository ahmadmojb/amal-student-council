import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4173);

/**
 * End-to-end tests run against the real server in demo mode with an isolated
 * data directory (.data-e2e), so they never touch real data.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'ar',
    timezoneId: 'Asia/Jerusalem',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build:client && node scripts/maintenance/reset-e2e-data.mjs && npm run dev:once',
    url: `http://localhost:${PORT}/healthz`,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 240_000,
    env: {
      PORT: String(PORT),
      DATA_MODE: 'demo',
      SERVE_DIST: 'true',
      DEMO_DATA_DIR: '.data-e2e',
      ADMIN_PIN: 'e2e-admin-pin-2026',
      SESSION_SECRET: 'e2e-session-secret-e2e-session-secret-1234',
    },
  },
});
