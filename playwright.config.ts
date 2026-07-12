import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // Headless Chromium renders WebGL through SwiftShader at ~5-10 fps, so
  // state transitions that take a second of game time can take many seconds
  // of wall time. Budgets are sized for that, not for real-GPU speed.
  timeout: 90_000,
  expect: {
    timeout: 20_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:5190',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 5190 --strictPort',
    url: 'http://127.0.0.1:5190',
    reuseExistingServer: false,
    timeout: 20_000,
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 13'],
      },
    },
  ],
});
