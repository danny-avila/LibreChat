import { defineConfig, devices } from '@playwright/test';
import path from 'path';
const absolutePath = path.resolve(process.cwd(), 'api/server/index.js');
import dotenv from 'dotenv';
dotenv.config();

export default defineConfig({
  globalSetup: require.resolve('./setup/global-setup'),
  globalTeardown: require.resolve('./setup/global-teardown'),
  testDir: 'specs/',
  outputDir: 'specs/.test-results',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['html', { outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:3080',
    video: 'on', // Always record video
    trace: 'on', // Always record trace
    ignoreHTTPSErrors: true,
    headless: false, // Show browser
    storageState: path.resolve(process.cwd(), 'e2e/storageState.json'),
    screenshot: 'on', // Always take screenshots
  },
  expect: {
    timeout: 10000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `node ${absolutePath}`,
    port: 3080,
    stdout: 'pipe',
    ignoreHTTPSErrors: true,
    timeout: 30_000,
    reuseExistingServer: true,
    env: {
      ...process.env,
      NODE_ENV: 'CI',
      EMAIL_HOST: '',
      SEARCH: 'false',
      SESSION_EXPIRY: '60000',
      ALLOW_REGISTRATION: 'true',
      REFRESH_TOKEN_EXPIRY: '300000',
    },
  },
});
