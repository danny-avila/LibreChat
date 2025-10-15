import { PlaywrightTestConfig } from '@playwright/test';
import mainConfig from './playwright.config';
import path from 'path';
const absolutePath = path.resolve(process.cwd(), 'api/server/index.js');
import dotenv from 'dotenv';
dotenv.config();

const config: PlaywrightTestConfig = {
  ...mainConfig,
  retries: 0,
  globalSetup: undefined,  // Disabled - auth already generated
  globalTeardown: undefined,  // Disabled - using existing container
  webServer: undefined,  // Don't start server - use running instance

  // Always record for demo purposes
  use: {
    ...mainConfig.use,
    video: 'on',  // Always record video
    trace: 'on',  // Always record trace
    screenshot: 'on',  // Always take screenshots
  },

  // Add HTML reporter for better results viewing
  reporter: [
    ['list'],  // Console output
    ['html', { outputFolder: 'playwright-report', open: 'never' }],  // HTML report
    ['json', { outputFile: 'test-results.json' }],  // JSON for CI/CD
  ],
  /* webServer: {
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
  }, */
  fullyParallel: false, // if you are on Windows, keep this as `false`. On a Mac, `true` could make tests faster (maybe on some Windows too, just try)
  // workers: 1,
  // testMatch: /messages/,
  // retries: 0,
};

export default config;
