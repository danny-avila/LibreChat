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
      EMAIL_HOST: '',
      TITLE_CONVO: 'false',
      SESSION_EXPIRY: '60000',
      REFRESH_TOKEN_EXPIRY: '300000',
      LOGIN_VIOLATION_SCORE: '0',
      REGISTRATION_VIOLATION_SCORE: '0',
      CONCURRENT_VIOLATION_SCORE: '0',
      MESSAGE_VIOLATION_SCORE: '0',
      NON_BROWSER_VIOLATION_SCORE: '0',
      ILLEGAL_MODEL_REQ_SCORE: '0',
      LOGIN_MAX: '20',
      LOGIN_WINDOW: '1',
      REGISTER_MAX: '20',
      REGISTER_WINDOW: '1',
      LIMIT_CONCURRENT_MESSAGES: 'false',
      CONCURRENT_MESSAGE_MAX: '20',
      LIMIT_MESSAGE_IP: 'false',
      MESSAGE_IP_MAX: '100',
      MESSAGE_IP_WINDOW: '1',
      LIMIT_MESSAGE_USER: 'false',
      MESSAGE_USER_MAX: '100',
      MESSAGE_USER_WINDOW: '1',
    },
  },
  fullyParallel: false, // if you are on Windows, keep this as `false`. On a Mac, `true` could make tests faster (maybe on some Windows too, just try)
  // workers: 1,
  testMatch: /a11y/,
  // retries: 0,
};

export default config;
