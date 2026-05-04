#!/usr/bin/env node

const assert = require('node:assert/strict');

const baseUrl = (process.env.AUTH_GATEWAY_URL || '').replace(/\/+$/, '');
const probePath = process.env.AUTH_GATEWAY_PROBE_PATH || '/health';
const validHeadersJson = process.env.AUTH_GATEWAY_VALID_HEADERS_JSON || '';
const expectedValidStatus = Number(process.env.AUTH_GATEWAY_EXPECT_VALID_STATUS || '200');
const expectedValidBody = process.env.AUTH_GATEWAY_EXPECT_VALID_BODY;
const spoofTenantId = process.env.AUTH_GATEWAY_SPOOF_TENANT_ID || '__SYSTEM__';
const allowedUnauthStatuses = new Set(
  (process.env.AUTH_GATEWAY_EXPECT_UNAUTH_STATUSES || '401,403,302')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value)),
);
const forbiddenResponseHeaders = (
  process.env.AUTH_GATEWAY_FORBIDDEN_RESPONSE_HEADERS || 'x-tenant-id,x-auth-tenant-id'
)
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

if (!baseUrl) {
  console.error('AUTH_GATEWAY_URL is required, for example https://chat.yourdomain.tld');
  process.exit(1);
}

function parseHeaders(json) {
  if (!json) {
    return undefined;
  }
  const parsed = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AUTH_GATEWAY_VALID_HEADERS_JSON must be a JSON object');
  }
  return parsed;
}

async function request(path, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, { headers, redirect: 'manual' });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text();
  const responseHeaders = {};
  for (const [name, value] of response.headers.entries()) {
    responseHeaders[name.toLowerCase()] = value;
  }
  return { status: response.status, body, headers: responseHeaders };
}

function assertNoTenantHeadersLeaked(response) {
  for (const header of forbiddenResponseHeaders) {
    assert.equal(response.headers[header], undefined, `response leaked ${header}`);
  }
}

function assertUnauthenticated(response) {
  assert(
    allowedUnauthStatuses.has(response.status),
    `expected one of ${[...allowedUnauthStatuses].join(', ')}, got ${response.status}`,
  );
  assertNoTenantHeadersLeaked(response);
}

function assertValid(response) {
  assert.equal(response.status, expectedValidStatus);
  if (expectedValidBody !== undefined) {
    assert.equal(String(response.body).trim(), expectedValidBody);
  }
  assertNoTenantHeadersLeaked(response);
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
  const validHeaders = parseHeaders(validHeadersJson);
  const checks = [
    runCheck('rejects unauthenticated request without tenant headers', async () => {
      const response = await request(probePath);
      assertUnauthenticated(response);
      return { status: response.status };
    }),
    runCheck('rejects unauthenticated spoofed X-Tenant-Id', async () => {
      const response = await request(probePath, { 'X-Tenant-Id': spoofTenantId });
      assertUnauthenticated(response);
      return { status: response.status };
    }),
    runCheck('rejects unauthenticated spoofed X-Auth-Tenant-Id', async () => {
      const response = await request(probePath, { 'X-Auth-Tenant-Id': spoofTenantId });
      assertUnauthenticated(response);
      return { status: response.status };
    }),
    runCheck('rejects unauthenticated combined tenant spoof', async () => {
      const response = await request(probePath, {
        'X-Tenant-Id': spoofTenantId,
        'X-Auth-Tenant-Id': spoofTenantId,
      });
      assertUnauthenticated(response);
      return { status: response.status };
    }),
  ];

  if (validHeaders) {
    checks.push(
      runCheck('accepts valid authenticated request', async () => {
        const response = await request(probePath, validHeaders);
        assertValid(response);
        return { status: response.status };
      }),
      runCheck('accepts valid auth while ignoring client tenant spoof headers', async () => {
        const response = await request(probePath, {
          ...validHeaders,
          'X-Tenant-Id': spoofTenantId,
          'X-Auth-Tenant-Id': spoofTenantId,
        });
        assertValid(response);
        return { status: response.status };
      }),
    );
  }

  const results = await Promise.all(checks);
  const failed = results.filter((result) => !result.ok);
  console.log(
    JSON.stringify(
      {
        baseUrl,
        probePath,
        authenticatedChecksEnabled: Boolean(validHeaders),
        results,
      },
      null,
      2,
    ),
  );

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
