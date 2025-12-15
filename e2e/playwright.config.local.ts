import { PlaywrightTestConfig } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import mainConfig from './playwright.config';
const absolutePath = path.resolve(process.cwd(), 'api/server/index.js');
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
      FORK_VIOLATION_SCORE: '0',
      IMPORT_VIOLATION_SCORE: '0',
      TTS_VIOLATION_SCORE: '0',
      STT_VIOLATION_SCORE: '0',
      FILE_UPLOAD_VIOLATION_SCORE: '0',
      RESET_PASSWORD_VIOLATION_SCORE: '0',
      VERIFY_EMAIL_VIOLATION_SCORE: '0',
      TOOL_CALL_VIOLATION_SCORE: '0',
      CONVO_ACCESS_VIOLATION_SCORE: '0',
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
  // Override shared use settings for local debug – make browser visible
  // each test opens its own visible Chromium instance, so we can see what's happening
  use: {
    ...mainConfig.use,
    headless: false,
    baseURL: 'http://localhost:3090',
    storageState: path.resolve(process.cwd(), 'e2e/storageState.json'),
  },
  fullyParallel: false, // if you are on Windows, keep this as `false`. On a Mac, `true` could make tests faster (maybe on some Windows too, just try)
  // workers: 1,
  // testMatch: /messages/,
  // retries: 0,
};

export default config;
