const assert = require('node:assert/strict');
const { test } = require('node:test');
const { assertSupportedReplicaSetConfig } = require('./replica-set-config');

test('accepts the supported one-member service address', () => {
  assert.doesNotThrow(() =>
    assertSupportedReplicaSetConfig(
      { _id: 'rs0', members: [{ _id: 0, host: 'mongodb:27017' }] },
      'rs0',
      'mongodb:27017',
    ),
  );
});

test('rejects an initialized member with a different address', () => {
  assert.throws(
    () =>
      assertSupportedReplicaSetConfig(
        { _id: 'rs0', members: [{ _id: 0, host: 'localhost:27017' }] },
        'rs0',
        'mongodb:27017',
      ),
    /mongodb:27017.*localhost:27017/,
  );
});

test('rejects an initialized multi-member topology', () => {
  assert.throws(
    () =>
      assertSupportedReplicaSetConfig(
        {
          _id: 'rs0',
          members: [
            { _id: 0, host: 'mongodb:27017' },
            { _id: 1, host: 'mongodb-secondary:27017' },
          ],
        },
        'rs0',
        'mongodb:27017',
      ),
    /exactly one member.*2/,
  );
});
