import { defineConfig } from '@playwright/test';
import path from 'path';
import mockConfig from './playwright.config.mock';

const rootPath = path.resolve(__dirname, '..');
const mailboxServerPath = path.resolve(rootPath, 'e2e/setup/mailbox-server.js');
const emailChangeDisabled = process.env.E2E_ALLOW_EMAIL_CHANGE === 'false';
const profileSuffix = emailChangeDisabled ? '-disabled' : '';
const reportPath = path.resolve(rootPath, `e2e/playwright-report/email-change${profileSuffix}`);
const SMTP_PORT = process.env.E2E_SMTP_PORT ?? '1025';
const MAILBOX_PORT = process.env.E2E_MAILBOX_PORT ?? '8025';
const MAILBOX_URL = `http://127.0.0.1:${MAILBOX_PORT}`;

Object.assign(process.env, {
  EMAIL_HOST: '127.0.0.1',
  EMAIL_PORT: SMTP_PORT,
  EMAIL_FROM: 'noreply@librechat.test',
  EMAIL_FROM_NAME: 'LibreChat E2E',
  EMAIL_SERVICE: '',
  EMAIL_ENCRYPTION: '',
  EMAIL_USERNAME: '',
  EMAIL_PASSWORD: '',
  MAILGUN_API_KEY: '',
  MAILGUN_DOMAIN: '',
  ALLOW_EMAIL_CHANGE: emailChangeDisabled ? 'false' : 'true',
  E2E_MAILBOX_URL: MAILBOX_URL,
});

if (!Array.isArray(mockConfig.webServer)) {
  throw new Error('The email E2E profile requires the mock profile web servers');
}
const mockWebServers = mockConfig.webServer;

export default defineConfig({
  ...mockConfig,
  globalSetup: require.resolve('./setup/global-setup.email'),
  globalTeardown: require.resolve('./setup/global-teardown.email'),
  testDir: 'specs/email/',
  testMatch: emailChangeDisabled ? 'email-change-disabled.spec.ts' : 'email-change.spec.ts',
  outputDir: `specs/.test-results/email-change${profileSuffix}`,
  fullyParallel: false,
  workers: 1,
  reporter: [['html', { outputFolder: reportPath, open: 'never' }], ['list']],
  use: {
    ...mockConfig.use,
    storageState: path.resolve(rootPath, `e2e/.generated/storageState.email${profileSuffix}.json`),
  },
  webServer: [
    {
      command: `node ${mailboxServerPath}`,
      cwd: rootPath,
      env: {
        ...process.env,
        E2E_SMTP_PORT: SMTP_PORT,
        E2E_MAILBOX_PORT: MAILBOX_PORT,
      },
      url: `${MAILBOX_URL}/health`,
      stdout: 'pipe',
      timeout: 60_000,
      reuseExistingServer: false,
    },
    ...mockWebServers,
  ],
});
