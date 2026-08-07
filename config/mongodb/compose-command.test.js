const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const packageJson = require(path.join(__dirname, '..', '..', 'package.json'));

test('deployment scripts require Docker Compose v2', () => {
  assert.equal(
    packageJson.scripts['start:deployed'],
    'docker compose -f ./deploy-compose.yml up -d',
  );
  assert.equal(packageJson.scripts['stop:deployed'], 'docker compose -f ./deploy-compose.yml down');
});
