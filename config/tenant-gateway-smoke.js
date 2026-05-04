#!/usr/bin/env node

const assert = require('node:assert/strict');

const baseUrl = (process.env.TENANT_GATEWAY_URL || 'http://127.0.0.1:3080').replace(/\/+$/, '');

async function request(path, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, { headers, redirect: 'manual' });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text();
  return { status: response.status, body };
}

async function runCheck(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    return { name, ok: true, ms: Date.now() - started, detail };
  } catch (error) {
    return { name, ok: false, ms: Date.now() - started, error: error.message };
  }
}

async function main() {
  const checks = [
    runCheck('rejects requests without trusted auth-gateway tenant header', async () => {
      const response = await request('/health');
      assert.equal(response.status, 401);
      return { status: response.status };
    }),
    runCheck('ignores browser-supplied X-Tenant-Id without auth-gateway header', async () => {
      const response = await request('/health', { 'X-Tenant-Id': 'tenant-a' });
      assert.equal(response.status, 401);
      return { status: response.status };
    }),
    runCheck('rejects malformed auth-gateway tenant header', async () => {
      const response = await request('/health', { 'X-Auth-Tenant-Id': 'bad tenant' });
      assert.equal(response.status, 401);
      return { status: response.status };
    }),
    runCheck('accepts valid auth-gateway tenant header', async () => {
      const response = await request('/health', { 'X-Auth-Tenant-Id': 'tenant-a' });
      assert.equal(response.status, 200);
      assert.equal(response.body, 'OK');
      return { status: response.status };
    }),
    runCheck('overwrites untrusted X-Tenant-Id before proxying', async () => {
      const response = await request('/api/config', {
        'X-Auth-Tenant-Id': 'tenant-a',
        'X-Tenant-Id': '__SYSTEM__',
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.emailLoginEnabled, true);
      return { status: response.status, appTitle: response.body.appTitle };
    }),
  ];

  const results = await Promise.all(checks);
  const failed = results.filter((result) => !result.ok);
  console.log(JSON.stringify({ baseUrl, results }, null, 2));

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
