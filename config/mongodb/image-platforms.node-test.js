const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');

const assertionScript = path.join(__dirname, 'assert-image-platforms.mjs');

function runAssertion(platforms) {
  return spawnSync(process.execPath, [assertionScript], {
    encoding: 'utf8',
    input: JSON.stringify({
      manifests: platforms.map(([os, architecture]) => ({ platform: { os, architecture } })),
    }),
  });
}

test('accepts a manifest index with Linux amd64 and arm64 images', () => {
  const result = runAssertion([
    ['linux', 'amd64'],
    ['linux', 'arm64'],
    ['unknown', 'unknown'],
  ]);

  assert.equal(result.status, 0, result.stderr);
});

test('rejects a manifest index missing Linux arm64', () => {
  const result = runAssertion([['linux', 'amd64']]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /linux\/arm64/);
});
