const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');

const initScript = path.join(__dirname, 'init-replica-set.sh');

function runInitializer(mongoUri, { outerTimeout = false } = {}) {
  const fakeBin = mkdtempSync(path.join(os.tmpdir(), 'librechat-mongosh-'));
  const marker = path.join(fakeBin, 'invoked');
  const argsLog = path.join(fakeBin, 'args');
  const timeoutLog = path.join(fakeBin, 'timeouts');
  const mongosh = path.join(fakeBin, 'mongosh');
  const timeout = path.join(fakeBin, 'timeout');
  writeFileSync(
    mongosh,
    '#!/bin/sh\ntouch "$MONGOSH_MARKER"\nprintf \'%s\\n\' "$*" >> "$MONGOSH_ARGS"\n',
    { mode: 0o755 },
  );
  writeFileSync(
    timeout,
    '#!/bin/sh\nduration="$1"\nprintf \'%s\\n\' "$duration" >> "$TIMEOUT_ARGS"\nshift\nif [ "$duration" = "120s" ] && [ "$FAIL_OUTER_TIMEOUT" = "yes" ]; then exit 124; fi\nexec "$@"\n',
    { mode: 0o755 },
  );

  const result = spawnSync('sh', [initScript], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
      MONGO_URI: mongoUri,
      FAIL_OUTER_TIMEOUT: outerTimeout ? 'yes' : 'no',
      MONGOSH_ARGS: argsLog,
      MONGOSH_MARKER: marker,
      TIMEOUT_ARGS: timeoutLog,
    },
  });

  const invoked = existsSync(marker);
  const args = existsSync(argsLog) ? readFileSync(argsLog, 'utf8').trim().split('\n') : [];
  const timeouts = existsSync(timeoutLog)
    ? readFileSync(timeoutLog, 'utf8').trim().split('\n')
    : [];
  rmSync(fakeBin, { recursive: true, force: true });

  return { args, invoked, result, timeouts };
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
    const { args, invoked, result, timeouts } = runInitializer(mongoUri);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(invoked, true, `mongosh was skipped for ${mongoUri}`);
    assert.equal(args.length, 2);
    assert.deepEqual(timeouts, ['120s', '2s']);
    assert.ok(args.every((value) => value.includes('serverSelectionTimeoutMS=1000')));
    assert.ok(args.every((value) => value.includes('connectTimeoutMS=1000')));
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

test('bounds unreachable MongoDB by elapsed time and per-attempt timeout', () => {
  const { args, result, timeouts } = runInitializer('mongodb://mongodb:27017/LibreChat', {
    outerTimeout: true,
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /within 120 seconds/);
  assert.deepEqual(args, []);
  assert.deepEqual(timeouts, ['120s']);
});
