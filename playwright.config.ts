import { defineConfig, devices } from '@playwright/test'

// Seam A: the whole app in a real Chromium. Drop a fixture, replay keys,
// read the download. Audio is exercised for absence of errors, not asserted.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5177',
    trace: 'retain-on-failure',
    acceptDownloads: true,
    ...devices['Desktop Chrome'],
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  webServer: {
    command: 'npx vite --port 5177 --strictPort',
    url: 'http://localhost:5177',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
