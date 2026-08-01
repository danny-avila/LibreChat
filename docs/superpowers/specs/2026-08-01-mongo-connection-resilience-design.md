# Mongo Connection Resilience — Design

## Problem

On small Kubernetes deployments, users occasionally hit "An unknown error occurred"
during OIDC login after a period of low activity (frequently reported the morning
after a quiet night). Two contributing failure modes were identified by code
investigation:

1. **Idle pooled connections silently killed by network intermediaries.** LibreChat's
   Mongo connection pool has no default idle-connection recycling
   (`MONGO_MAX_IDLE_TIME_MS` exists as an env var in `api/db/connect.js` but defaults
   to `undefined`, i.e. no idle timeout). Connections that sit unused overnight are
   prime targets for silent eviction by load balancers, NAT gateways, or firewalls
   with idle-connection timeouts shorter than MongoDB's own defaults. The driver's
   SDAM heartbeat socket stays alive (masking the problem via
   `mongoose.connection.readyState`), but a pooled application connection can be
   dead without anything noticing until the next query uses it.
2. **Replica set events (elections, member restarts, network blips).** With no tuned
   `serverSelectionTimeoutMS`/`heartbeatFrequencyMS`/`socketTimeoutMS`, the driver
   falls back to defaults that are not well matched to a small, single-region k8s
   deployment, and there's no operational visibility (only a `mongoose.connection`
   `error` listener exists — no `disconnected`/`reconnected`/`close` logging) to
   confirm when/why this happens.

Both theories are considered valid and complementary; this PR hardens the
connection layer against both without changing application-level error handling.

## Scope

**In scope:** `api/db/connect.js` — connection option construction and connection
event observability.

**Out of scope (future PRs):** Kubernetes `/health`/`/readyz` reflecting live Mongo
state and the Helm chart probe wiring; OIDC callback error handling / retry for
transient Mongo errors. These were identified during investigation but are
independent changes with their own review surface.

**Explicitly not changed:** `bufferCommands` stays `false` (fail-fast on
disconnected state). We are not reintroducing application-level command buffering;
resilience comes from proactively recycling idle connections and tuning driver
timeouts, plus relying on the driver's built-in `retryWrites`/`retryReads`.

## Design

### Components

- **`buildMongoConnectionOptions(env)`** (new, pure function, exported from
  `api/db/connect.js`): takes an env-like object (defaults to `process.env`) and
  returns the mongoose connection options object. Centralizes parsing/defaulting
  for all tunables, including the existing ones (`maxPoolSize`, `minPoolSize`,
  `maxConnecting`, `waitQueueTimeoutMS`, `autoIndex`, `autoCreate`) and the new
  ones below. Invalid values (`NaN` from a bad env var) fall back to the default
  rather than being passed through.
- **`connectDb()`** (existing, modified): calls `buildMongoConnectionOptions()`
  instead of constructing the options object inline. No behavioral change to the
  connection/caching logic itself.
- **Connection event listeners** (new, alongside the existing `error` listener):
  `disconnected`, `reconnected`, `close` on `mongoose.connection`, each logging via
  `logger.warn`/`logger.info` with a consistent `[connectDb]` prefix matching the
  existing `error` listener's style.

### New tunables and defaults

| Env var | Default | Notes |
|---|---|---|
| `MONGO_MAX_IDLE_TIME_MS` | `60000` | Was `undefined` (no recycling). Primary fix for the idle-socket theory. |
| `MONGO_HEARTBEAT_FREQUENCY_MS` | `10000` | Matches current driver default; now explicit and operator-overridable. |
| `MONGO_SOCKET_TIMEOUT_MS` | `45000` | Was unset (driver default: unlimited). Bounds how long a hung socket can block an operation. |
| `MONGO_SERVER_SELECTION_TIMEOUT_MS` | `10000` | Reduced from the driver default of `30000`, so a small/single-region deployment fails and retries faster during an election rather than hanging up to 30s. |

All four follow the existing pattern in the file: `parseInt(process.env.X)` with a
fallback — the difference from today is that the fallback is now a concrete
default instead of `undefined` for these four.

### Data flow

No change to the connection lifecycle: `connectDb()` is still called once at boot
(`api/server/index.js:114`), still caches the connection on `global.mongoose`.
`buildMongoConnectionOptions()` is a pure computation step inserted before
`mongoose.connect()` is called — no new I/O, no new timing behavior beyond the
option values themselves.

### Error handling

No change to how connection or query errors propagate to the application layer —
this stays a "harden the connection" PR, not an "change what users see" PR. The
new event listeners only log; they don't retry and don't throw.

**Amendment (ratified during Task 2 implementation):** implementing the
`disconnected`/`reconnected` integration test surfaced a pre-existing bug in
`connectDb()`: it cached `mongoose` (the module) into `cached.conn`, and
`_readyState` does not exist on that object (only on `mongoose.connection`).
This meant `cached.conn?._readyState === 1` was always `false`, so the "return
cached connection" branch could never trigger — every call reconnected from
scratch instead of reusing the cached connection, which undermines this very
PR's goal of stable, recycled connections. `connectDb()` now resolves
`cached.conn` to `mongoose.connection` instead of `mongoose`. No caller in the
codebase used the old return value as anything other than a readiness check or
discarded it outright (`api/server/index.js:114`,
`api/server/experimental.js:281`), so this is safe. This was flagged by the
task reviewer as a plan-conflicting change and ratified by the project owner
rather than reverted.

### Testing

- **Unit tests for `buildMongoConnectionOptions`** (pure function, no DB needed):
  - Defaults applied when no relevant env vars are set (asserts the four new
    defaults above, plus confirms untouched existing tunables keep their current
    `undefined`-when-unset behavior).
  - Explicit env var overrides are respected for all four new tunables.
  - Invalid/non-numeric env var values (e.g. `MONGO_MAX_IDLE_TIME_MS=abc`) fall
    back to the default rather than producing `NaN` in the options object.
- **Integration test with `mongodb-memory-server`** (real logic over mocks, per
  project convention): start a single-node replica set, connect via `connectDb()`,
  stop the in-memory server, and assert the `disconnected` listener fires; restart
  it and assert `reconnected` fires. This exercises the actual mongoose connection
  event lifecycle rather than mocking `mongoose.connection`.

## Success criteria

- No idle Mongo connection sits in the pool longer than `MONGO_MAX_IDLE_TIME_MS`
  without being proactively recycled.
- Every connection state transition (`error`, `disconnected`, `reconnected`,
  `close`) produces a log line, so a future incident can be correlated against
  Mongo/k8s events without guesswork.
- All new/changed defaults are overridable via env var, consistent with every
  other tunable already in `api/db/connect.js`.
- No behavioral change for deployments that already override these values
  explicitly (defaults only apply when the env var is unset or unparsable).
