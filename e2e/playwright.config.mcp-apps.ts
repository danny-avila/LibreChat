import { defineConfig } from '@playwright/test';
import mockConfig from './playwright.config.mock';

if (process.env.E2E_MCP_APPS !== 'true') {
  throw new Error('The MCP Apps browser fixture requires E2E_MCP_APPS=true');
}

export default defineConfig({
  ...mockConfig,
  testMatch: /mcp-apps\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
});
