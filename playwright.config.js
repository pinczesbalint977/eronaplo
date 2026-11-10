import { defineConfig } from '@playwright/test';
import { resolveBasePath } from './scripts/base-path.mjs';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: [['list']],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: [
    { command: 'npm run preview -- --port 4173 --strictPort', url: `http://127.0.0.1:4173${resolveBasePath(process.env)}`, reuseExistingServer: false },
    {
      command: 'npm run dev -- --port 5174 --strictPort', url: 'http://127.0.0.1:5174/', reuseExistingServer: false,
      env: { VITE_BASE_PATH: '/', VITE_USE_EMULATORS: 'true', VITE_FIREBASE_API_KEY: 'demo-test-key', VITE_FIREBASE_AUTH_DOMAIN: 'demo-eronaplo.firebaseapp.com', VITE_FIREBASE_PROJECT_ID: 'demo-eronaplo', VITE_FIREBASE_APP_ID: '1:123456:web:demo-eronaplo' },
    },
  ],
});
