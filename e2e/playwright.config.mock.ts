import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { getLocalE2EEnv, getE2EBaseURL } from './setup/env';

const rootPath = path.resolve(__dirname, '..');
const serverPath = path.resolve(rootPath, 'e2e/setup/start-server.js');
const mockLlmPath = path.resolve(rootPath, 'e2e/setup/mock-llm-server.js');
const configTemplatePath = path.resolve(rootPath, 'e2e/config/librechat.e2e.yaml');
const configPath = path.resolve(rootPath, 'e2e/.generated/librechat.e2e.yaml');
const reportPath = path.resolve(rootPath, 'e2e/playwright-report');

const baseURL = getE2EBaseURL();
const mockLlmPort = getMockLlmPort();
const defaultMockLlmBaseURL = 'http://127.0.0.1:8889/v1';
const mockLlmBaseURL = `http://127.0.0.1:${mockLlmPort}/v1`;
const chromiumChannel = process.env.E2E_CHROMIUM_CHANNEL || undefined;

const vanillaOverrides = {
  TENANT_ISOLATION_STRICT: 'false',
  OPENAI_API_KEY: 'user_provided',
  OPENID_CLIENT_ID: '',
  OPENID_ISSUER: '',
  OPENID_AUTO_REDIRECT: 'false',
  ALLOW_SOCIAL_LOGIN: 'false',
  ALLOW_SOCIAL_REGISTRATION: 'false',
  STREAM_KEEP_COMPLETED_JOBS: 'true',
};

const baseEnv = {
  ...getLocalE2EEnv(),
  CONFIG_PATH: configPath,
  MOCK_LLM_PORT: mockLlmPort,
  ...vanillaOverrides,
};

const SECRET_KEY_PATTERN = /(API_KEY|SECRET|TOKEN|PASSWORD|CREDENTIALS|CLIENT_ID|_KEY)$/i;
const preservedCredentialEnvKeys = new Set([
  ...Object.keys(baseEnv),
  'E2E_USER_PASSWORD',
  'E2E_USER_B_PASSWORD',
]);

function getMockLlmPort() {
  const port = process.env.MOCK_LLM_PORT ?? '8889';
  if (!/^\d+$/.test(port)) {
    throw new Error('MOCK_LLM_PORT must be a numeric port');
  }
  return port;
}

function writeRuntimeMockConfig() {
  const template = fs.readFileSync(configTemplatePath, 'utf8');

  if (!template.includes(defaultMockLlmBaseURL)) {
    throw new Error(`Expected mock config template to include ${defaultMockLlmBaseURL}`);
  }

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, template.replaceAll(defaultMockLlmBaseURL, mockLlmBaseURL));
}

function neutralizeCredentialEnv(env: NodeJS.ProcessEnv, keep: Set<string>) {
  for (const key of Object.keys(env)) {
    if (!keep.has(key) && SECRET_KEY_PATTERN.test(key)) {
      env[key] = '';
    }
  }
}

/** Blank any credential-like vars from a local `.env` so they never reach the test server. */
function neutralizeDotenvSecrets(envFile: string, keep: Set<string>) {
  if (!fs.existsSync(envFile)) {
    return;
  }
  const lines = fs.readFileSync(envFile, 'utf8').split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match) {
      continue;
    }
    const key = match[1];
    if (keep.has(key)) {
      continue;
    }
    if (SECRET_KEY_PATTERN.test(key)) {
      process.env[key] = '';
    }
  }
}

writeRuntimeMockConfig();
neutralizeCredentialEnv(process.env, preservedCredentialEnvKeys);
Object.assign(process.env, baseEnv);
neutralizeDotenvSecrets(path.resolve(rootPath, '.env'), preservedCredentialEnvKeys);

export default defineConfig({
  globalSetup: require.resolve('./setup/global-setup'),
  globalTeardown: require.resolve('./setup/global-teardown.mock'),
  testDir: 'specs/mock/',
  outputDir: 'specs/.test-results',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['html', { outputFolder: reportPath, open: 'never' }], ['line']]
    : [['html', { outputFolder: reportPath }], ['list']],
  use: {
    baseURL,
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
  projects: [
    {
      name: chromiumChannel ?? 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(chromiumChannel ? { channel: chromiumChannel } : {}),
      },
    },
  ],
  webServer: [
    {
      command: `node ${mockLlmPath}`,
      cwd: rootPath,
      url: `http://127.0.0.1:${mockLlmPort}/health`,
      stdout: 'pipe',
      timeout: 30_000,
      reuseExistingServer: false,
    },
    {
      command: `node ${serverPath}`,
      cwd: rootPath,
      url: baseURL,
      stdout: 'pipe',
      ignoreHTTPSErrors: true,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
