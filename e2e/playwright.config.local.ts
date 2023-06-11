import {PlaywrightTestConfig} from '@playwright/test';
import mainConfig from './playwright.config';

const config: PlaywrightTestConfig = {
  ...mainConfig,
  retries: 0,
  globalSetup: require.resolve('./setup/global-setup.local'),
  webServer: {
    ...mainConfig.webServer,
    command: 'node ../api/server/index.js',
  },
  fullyParallel: false, // if you are on Windows, keep this as `false`. On a Mac, `true` could make tests faster (maybe on some Windows too, just try)
  // workers: 1,
  // testMatch: /messages/,
  // retries: 0,
};

export default config;
