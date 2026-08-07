const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { existsSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');

const initScript = path.join(__dirname, 'init-replica-set.sh');

function runInitializer(mongoUri) {
  const fakeBin = mkdtempSync(path.join(os.tmpdir(), 'librechat-mongosh-'));
  const marker = path.join(fakeBin, 'invoked');
  const mongosh = path.join(fakeBin, 'mongosh');
  writeFileSync(mongosh, '#!/bin/sh\ntouch "$MONGOSH_MARKER"\n', { mode: 0o755 });

  const result = spawnSync('sh', [initScript], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
      MONGO_URI: mongoUri,
      MONGOSH_MARKER: marker,
    },
  });

  const invoked = existsSync(marker);
  rmSync(fakeBin, { recursive: true, force: true });

  return { invoked, result };
}

test('initializes the bundled MongoDB service for known local URIs', () => {
  const mongoUris = [
    '',
    'mongodb://127.0.0.1:27017/LibreChat',
    'mongodb://localhost:27017/LibreChat',
    'mongodb://mongodb:27017/LibreChat?replicaSet=rs0',
    'mongodb://chat-mongodb:27017/LibreChat',
  ];

  for (const mongoUri of mongoUris) {
    const { invoked, result } = runInitializer(mongoUri);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(invoked, true, `mongosh was skipped for ${mongoUri}`);
  }
});

test('skips bundled initialization for a legacy external-Mongo override', () => {
  const { invoked, result } = runInitializer(
    'mongodb+srv://librechat.example.net/LibreChat?retryWrites=true',
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /External MONGO_URI detected/);
  assert.equal(invoked, false);
});
