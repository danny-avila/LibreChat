# Upgrading LibreChat

## Redis streaming now coalesces deltas by default

Redis-backed streams now batch model and tool-argument deltas in a **25 ms**
window when `STREAM_DELTA_COALESCE_MS` is unset. Explicit `0` keeps per-delta
publication; existing explicit values retain their behavior. In-memory streams
are unchanged, including deployments using `USE_REDIS_STREAMS=false`.

The same window batches durable appends and publications. It reduces Redis
operations at the cost of up to one window of buffering latency and possible loss
of unflushed deltas on process crash. Terminal and non-coalescable barriers still
flush pending batches before proceeding.

**Rolling upgrades from builds without batch-frame support:** older subscribers
silently drop `chunk_batch` frames. Before introducing this default, configure
`STREAM_DELTA_COALESCE_MS=0` on every API replica and restart them with that setting.
Keep it set throughout the upgrade. Once every replica supports batch frames
(introduced in #14614), remove the override and restart to use the 25 ms default.
A mixed deployment of batch-capable builds can receive batches even if some
replicas still publish per delta.

**Rollback to a build without batch-frame support:** first set
`STREAM_DELTA_COALESCE_MS=0` on every replica and restart all publishers with it;
only then introduce the older build. Keep `0` set throughout the rollback.

## Tenant index migration (v0.8.7 and earlier databases)

Upgrading an existing database can log `Index build failed` for User, Role,
Preset, AccessRole, MCPServer, AgentCategory, Message, or Conversation. Older
unique indexes (for example `email_1` or `name_1`) conflict with current non-unique
indexes of the same name. Tenant-scoped compound indexes now enforce uniqueness.
This also affects single-tenant deployments. See #15759 (successor to #14826).

The tenant-index migration is an explicit maintenance command; startup does not
run it automatically. Use the updated code/image containing this command. For a
source checkout, install dependencies and build the packages first (`npm run
build:packages`).

1. Back up MongoDB and stop all LibreChat API replicas and workers that write to
   the database. Keep MongoDB available throughout the migration.
2. Preview known legacy unique indexes using the deployment's `MONGO_URI` and
   connection settings from `.env`:

   ```sh
   npm run migrate:tenant-indexes:dry-run
   ```

3. Apply the migration:

   ```sh
   npm run migrate:tenant-indexes
   ```

   With Docker Compose, stop the API and run a one-off container from the updated
   image while MongoDB remains running. Use the same Compose file flags as your
   deployment (for example, `docker compose -f deploy-compose.yml`). Set the
   working directory to `/app`, where the root npm scripts live; the production
   API image otherwise defaults to `/app/api`:

   ```sh
   docker compose stop api
   docker compose run --rm --no-deps -w /app api npm run migrate:tenant-indexes:dry-run
   docker compose run --rm --no-deps -w /app api npm run migrate:tenant-indexes
   docker compose up -d api
   ```

4. Restart writers only after the command exits successfully (status 0). Verify
   that startup no longer reports these index conflicts.

The command first builds tenant-scoped unique indexes, then drops only known
superseded unique indexes, and explicitly creates current schema indexes for the
affected collections. It preserves custom indexes and current non-unique indexes;
it does not delete documents or use `syncIndexes`/`dropIndexes`. Automatic index
creation is disabled in the maintenance process to prevent races, even when the
server normally enables it. Current indexes are explicitly built even if the
server uses `MONGO_AUTO_INDEX=false`.

The dry run only lists removals: it does not validate replacement builds, database
permissions, or duplicate data. Any listing, dropping, or building error makes
the apply command fail. If replacement creation fails (for example due to
existing duplicates or unsupported database index options), no old constraints
have been dropped. Keep writers stopped, correct the reported problem, and rerun.
A later failure can leave a partial migration; rerunning safely completes it.
Index builds may take time on large collections. Do not drop all indexes to
resolve a failure.
