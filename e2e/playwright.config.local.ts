import { PlaywrightTestConfig } from '@playwright/test';
import mainConfig from './playwright.config';
import path from 'path';
const absolutePath = path.resolve(process.cwd(), 'api/server/index.js');
import dotenv from 'dotenv';
dotenv.config();

const config: PlaywrightTestConfig = {
  ...mainConfig,
  retries: 0,
  globalSetup: require.resolve('./setup/global-setup.local'),
  globalTeardown: require.resolve('./setup/global-teardown.local'),
  webServer: {
    ...mainConfig.webServer,
    command: `node ${absolutePath}`,
    env: {
      ...process.env,
      SEARCH: 'false',
      NODE_ENV: 'CI',
      TITLE_CONVO: 'false',
      SESSION_EXPIRY: '60000',
      REFRESH_TOKEN_EXPIRY: '300000',
    },
  },
  fullyParallel: false, // if you are on Windows, keep this as `false`. On a Mac, `true` could make tests faster (maybe on some Windows too, just try)
  // workers: 1,
  // testMatch: /messages/,
  // retries: 0,
};

export default config;
