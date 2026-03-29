#!/usr/bin/env node
/**
 * AtlasChat — Code Interpreter Setup Script
 *
 * Installs language runtimes into a self-hosted Piston instance.
 * Works identically in Docker Compose, Kubernetes init containers, and CI.
 *
 * Usage:
 *   node config/setup-code-interpreter.js
 *
 * Environment variables:
 *   PISTON_URL        Piston API base URL (default: http://piston:2000)
 *   PISTON_ACTION_URL piston-action base URL for smoke-test (default: http://piston_action:3333)
 *   RUNTIMES          Comma-separated list of languages to install (default: all below)
 *   SKIP_VERIFY       Skip post-install smoke-test (default: false)
 *   MAX_WAIT_SECS     Max seconds to wait for Piston to be ready (default: 120)
 */

'use strict';

const http  = require('http');
const https = require('https');

// ── Config ─────────────────────────────────────────────────────────────────

const PISTON_URL        = (process.env.PISTON_URL        || 'http://piston:2000').replace(/\/$/, '');
const PISTON_ACTION_URL = (process.env.PISTON_ACTION_URL || 'http://piston_action:3333').replace(/\/$/, '');
const MAX_WAIT_SECS     = Number(process.env.MAX_WAIT_SECS || '120');
const SKIP_VERIFY       = process.env.SKIP_VERIFY === 'true';

/** Runtimes we want installed, in priority order. */
const DESIRED_RUNTIMES = (process.env.RUNTIMES || '').trim()
  ? process.env.RUNTIMES.split(',').map(s => s.trim())
  : [
      'python',     // py
      'javascript', // js  (Piston built-in runtime name)
      'typescript', // ts
      'bash',       // bash / shell scripts
      'go',         // go
      'rust',       // rs
      'java',       // java
      'php',        // php
    ];

/** Smoke-test: one execution per language to confirm the runtime works */
const SMOKE_TESTS = {
  python:     { lang: 'py',   code: 'print("python ok")',                  expect: 'python ok' },
  javascript: { lang: 'js',   code: 'console.log("javascript ok")',        expect: 'javascript ok' },
  typescript: { lang: 'ts',   code: 'console.log("ts ok")',                expect: 'ts ok'     },
  bash:       { lang: 'bash', code: 'echo "bash ok"',                      expect: 'bash ok'   },
  go: {
    lang: 'go',
    code: 'package main\nimport "fmt"\nfunc main(){fmt.Println("go ok")}',
    expect: 'go ok',
  },
};

// ── Utilities ──────────────────────────────────────────────────────────────

const log  = (...args) => console.log('[setup-ci]', ...args);
const warn = (...args) => console.warn('[setup-ci] WARN', ...args);
const fail = (...args) => { console.error('[setup-ci] ERROR', ...args); process.exit(1); };

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Generic HTTP/HTTPS request returning { status, body (parsed JSON or raw string) } */
const request = (url, opts = {}) => new Promise((resolve, reject) => {
  const parsed = new URL(url);
  const lib    = parsed.protocol === 'https:' ? https : http;
  const body   = opts.body ? JSON.stringify(opts.body) : undefined;

  const req = lib.request({
    hostname: parsed.hostname,
    port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path:     parsed.pathname + (parsed.search || ''),
    method:   opts.method || (body ? 'POST' : 'GET'),
    headers:  {
      'Content-Type': 'application/json',
      ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      ...opts.headers,
    },
  }, res => {
    let data = '';
    res.on('data', c => { data += c; });
    res.on('end', () => {
      try {
        resolve({ status: res.statusCode, body: JSON.parse(data) });
      } catch {
        resolve({ status: res.statusCode, body: data });
      }
    });
  });

  req.on('error', reject);
  if (body) req.write(body);
  req.end();
});

// ── Step 1 — Wait for Piston ───────────────────────────────────────────────

const waitForPiston = async () => {
  log(`Waiting for Piston at ${PISTON_URL} (max ${MAX_WAIT_SECS}s)…`);
  const deadline = Date.now() + MAX_WAIT_SECS * 1000;

  while (Date.now() < deadline) {
    try {
      const { status } = await request(`${PISTON_URL}/api/v2/runtimes`);
      if (status === 200) { log('Piston is ready.'); return; }
    } catch { /* not ready yet */ }
    await sleep(3000);
  }

  fail(`Piston did not become ready within ${MAX_WAIT_SECS}s`);
};

// ── Step 2 — Discover available packages ──────────────────────────────────

const getAvailablePackages = async () => {
  const { status, body } = await request(`${PISTON_URL}/api/v2/packages`);
  if (status !== 200) fail('Could not fetch package list from Piston');

  /** Keep only the latest version for each language */
  const latest = {};
  for (const pkg of body) {
    const existing = latest[pkg.language];
    if (!existing || pkg.language_version > existing.language_version) {
      latest[pkg.language] = pkg;
    }
  }
  return latest;
};

const getInstalledRuntimes = async () => {
  const { status, body } = await request(`${PISTON_URL}/api/v2/runtimes`);
  if (status !== 200) fail('Could not fetch installed runtimes from Piston');
  return new Set(body.map(r => r.language));
};

// ── Step 3 — Install missing runtimes ─────────────────────────────────────

const installRuntime = async (language, version) => {
  log(`  Installing ${language}@${version}…`);
  try {
    const { status, body } = await request(`${PISTON_URL}/api/v2/packages`, {
      method: 'POST',
      body: { language, version },
    });

    if (status === 200) {
      log(`  ✓ ${language}@${version} installed`);
      return true;
    }

    const msg = (body && body.message) || `HTTP ${status}`;
    warn(`  ✗ ${language}: ${msg}`);
    return false;
  } catch (err) {
    warn(`  ✗ ${language}: ${err.message}`);
    return false;
  }
};

// ── Step 4 — Smoke-test via piston-action /exec ────────────────────────────

const smokeTest = async (language, test) => {
  try {
    const { status, body } = await request(`${PISTON_ACTION_URL}/exec`, {
      method: 'POST',
      body: { lang: test.lang, code: test.code },
      headers: { 'X-API-Key': 'self-hosted' },
    });

    if (status !== 200) {
      warn(`  smoke-test ${language}: HTTP ${status}`);
      return false;
    }

    const stdout = (body.stdout || '').trim();
    if (stdout.includes(test.expect)) {
      log(`  ✓ ${language} smoke-test passed`);
      return true;
    }

    warn(`  ✗ ${language} smoke-test: expected "${test.expect}", got "${stdout}"`);
    return false;
  } catch (err) {
    warn(`  ✗ ${language} smoke-test error: ${err.message}`);
    return false;
  }
};

// ── Main ───────────────────────────────────────────────────────────────────

const main = async () => {
  log('=== AtlasChat Code Interpreter Setup ===');
  log(`Piston:        ${PISTON_URL}`);
  log(`Piston-action: ${PISTON_ACTION_URL}`);
  log(`Runtimes:      ${DESIRED_RUNTIMES.join(', ')}`);

  // 1. Wait for Piston to be healthy
  await waitForPiston();

  // 2. Get current state
  const [available, installed] = await Promise.all([
    getAvailablePackages(),
    getInstalledRuntimes(),
  ]);

  log(`\nAvailable packages: ${Object.keys(available).length}`);
  log(`Already installed:  ${installed.size} (${[...installed].join(', ') || 'none'})`);

  // 3. Install missing runtimes
  const toInstall = DESIRED_RUNTIMES.filter(lang => {
    if (installed.has(lang))    { log(`  ↳ ${lang}: already installed, skipping`); return false; }
    if (!available[lang])       { warn(`  ↳ ${lang}: not available in this Piston build, skipping`); return false; }
    return true;
  });

  if (toInstall.length === 0) {
    log('\nAll desired runtimes already installed.');
  } else {
    log(`\nInstalling ${toInstall.length} runtime(s)…`);
    // Install sequentially to avoid overloading the package server
    for (const lang of toInstall) {
      await installRuntime(lang, available[lang].language_version);
    }
  }

  // 4. Smoke-test
  if (SKIP_VERIFY) {
    log('\nSKIP_VERIFY=true — skipping smoke-tests.');
  } else {
    log('\nRunning smoke-tests via piston-action…');

    // Wait for piston_action to be ready
    let actionReady = false;
    for (let i = 0; i < 10; i++) {
      try {
        const { status } = await request(`${PISTON_ACTION_URL}/health`);
        if (status === 200) { actionReady = true; break; }
      } catch { /* wait */ }
      await sleep(2000);
    }

    if (!actionReady) {
      warn('piston-action is not reachable — smoke-tests skipped.');
    } else {
      const languages = Object.keys(SMOKE_TESTS).filter(l => installed.has(l) || toInstall.includes(l));
      const results   = await Promise.all(
        languages.map(lang => smokeTest(lang, SMOKE_TESTS[lang])),
      );
      const passed = results.filter(Boolean).length;
      log(`\nSmoke-tests: ${passed}/${languages.length} passed`);
    }
  }

  log('\n✅ Code interpreter setup complete.\n');
  log('Required environment variables for LibreChat:');
  log('  LIBRECHAT_CODE_API_KEY=self-hosted');
  log(`  LIBRECHAT_CODE_BASEURL=${PISTON_ACTION_URL}`);
};

main().catch(err => fail(err.message));
