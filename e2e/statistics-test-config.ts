import { PlaywrightTestConfig } from '@playwright/test';

/**
 * Playwright configuration specifically for Statistics feature testing
 * 
 * This configuration focuses on testing authentication, authorization,
 * and error handling in the Statistics feature.
 */
const statisticsConfig: PlaywrightTestConfig = {
  testDir: './specs',
  testMatch: '**/statistics-*.spec.ts',
  
  /* Run tests in files in parallel */
  fullyParallel: false, // Sequential for better error tracking
  
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 1,
  
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : 2,
  
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { outputFolder: 'statistics-test-results' }],
    ['junit', { outputFile: 'statistics-test-results.xml' }],
    ['list']
  ],
  
  /* Shared settings for all the projects below. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3080',
    
    /* Collect trace when retrying the failed test. */
    trace: 'retain-on-failure',
    
    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Record video on failure */
    video: 'retain-on-failure',
    
    /* Timeout for each action */
    actionTimeout: 10000,
    
    /* Timeout for navigation */
    navigationTimeout: 15000,
  },

  /* Configure projects for different test scenarios */
  projects: [
    {
      name: 'statistics-auth',
      testMatch: '**/statistics-auth.spec.ts',
      use: {
        // Specific settings for auth tests
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'statistics-ui',
      testMatch: '**/statistics-ui.spec.ts',
      use: {
        // Specific settings for UI tests
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'statistics-admin-setup',
      testMatch: '**/statistics-admin-setup.spec.ts',
      use: {
        // Settings for admin setup tests
        viewport: { width: 1280, height: 720 },
      },
    },
  ],

  /* Global setup and teardown */
  globalSetup: require.resolve('./statistics-global-setup.ts'),
  
  /* Folder for test artifacts such as screenshots, videos, traces, etc. */
  outputDir: 'statistics-test-results/',
  
  /* Test timeout */
  timeout: 60000,
  
  /* Expect timeout */
  expect: {
    timeout: 10000,
  },
  
  /* Web server configuration */
  webServer: {
    command: 'npm run backend:dev',
    port: 3080,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
};

export default statisticsConfig;