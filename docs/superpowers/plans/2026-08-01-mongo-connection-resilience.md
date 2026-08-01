# Mongo Connection Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden `api/db/connect.js` so idle Mongo connections are proactively recycled and replica-set failover timeouts are tuned for small/k8s deployments, with operational logging for every connection state transition.

**Architecture:** Extract the mongoose connection options object built inline in `connectDb()` into a pure, exported, unit-testable function `buildMongoConnectionOptions(env)`. Add three new connection-event listeners (`disconnected`, `reconnected`, `close`) alongside the existing `error` listener, verified against a real in-memory MongoDB via `mongodb-memory-server`.

**Tech Stack:** Node.js, Express, Mongoose 8 / MongoDB driver 6, Jest, `mongodb-memory-server`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-01-mongo-connection-resilience-design.md` — read it before starting.
- Scope is `api/db/connect.js` and `.env.example` only. Do not touch `/health`, `/readyz`, the Helm chart, or `api/strategies/openidStrategy.js` — those are out of scope for this PR per the spec.
- `bufferCommands` stays `false`. Do not reintroduce application-level command buffering.
- Existing tunables (`MONGO_MAX_POOL_SIZE`, `MONGO_MIN_POOL_SIZE`, `MONGO_MAX_CONNECTING`, `MONGO_WAIT_QUEUE_TIMEOUT_MS`, `MONGO_AUTO_INDEX`, `MONGO_AUTO_CREATE`) must keep their exact current behavior (absent from the options object when unset, per the existing `parseInt(...) || undefined` pattern) — do not change how they're parsed.
- New tunable defaults (only applied when the env var is unset or not a valid number):
  - `MONGO_MAX_IDLE_TIME_MS` → `60000`
  - `MONGO_HEARTBEAT_FREQUENCY_MS` → `10000`
  - `MONGO_SOCKET_TIMEOUT_MS` → `45000`
  - `MONGO_SERVER_SELECTION_TIMEOUT_MS` → `10000`
- Tests: run from the `api` workspace (`cd api && npx jest <pattern>`). Real MongoDB via `mongodb-memory-server`, no mocking of mongoose/mongodb internals. `logger` is already globally mocked as `jest.fn()`s via `api/test/jestSetup.js` + `api/test/__mocks__/logger.js` — assert on it directly, don't re-mock it.

---

### Task 1: Extract `buildMongoConnectionOptions` with resilience defaults

**Files:**
- Modify: `api/db/connect.js`
- Modify: `.env.example:24-27`
- Test: `api/db/connect.spec.js` (new file)

**Interfaces:**
- Produces: `buildMongoConnectionOptions(env = process.env)` — pure function, exported from `api/db/connect.js` alongside the existing `connectDb` export. Returns a plain object suitable to pass as mongoose `connect()` options. Task 2 does not depend on this function's return shape (it only adds listeners), but must not remove this export.

- [ ] **Step 1: Write the failing unit tests**

Create `api/db/connect.spec.js`:

```js
const { buildMongoConnectionOptions } = require('./connect');

describe('buildMongoConnectionOptions', () => {
  test('applies resilience defaults when no relevant env vars are set', () => {
    const options = buildMongoConnectionOptions({});

    expect(options).toEqual({
      bufferCommands: false,
      maxIdleTimeMS: 60000,
      heartbeatFrequencyMS: 10000,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 10000,
    });
  });

  test('respects explicit overrides for all four new tunables', () => {
    const options = buildMongoConnectionOptions({
      MONGO_MAX_IDLE_TIME_MS: '120000',
      MONGO_HEARTBEAT_FREQUENCY_MS: '5000',
      MONGO_SOCKET_TIMEOUT_MS: '30000',
      MONGO_SERVER_SELECTION_TIMEOUT_MS: '20000',
    });

    expect(options).toMatchObject({
      maxIdleTimeMS: 120000,
      heartbeatFrequencyMS: 5000,
      socketTimeoutMS: 30000,
      serverSelectionTimeoutMS: 20000,
    });
  });

  test('falls back to defaults for non-numeric values instead of NaN', () => {
    const options = buildMongoConnectionOptions({
      MONGO_MAX_IDLE_TIME_MS: 'not-a-number',
    });

    expect(options.maxIdleTimeMS).toBe(60000);
  });

  test('respects an explicit 0 rather than treating it as unset', () => {
    const options = buildMongoConnectionOptions({
      MONGO_SOCKET_TIMEOUT_MS: '0',
    });

    expect(options.socketTimeoutMS).toBe(0);
  });

  test('keeps existing pool tunables absent when unset (unchanged behavior)', () => {
    const options = buildMongoConnectionOptions({});

    expect(options).not.toHaveProperty('maxPoolSize');
    expect(options).not.toHaveProperty('minPoolSize');
    expect(options).not.toHaveProperty('maxConnecting');
    expect(options).not.toHaveProperty('waitQueueTimeoutMS');
    expect(options).not.toHaveProperty('autoIndex');
    expect(options).not.toHaveProperty('autoCreate');
  });

  test('still includes existing pool tunables when explicitly set (unchanged behavior)', () => {
    const options = buildMongoConnectionOptions({
      MONGO_MAX_POOL_SIZE: '10',
      MONGO_AUTO_INDEX: 'false',
    });

    expect(options.maxPoolSize).toBe(10);
    expect(options.autoIndex).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd api && npx jest db/connect.spec.js`
Expected: FAIL — `buildMongoConnectionOptions` is not exported from `./connect` (it doesn't exist yet).

- [ ] **Step 3: Implement `buildMongoConnectionOptions` in `api/db/connect.js`**

Replace the entire contents of `api/db/connect.js` with:

```js
require('dotenv').config();
const { isEnabled, instrumentMongooseQueryMetrics } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');

const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGO_URI;

instrumentMongooseQueryMetrics(mongoose);

if (!MONGO_URI) {
  throw new Error('Please define the MONGO_URI environment variable');
}

/** Applied when the corresponding env var is unset or not a valid number. */
const DEFAULT_MAX_IDLE_TIME_MS = 60000;
const DEFAULT_HEARTBEAT_FREQUENCY_MS = 10000;
const DEFAULT_SOCKET_TIMEOUT_MS = 45000;
const DEFAULT_SERVER_SELECTION_TIMEOUT_MS = 10000;

/**
 * Parses an env var as an integer, falling back to `defaultValue` when the
 * value is unset or not a valid number. Unlike `parseInt(value) || fallback`,
 * this respects an explicit `"0"` override instead of treating it as unset.
 * @param {string | undefined} value
 * @param {number} defaultValue
 * @returns {number}
 */
function parseEnvInt(value, defaultValue) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Builds the mongoose connection options from environment variables. Pure
 * function — performs no I/O, so connection resilience tuning can be unit
 * tested without a running MongoDB instance.
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {import('mongoose').ConnectOptions}
 */
function buildMongoConnectionOptions(env = process.env) {
  /** The maximum number of connections in the connection pool. */
  const maxPoolSize = parseInt(env.MONGO_MAX_POOL_SIZE) || undefined;
  /** The minimum number of connections in the connection pool. */
  const minPoolSize = parseInt(env.MONGO_MIN_POOL_SIZE) || undefined;
  /** The maximum number of connections that may be in the process of being established concurrently by the connection pool. */
  const maxConnecting = parseInt(env.MONGO_MAX_CONNECTING) || undefined;
  /** The maximum time in milliseconds that a thread can wait for a connection to become available. */
  const waitQueueTimeoutMS = parseInt(env.MONGO_WAIT_QUEUE_TIMEOUT_MS) || undefined;
  /** Maximum time a pooled connection may sit idle before being proactively closed, so a network intermediary (LB/NAT/firewall) doesn't silently drop it first. */
  const maxIdleTimeMS = parseEnvInt(env.MONGO_MAX_IDLE_TIME_MS, DEFAULT_MAX_IDLE_TIME_MS);
  /** How often the driver pings each server to detect topology changes, e.g. a replica set election. */
  const heartbeatFrequencyMS = parseEnvInt(
    env.MONGO_HEARTBEAT_FREQUENCY_MS,
    DEFAULT_HEARTBEAT_FREQUENCY_MS,
  );
  /** How long a socket may stay inactive before an operation on it fails, bounding how long a half-dead connection can block a request. */
  const socketTimeoutMS = parseEnvInt(env.MONGO_SOCKET_TIMEOUT_MS, DEFAULT_SOCKET_TIMEOUT_MS);
  /** How long the driver waits for a suitable server (e.g. a new primary after an election) before failing an operation. */
  const serverSelectionTimeoutMS = parseEnvInt(
    env.MONGO_SERVER_SELECTION_TIMEOUT_MS,
    DEFAULT_SERVER_SELECTION_TIMEOUT_MS,
  );
  /** Set to false to disable automatic index creation for all models associated with this connection. */
  const autoIndex =
    env.MONGO_AUTO_INDEX != undefined ? isEnabled(env.MONGO_AUTO_INDEX) || false : undefined;
  /** Set to `false` to disable Mongoose automatically calling `createCollection()` on every model created on this connection. */
  const autoCreate =
    env.MONGO_AUTO_CREATE != undefined ? isEnabled(env.MONGO_AUTO_CREATE) || false : undefined;

  return {
    bufferCommands: false,
    maxIdleTimeMS,
    heartbeatFrequencyMS,
    socketTimeoutMS,
    serverSelectionTimeoutMS,
    ...(maxPoolSize ? { maxPoolSize } : {}),
    ...(minPoolSize ? { minPoolSize } : {}),
    ...(maxConnecting ? { maxConnecting } : {}),
    ...(waitQueueTimeoutMS ? { waitQueueTimeoutMS } : {}),
    ...(autoIndex != undefined ? { autoIndex } : {}),
    ...(autoCreate != undefined ? { autoCreate } : {}),
  };
}

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

mongoose.connection.on('error', (err) => {
  logger.error('[connectDb] MongoDB connection error:', err);
});

async function connectDb() {
  if (cached.conn && cached.conn?._readyState === 1) {
    return cached.conn;
  }

  const disconnected = cached.conn && cached.conn?._readyState !== 1;
  if (!cached.promise || disconnected) {
    const opts = buildMongoConnectionOptions();
    logger.info('Mongo Connection options');
    logger.info(JSON.stringify(opts, null, 2));
    mongoose.set('strictQuery', true);
    cached.promise = mongoose.connect(MONGO_URI, opts).then((mongoose) => {
      return mongoose;
    });
  }
  cached.conn = await cached.promise;

  return cached.conn;
}

module.exports = {
  connectDb,
  buildMongoConnectionOptions,
};
```

Note: this removes the dead commented-out lines (`// useNewUrlParser: true`, etc.) that were already unused — direct cleanup of the block being rewritten, not a separate refactor.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd api && npx jest db/connect.spec.js`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Update `.env.example` documentation**

In `.env.example`, replace lines 24-27 (the `MONGO_MAX_IDLE_TIME_MS` and `MONGO_WAIT_QUEUE_TIMEOUT_MS` block) with:

```
#The maximum number of milliseconds that a connection can remain idle in the pool before being removed and closed. Defaults to 60000 (1 minute) if unset. */
MONGO_MAX_IDLE_TIME_MS=
#How often, in milliseconds, the driver pings each server to detect topology changes (e.g. a replica set election). Defaults to 10000 if unset. */
MONGO_HEARTBEAT_FREQUENCY_MS=
#How long, in milliseconds, a socket may stay inactive before an operation on it fails. Defaults to 45000 if unset. */
MONGO_SOCKET_TIMEOUT_MS=
#How long, in milliseconds, the driver waits for a suitable server before failing an operation. Defaults to 10000 if unset. */
MONGO_SERVER_SELECTION_TIMEOUT_MS=
#The maximum time in milliseconds that a thread can wait for a connection to become available. */
MONGO_WAIT_QUEUE_TIMEOUT_MS=
```

- [ ] **Step 6: Run the full `api/db` test suite to check for regressions**

Run: `cd api && npx jest db/`
Expected: PASS — `connect.spec.js`, `index.spec.js`, `indexSync.spec.js`, `utils.spec.js` all green.

- [ ] **Step 7: Commit**

```bash
git add api/db/connect.js api/db/connect.spec.js .env.example
git commit -m "$(cat <<'EOF'
feat: add Mongo connection resilience defaults

Extract buildMongoConnectionOptions() as a pure, unit-tested function
and give maxIdleTimeMS/heartbeatFrequencyMS/socketTimeoutMS/
serverSelectionTimeoutMS sane defaults instead of leaving them unset,
so idle pooled connections get recycled before a network intermediary
silently drops them, and replica-set failover timeouts fit a small
deployment.
EOF
)"
```

---

### Task 2: Log connection state transitions (disconnected/reconnected/close)

**Files:**
- Modify: `api/db/connect.js`
- Test: `api/db/connect.spec.js` (append to the file created in Task 1)

**Interfaces:**
- Consumes: nothing from Task 1 beyond the existing `mongoose.connection` singleton and `logger` already imported in `api/db/connect.js`.
- Produces: no new exports. Purely adds listeners as a module-load side effect, matching the existing `error` listener already in the file.

**Amendment (ratified, see spec doc):** implementing this task's own Step 1 test (`expect(conn.readyState).toBe(1)`) surfaced a pre-existing bug — `connectDb()` cached the `mongoose` module into `cached.conn`, which has no `_readyState`, so the cache-hit branch could never trigger. `connectDb()`'s `mongoose.connect(...).then((mongoose) => { return mongoose; })` is amended to `return mongoose.connection;` as part of this task. This was flagged as a plan-conflicting change by the task reviewer and explicitly ratified by the project owner — no caller in the codebase relied on the old return value.

- [ ] **Step 1: Write the failing tests**

Append to `api/db/connect.spec.js` (add these requires at the top of the file, above the existing `buildMongoConnectionOptions` describe block):

```js
const { MongoMemoryServer } = require('mongodb-memory-server');
```

Then add this new `describe` block at the end of the file:

```js
describe('connectDb connection event listeners', () => {
  let mongoServer;
  let mongoose;
  let logger;
  let connectDb;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongoServer.getUri();

    jest.resetModules();
    mongoose = require('mongoose');
    ({ logger } = require('@librechat/data-schemas'));
    ({ connectDb } = require('./connect'));
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('connectDb establishes a real connection using the tuned options', async () => {
    const conn = await connectDb();
    expect(conn.readyState).toBe(1);
  });

  test('logs a warning when the connection emits "disconnected"', () => {
    mongoose.connection.emit('disconnected');
    expect(logger.warn).toHaveBeenCalledWith(
      '[connectDb] MongoDB connection lost (disconnected)',
    );
  });

  test('logs info when the connection emits "reconnected"', () => {
    mongoose.connection.emit('reconnected');
    expect(logger.info).toHaveBeenCalledWith(
      '[connectDb] MongoDB connection restored (reconnected)',
    );
  });

  test('logs a warning when the connection emits "close"', () => {
    mongoose.connection.emit('close');
    expect(logger.warn).toHaveBeenCalledWith('[connectDb] MongoDB connection closed');
  });
});
```

The `jest.resetModules()` + fresh `require()` of `mongoose`, `@librechat/data-schemas`, and `./connect` inside `beforeAll` is required: `api/db/connect.js` reads `process.env.MONGO_URI` into a module-level `const` at require time, and the file's top-level code (including the listeners under test) attaches to whichever `mongoose.connection` instance was live in that require call. Setting `process.env.MONGO_URI` before a fresh require ensures `connectDb()` targets the in-memory server, and re-requiring `mongoose` in the same registry generation ensures the test's `mongoose.connection` reference is the exact same object the listeners were attached to.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd api && npx jest db/connect.spec.js -t "connection event listeners"`
Expected: FAIL — no `disconnected`/`reconnected`/`close` listeners are registered yet, so `logger.warn`/`logger.info` are never called with those messages.

- [ ] **Step 3: Add the listeners in `api/db/connect.js`**

Modify the existing listener block:

```js
mongoose.connection.on('error', (err) => {
  logger.error('[connectDb] MongoDB connection error:', err);
});
```

to:

```js
mongoose.connection.on('error', (err) => {
  logger.error('[connectDb] MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  logger.warn('[connectDb] MongoDB connection lost (disconnected)');
});

mongoose.connection.on('reconnected', () => {
  logger.info('[connectDb] MongoDB connection restored (reconnected)');
});

mongoose.connection.on('close', () => {
  logger.warn('[connectDb] MongoDB connection closed');
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd api && npx jest db/connect.spec.js`
Expected: PASS — all tests from both describe blocks green (10 total).

- [ ] **Step 5: Run the full `api` test suite to check for regressions**

Run: `cd api && npx jest`
Expected: PASS — no test elsewhere depends on `mongoose.connection` having exactly one listener per event.

- [ ] **Step 6: Commit**

```bash
git add api/db/connect.js api/db/connect.spec.js
git commit -m "$(cat <<'EOF'
feat: log Mongo connection state transitions

Add disconnected/reconnected/close listeners alongside the existing
error listener, so a future incident (replica set election, node
restart, silently dropped idle connection) can be correlated against
timestamps in the logs instead of only surfacing as an unexplained
"unknown error" to end users.
EOF
)"
```

---

## Post-implementation

- [ ] Push the branch and open the PR: `git push -u origin feature/mongo-connection-resilience`, then `gh pr create` targeting `danny-avila:main`, describing the two contributing failure modes from the spec and linking `docs/superpowers/specs/2026-08-01-mongo-connection-resilience-design.md`.
