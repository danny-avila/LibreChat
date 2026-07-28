import { defineConfig } from '@playwright/test';
import path from 'node:path';
import mockConfig from './playwright.config.mock';
import { buildReasoningPayload } from './benchmarks-reasoning/payload';
import { getE2EServerAddress } from './setup/env';

/**
 * Reasoning-stream perf benchmark config.
 *
 * Streams one long `<think>…</think>` + markdown reply through the real
 * mock-model agents pipeline so react-scan can verify that rendering a single
 * large, unsplit reasoning part (plus long markdown text) stays
 * render-bounded — confirming the legacy content-part splitting is not needed.
 *
 * Tests run against the vite dev server (port 3090, proxying /api to the mock
 * backend on 3080): the dev build keeps component names, which react-scan
 * needs for per-component tallies — the production minifier (oxc) strips
 * `displayName` assignments.
 */
process.env.MOCK_LLM_REPLY = buildReasoningPayload();
process.env.MOCK_LLM_CHUNK_DELAY_MS ??= '1';

const rootPath = path.resolve(__dirname, '..');
const DEV_SERVER_URL = 'http://localhost:3090';
const backendPort = getE2EServerAddress().port;

const appServer = Array.isArray(mockConfig.webServer)
  ? mockConfig.webServer[0]
  : mockConfig.webServer;

export default defineConfig({
  ...mockConfig,
  testDir: 'benchmarks-reasoning',
  outputDir: 'benchmarks-reasoning/.test-results',
  timeout: 10 * 60 * 1000,
  retries: 0,
  reporter: [['line']],
  use: {
    ...mockConfig.use,
    baseURL: DEV_SERVER_URL,
  },
  webServer: [
    ...(appServer ? [appServer] : []),
    {
      command: 'npm run frontend:dev',
      cwd: rootPath,
      /** The mock env exports PORT for the backend; vite reads PORT for its
       *  own listen port, so pin the dev server back to 3090 and point its
       *  /api proxy at whichever port the app server actually uses. */
      env: { ...process.env, PORT: '3090', HOST: 'localhost', BACKEND_PORT: backendPort },
      url: DEV_SERVER_URL,
      stdout: 'pipe',
      timeout: 180_000,
      reuseExistingServer: false,
    },
  ],
});
