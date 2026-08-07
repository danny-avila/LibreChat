import { readFileSync } from 'node:fs';

const mode = process.argv[2];
const config = JSON.parse(readFileSync(0, 'utf8'));
const { api, mongodb, 'mongodb-init': mongodbInit } = config.services;
const externalNoopImage =
  'tianon/true:multiarch@sha256:9314ed25b116fe075b90f854b6959ace635e981c39e932dfc4c902322f60b13e';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

if (mode === 'local') {
  const expectedMongoImage = process.env.EXPECTED_MONGO_IMAGE ?? 'mongo:8.0.20';
  assert(api.environment.MONGO_URI.endsWith('?replicaSet=rs0'), 'local URI must select rs0');
  assert(api.depends_on.mongodb == null, 'local API must not directly gate on MongoDB health');
  assert(
    api.depends_on['mongodb-init'].condition === 'service_completed_successfully',
    'local API must wait for replica-set initialization',
  );
  assert(mongodb.image === expectedMongoImage, `local MongoDB must use ${expectedMongoImage}`);
  assert(
    JSON.stringify(mongodb.command) ===
      JSON.stringify(['mongod', '--noauth', '--replSet', 'rs0', '--bind_ip_all']),
    'local MongoDB must start the supported private rs0 topology',
  );
  assert(mongodb.healthcheck.test[0] !== 'NONE', 'local MongoDB healthcheck must be active');
  assert(
    mongodb.healthcheck.retries >= 60,
    'local MongoDB health budget must cover connection and primary-election deadlines',
  );
  assert(
    mongodb.healthcheck.test[1].includes('command -v mongosh') &&
      mongodb.healthcheck.test[1].includes('|| shell=mongo') &&
      mongodb.healthcheck.test[1].includes('isMaster'),
    'local healthcheck must support mongosh and the legacy mongo shell',
  );
  assert(mongodbInit.image === 'mongo:8.0.20', 'local initializer must use the MongoDB 8 client');
  assert(
    JSON.stringify(mongodbInit.entrypoint) ===
      JSON.stringify(['/bin/sh', '/scripts/init-replica-set.sh']),
    'local initializer must execute the bounded initialization script',
  );
  assert(
    'MONGO_URI' in mongodbInit.environment,
    'local initializer must detect legacy external mode',
  );
  assert(
    [
      '/scripts/init-replica-set.js',
      '/scripts/init-replica-set.sh',
      '/scripts/replica-set-config.js',
    ].every((target) =>
      mongodbInit.volumes.some((volume) => volume.target === target && volume.read_only),
    ),
    'local initializer must mount its scripts and persisted-configuration validator read-only',
  );
} else if (mode === 'external') {
  assert(
    api.environment.MONGO_URI === (process.env.MONGO_URI ?? ''),
    'external URI must reach the API without blocking Compose administration when unset',
  );
  assert(
    api.depends_on.mongodb.condition === 'service_completed_successfully',
    'external API must not wait for local MongoDB health',
  );
  assert(
    api.depends_on['mongodb-init'].condition === 'service_completed_successfully',
    'external API must wait only for the no-op initializer',
  );
  assert(
    mongodb.image === externalNoopImage,
    'external MongoDB placeholder must use the pinned multi-platform no-op image',
  );
  assert(mongodb.healthcheck.disable === true, 'external MongoDB healthcheck must be disabled');
  assert(mongodb.entrypoint[0] === '/true', 'external MongoDB placeholder must execute /true');
  assert(mongodb.command.length === 0, 'external MongoDB placeholder must pass no arguments');
  assert(
    mongodbInit.image === externalNoopImage,
    'external initializer must use the pinned multi-platform no-op image',
  );
  assert(mongodbInit.entrypoint[0] === '/true', 'external initializer must execute /true');
  assert(mongodbInit.command.length === 0, 'external initializer must pass no arguments');
} else if (mode === 'legacy-external') {
  assert(
    api.environment.MONGO_URI === process.env.MONGO_URI,
    'legacy external URI must reach the API',
  );
  assert(
    api.depends_on.mongodb == null,
    'legacy external mode must not wait for the inherited local MongoDB health check',
  );
  assert(
    api.depends_on['mongodb-init'].condition === 'service_completed_successfully',
    'legacy external mode must wait for the compatibility-aware initializer',
  );
  assert(
    mongodbInit.environment.MONGO_URI === process.env.MONGO_URI,
    'legacy external URI must reach the compatibility-aware initializer',
  );
} else {
  throw new Error(`Unknown Compose assertion mode: ${mode}`);
}
