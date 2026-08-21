import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { getLocalE2EEnv, getE2EBaseURL } from './setup/env';

const rootPath = path.resolve(__dirname, '..');
const replicaCount = Number(process.env.E2E_REPLICAS || '1');
if (replicaCount !== 1 && replicaCount !== 2) {
  throw new Error(`E2E_REPLICAS must be 1 or 2, received ${process.env.E2E_REPLICAS}`);
}
const serverPath = path.resolve(
  rootPath,
  replicaCount === 2 ? 'e2e/setup/start-server-cluster.js' : 'e2e/setup/start-server.js',
);
const mcpHttpServerPath = path.resolve(rootPath, 'e2e/setup/fake-mcp-http-server.js');
const dynamicMcpServerPath = path.resolve(rootPath, 'e2e/setup/fake-mcp-dynamic-network-server.js');
/** Must match the `e2e-http` server URL in e2e/config/librechat.e2e.yaml. */
const MCP_HTTP_PORT = process.env.E2E_MCP_HTTP_PORT || '8765';
/** Must match the dynamic Streamable HTTP and SSE URLs in the e2e config template. */
const MCP_DYNAMIC_PORT = process.env.E2E_MCP_DYNAMIC_PORT || '8766';
const MCP_STATE_PATH =
  process.env.E2E_MCP_STATE_PATH ||
  path.resolve(rootPath, 'e2e/specs/.test-results/mcp-tool-state.json');
const labelServerPath = path.resolve(rootPath, 'e2e/setup/fake-label-server.js');
/** The template's custom-endpoint `baseURL`s hard-code 8889;
 *  `writeRuntimeMockConfig` substitutes any override into the generated copy. */
const LABEL_PORT = process.env.E2E_LABEL_PORT || '8889';
const fakeModelHookPath = path.resolve(rootPath, 'e2e/setup/fake-model.js');
const configTemplatePath = path.resolve(rootPath, 'e2e/config/librechat.e2e.yaml');
const configPath = path.resolve(rootPath, 'e2e/.generated/librechat.e2e.yaml');
const reportPath = path.resolve(rootPath, 'e2e/playwright-report');
const deploymentSkillsPath = path.resolve(rootPath, 'e2e/fixtures/deployment-skills');
const enableDynamicMcp = process.env.E2E_MCP_LIST_CHANGED === 'true';

const baseURL = getE2EBaseURL();
const chromiumChannel = process.env.E2E_CHROMIUM_CHANNEL || undefined;

const vanillaOverrides = {
  TENANT_ISOLATION_STRICT: 'false',
  TRUST_TENANT_HEADER: 'true',
  OPENAI_API_KEY: 'user_provided',
  OPENID_CLIENT_ID: '',
  OPENID_ISSUER: '',
  OPENID_AUTO_REDIRECT: 'false',
  ALLOW_SOCIAL_LOGIN: 'false',
  ALLOW_SOCIAL_REGISTRATION: 'false',
  STREAM_KEEP_COMPLETED_JOBS: 'true',
  /** A local `.env` may enable balance enforcement, which `neutralizeCredentialEnv`
   *  does not blank (not credential-shaped); the fresh e2e user has no balance
   *  record, so every streaming spec would be refused with a token_balance
   *  violation before the mock model runs. */
  CHECK_BALANCE: 'false',
};

const baseEnv = {
  ...getLocalE2EEnv(),
  CONFIG_PATH: configPath,
  DEPLOYMENT_SKILLS_DIR: deploymentSkillsPath,
  /** Loaded in-process by `@librechat/api`'s `createRun` to swap in a fake model. */
  LIBRECHAT_TEST_RUN_HOOK: fakeModelHookPath,
  ...(enableDynamicMcp ? { E2E_MCP_LIST_CHANGED: 'true', E2E_MCP_STATE_PATH: MCP_STATE_PATH } : {}),
  ...vanillaOverrides,
};

const SECRET_KEY_PATTERN = /(API_KEY|SECRET|TOKEN|PASSWORD|CREDENTIALS|CLIENT_ID|_KEY)$/i;
const preservedCredentialEnvKeys = new Set([
  ...Object.keys(baseEnv),
  'E2E_USER_PASSWORD',
  'E2E_USER_B_PASSWORD',
]);

/**
 * The custom endpoints in the template point their `baseURL` at the local fake
 * label server; the fake model injected via `LIBRECHAT_TEST_RUN_HOOK` overrides
 * the GRAPH before any request is made, so no real provider is contacted.
 *
 * Activity labels are the one exception: `run.generateActivityLabel()` bypasses
 * the graph override and calls the endpoint's resolved client options, so that
 * request does go out over HTTP — to `fake-label-server.js` on 127.0.0.1.
 */
function writeRuntimeMockConfig() {
  const template = fs.readFileSync(configTemplatePath, 'utf8');
  let config =
    process.env.E2E_MODEL_SPECS_ENFORCE === 'true'
      ? template.replace('\n  enforce: false\n', '\n  enforce: true\n')
      : template;
  const dynamicMcpConfig = enableDynamicMcp
    ? {
        allowedDomain: '- http://127.0.0.1:8766',
        stdioEnv: [
          'env:',
          '      E2E_MCP_LIST_CHANGED: "true"',
          `      E2E_MCP_STATE_PATH: ${JSON.stringify(MCP_STATE_PATH)}`,
        ].join('\n'),
        networkServers: [
          'e2e-streamable:',
          '    type: streamable-http',
          '    url: http://127.0.0.1:8766/mcp',
          '    title: E2E Streamable HTTP',
          '    description: Dynamic real-SDK Streamable HTTP fixture for mock end-to-end tests.',
          '    timeout: 30000',
          '  e2e-sse:',
          '    type: sse',
          '    url: http://127.0.0.1:8766/sse',
          '    title: E2E SSE',
          '    description: Dynamic real-SDK legacy SSE fixture for mock end-to-end tests.',
          '    timeout: 30000',
        ].join('\n'),
      }
    : { allowedDomain: '', stdioEnv: '', networkServers: '' };
  config = config
    .replace('# __E2E_DYNAMIC_MCP_ALLOWED_DOMAIN__', dynamicMcpConfig.allowedDomain)
    .replace('# __E2E_DYNAMIC_MCP_STDIO_ENV__', dynamicMcpConfig.stdioEnv)
    .replace('# __E2E_DYNAMIC_MCP_NETWORK_SERVERS__', dynamicMcpConfig.networkServers);
  /** Keep the generated config in lockstep with the overridable label-server
   *  port: the template hard-codes 8889, so an `E2E_LABEL_PORT` override that
   *  moved only the server and its health check would report ready while
   *  every activity-label request went to the wrong port. */
  if (LABEL_PORT !== '8889') {
    config = config.split('127.0.0.1:8889').join(`127.0.0.1:${LABEL_PORT}`);
  }
  if (enableDynamicMcp && MCP_DYNAMIC_PORT !== '8766') {
    config = config.split('127.0.0.1:8766').join(`127.0.0.1:${MCP_DYNAMIC_PORT}`);
  }
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, config);
  if (enableDynamicMcp) {
    fs.mkdirSync(path.dirname(MCP_STATE_PATH), { recursive: true });
    fs.writeFileSync(MCP_STATE_PATH, `${JSON.stringify({ revision: 0, tool: null })}\n`);
  }
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
  fullyParallel: true,
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
      // URL-based MCP fixture for the allowlist-override spec (its health route is GET /).
      command: `node ${mcpHttpServerPath}`,
      cwd: rootPath,
      env: { ...process.env, E2E_MCP_HTTP_PORT: MCP_HTTP_PORT },
      url: `http://127.0.0.1:${MCP_HTTP_PORT}/`,
      stdout: 'pipe',
      timeout: 60_000,
      reuseExistingServer: false,
    },
    ...(enableDynamicMcp
      ? [
          {
            // One real SDK server exposes both current HTTP and legacy SSE transports.
            command: `node ${dynamicMcpServerPath}`,
            cwd: rootPath,
            env: {
              ...process.env,
              E2E_MCP_DYNAMIC_PORT: MCP_DYNAMIC_PORT,
              E2E_MCP_STATE_PATH: MCP_STATE_PATH,
            },
            url: `http://127.0.0.1:${MCP_DYNAMIC_PORT}/`,
            stdout: 'pipe' as const,
            timeout: 60_000,
            reuseExistingServer: false,
          },
        ]
      : []),
    {
      // Serves the activity-label model call (the custom endpoints' baseURL).
      command: `node ${labelServerPath}`,
      cwd: rootPath,
      env: { ...process.env, E2E_LABEL_PORT: LABEL_PORT },
      url: `http://127.0.0.1:${LABEL_PORT}/`,
      stdout: 'pipe',
      timeout: 60_000,
      reuseExistingServer: false,
    },
    {
      // Start one LibreChat process, or a two-process topology behind a test-only proxy, after the
      // network fixtures so inspection and persistent connections agree.
      command: `node ${serverPath}`,
      cwd: rootPath,
      // Only the one-replica harness may assert the scheduler's single-process topology.
      // The two-replica MCP suite must leave scheduled writes disabled.
      env: {
        ...process.env,
        ...(replicaCount === 1 ? { SCHEDULES_SINGLE_PROCESS: 'true' } : {}),
      },
      url: baseURL,
      stdout: 'pipe',
      ignoreHTTPSErrors: true,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
