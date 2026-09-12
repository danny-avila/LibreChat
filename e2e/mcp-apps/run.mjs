#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const baseUrl = new URL(process.env.E2E_BASE_URL || 'http://127.0.0.1:3080');
const sandboxHost = baseUrl.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
const sandboxUrl = new URL('/api/mcp/sandbox', baseUrl);
sandboxUrl.hostname = sandboxHost;

const env = {
  ...process.env,
  E2E_BASE_URL: baseUrl.origin,
  E2E_MCP_APPS: 'true',
  MCP_SANDBOX_FRAME_ANCESTORS: baseUrl.origin,
  VITE_MCP_SANDBOX_URL: process.env.VITE_MCP_SANDBOX_URL || sandboxUrl.href,
};

const command = (name) => (process.platform === 'win32' ? `${name}.cmd` : name);

function run(executable, args) {
  const result = spawnSync(command(executable), args, { env, stdio: 'inherit' });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run('npm', ['run', 'e2e:prepare']);
run('npx', ['playwright', 'test', '--config=e2e/playwright.config.mcp-apps.ts']);
