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
  /* Run tests in files in parallel.
  NOTE: This sometimes causes issues on Windows.
  Set to false if you experience issues running on a Windows machine. */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['html', { outputFolder: 'playwright-report' }]],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL: 'http://localhost:3080',
    video: 'on-first-retry',
    trace: 'retain-on-failure',
    ignoreHTTPSErrors: true,
    headless: true,
    storageState: path.resolve(process.cwd(), 'e2e/storageState.json'),
    screenshot: 'only-on-failure',
  },
  expect: {
    timeout: 10000,
  },
  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: `node ${absolutePath}`,
    port: 3080,
    stdout: 'pipe',
    ignoreHTTPSErrors: true,
    // url: 'http://localhost:3080',
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
