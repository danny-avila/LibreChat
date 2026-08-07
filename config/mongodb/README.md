# MongoDB replica-set deployment

LibreChat's default Docker Compose stacks run MongoDB as the one-member replica set `rs0`. The
`mongodb-init` service initializes a new or existing `data-node` volume idempotently, waits for a
writable primary, and then exits. The API waits for that initializer, while the MongoDB health check
independently reports primary status with enough time for both the connection and election windows.
Use Docker Compose v2.20 or newer; the startup contract relies on long-form `depends_on` with
`service_completed_successfully`. The legacy `docker-compose` command is not supported.

This one-member set provides the transaction semantics required by MCP authority, but it is not
highly available. Losing or restarting its only member makes MongoDB unavailable until that member
returns and becomes primary again.

## Connection URI

The Compose API uses:

```text
mongodb://mongodb:27017/LibreChat?replicaSet=rs0
```

Keep `replicaSet=rs0` when connecting to the bundled MongoDB service. External MongoDB Atlas,
DocumentDB, and managed Mongo-compatible deployments should use their provider-issued URI rather
than this local replica-set name. MCP authority can be enabled only when that deployment supports
sessions and primary snapshot transactions; the capability probe reports an unsupported state
without preventing the rest of LibreChat from starting.

For an external deployment, set `MONGO_URI` in `.env` and start Compose with the maintained
override:

```bash
docker compose \
  -f docker-compose.yml \
  -f config/mongodb/external-compose.override.yml \
  up -d
```

Use `deploy-compose.yml` in place of `docker-compose.yml` for the split API/client deployment.
The override disables the bundled health check and replaces both local MongoDB services with
successful one-shot placeholders from a digest-pinned amd64/arm64 image, so the API never waits for
a local primary. An empty `MONGO_URI` still causes the API to reject startup, but it does not prevent
administrative commands such as `docker compose pull` or `docker compose down`; set the URI before
starting the API.

Previously working amd64 installations that still use the formerly documented inline `tianon/true`
external-Mongo override remain bootable: the initializer recognizes a non-bundled `MONGO_URI` and
exits without contacting the placeholder, and the API does not gate on the placeholder's inherited
health check. The old image is amd64-only. Migrate to the maintained override above, especially on
arm64; it pins an amd64/arm64 no-op image and disables the irrelevant local health check explicitly.

Older x86 CPUs without AVX can retain MongoDB 4.4 with:

```bash
docker compose \
  -f docker-compose.yml \
  -f config/mongodb/legacy-compose.override.yml \
  up -d
```

The shared health check automatically uses the legacy `mongo` shell when `mongosh` is unavailable.

## Network and authentication boundary

The bundled one-member replica set intentionally retains `--noauth` and is supported only on the
private Compose network with no published MongoDB port. Do not expose it to an untrusted network.
An authentication-enabled replica set requires keyfile or X.509 member authentication, persistent
credentials, and a credential-aware initialization procedure; that topology is not supported by
this initializer. Use a managed deployment or a separately operated secured replica set instead.

If you temporarily publish the example host port `27018` for diagnostics, connect directly so the
host client does not try to resolve the internal member name:

```text
mongodb://127.0.0.1:27018/LibreChat?directConnection=true
```

The in-network application URI with `replicaSet=rs0` is not a host-diagnostic URI unless the host
machine can resolve `mongodb` to the container.

## New and existing volumes

For a new installation, run `docker compose up -d` normally. For an existing standalone
`data-node` volume:

1. Take a backup. Use `mongodump` for a live backup. For a raw filesystem copy, first run
   `docker compose down` and wait for MongoDB's clean shutdown; copying live WiredTiger files is not
   a valid backup.
2. Pull the updated repository and images.
3. Run `docker compose up -d`.
4. Confirm `docker compose ps mongodb mongodb-init` shows MongoDB healthy and the initializer exited
   with status 0.

Starting the existing data files with `--replSet rs0` preserves application collections. The
initializer adds the replica-set configuration to MongoDB's `local` database; it does not copy,
rewrite, or delete LibreChat data. Re-running the initializer is safe because it calls
`rs.initiate()` only when MongoDB reports `NotYetInitialized`.

## Health and readiness

The MongoDB container is healthy only while the server reports itself as the writable primary. Its
five-minute health budget covers the initializer's connection and primary-election deadlines. The
initializer also validates the configured set name and waits up to two minutes for primary election.
A failed election, a conflicting existing replica-set configuration, or an unavailable database
leaves the API stopped instead of silently connecting without replica-set semantics.

MCP authority exposes a separate, read-only snapshot-transaction capability check. Call it after
base role seeding. It starts a primary transaction with snapshot read concern, reads the existing
`roles` collection, and commits with majority write concern. This proves transaction semantics; it
does not prove that MCP authority collections or indexes have been migrated. The MCP integration
must verify those separately before enabling authority-dependent work. Standalone MongoDB is
reported as `snapshot_transactions_unavailable`; no weaker read mode is used. A failed result also
includes `retryable`: election, network, and not-yet-seeded failures can be reprobed with a bounded
caller policy, while an unsupported topology is non-retryable.

## Helm deployments

This change does not alter the Bitnami MongoDB topology used by the LibreChat Helm chart. Changing
that chart in place can rename StatefulSet/PVC resources and requires careful preservation of the
root password and replica-set key. Helm installations that need MCP authority should first migrate
to an external or managed Mongo-compatible deployment with primary snapshot-transaction capability
and use its provider-issued URI. A chart-native topology migration requires a separate major
upgrade procedure.

## Rollback

Stop the stack before rolling back. The safest rollback is to restore the pre-upgrade `data-node`
backup together with the previous Compose files. MongoDB can also read the same application data
when restarted without `--replSet`; remove `replicaSet=rs0` from the API URI at the same time. The
replica-set metadata remains in the `local` database but is ignored in standalone mode. Do not run
`rs.remove()` on the only member: it cannot provide a safer rollback and can leave the deployment
without a primary.
