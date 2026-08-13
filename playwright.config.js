import { defineConfig, devices } from '@playwright/test';

const workerPort = process.env.E2E_WORKER_PORT || '8787';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  fullyParallel: false,
  workers: process.env.CI ? 1 : 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: [
    {
      command: `npm run worker:dev:fixture -- --port ${workerPort}`,
      url: `http://127.0.0.1:${workerPort}/v2/weather`,
      reuseExistingServer: true,
      timeout: 120000
    },
    {
      command: 'npm run dev',
      url: 'http://127.0.0.1:4173/',
      reuseExistingServer: true,
      timeout: 30000
    }
  ],
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'iphone', use: { ...devices['iPhone 13'] } },
    { name: 'android', use: { ...devices['Pixel 7'], channel: 'chrome' } },
    { name: 'tablet', use: { ...devices['iPad Mini'] } }
  ]
});
