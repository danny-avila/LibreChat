import path from 'node:path';
import { defineConfig } from '@playwright/test';
import mockConfig from './playwright.config.mock';

const servers = (Array.isArray(mockConfig.webServer) ? mockConfig.webServer : []).filter((server) =>
  server.command.endsWith('start-server.js'),
);
export default defineConfig({
  ...mockConfig,
  testDir: 'media',
  outputDir: 'media/.test-results',
  retries: 0,
  reporter: [['line']],
  webServer: [
    {
      command: `node ${path.resolve(__dirname, 'media/provider.cjs')}`,
      cwd: path.resolve(__dirname, '..'),
      url: 'http://127.0.0.1:8768/health',
      reuseExistingServer: false,
    },
    ...servers.map((server) => ({
      ...server,
      env: {
        ...server.env,
        CONFIG_PATH: path.resolve(__dirname, 'media/librechat.yaml'),
        E2E_USE_MEMORY_MONGO: 'true',
        ENDPOINTS: 'openAI,custom',
        OPENAI_MODELS: 'gpt-4o-mini',
        ASSISTANTS_API_KEY: '',
      },
    })),
  ],
});
