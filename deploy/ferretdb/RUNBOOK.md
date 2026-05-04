# Production Runbook

This runbook assumes a single Linux primary host, plain Docker Compose, an upstream auth gateway that assigns tenants, and LibreChat storing chat/application records through FerretDB into PostgreSQL with the DocumentDB extension.

Use `PRODUCTION_READINESS.md` as the pass/fail launch sign-off artifact. This runbook explains the procedures; the readiness checklist records whether the commercial launch gates passed.

```mermaid
flowchart LR
  Client["Browser clients"] --> AuthGateway["Auth gateway"]
  AuthGateway --> TenantGateway["LibreChat tenant gateway"]
  TenantGateway --> API["LibreChat API"]
  API --> FerretDB["FerretDB"]
  FerretDB --> DocumentDB["PostgreSQL + DocumentDB"]
  API --> Valkey["Valkey (Redis protocol)"]
  API --> Meili["Meilisearch"]
  API -.-> RAG["Optional RAG API"]
  RAG --> VectorDB["pgvector PostgreSQL"]
  API --> ObjectStore["S3-compatible object store"]
```

## Host Layout

- Repository checkout: `/opt/librechat`
- Env file: `/opt/librechat/deploy/ferretdb/.env`
- Backup root: `/srv/librechat/backups`
- Public ingress: your auth gateway only
- LibreChat bind address: keep `LIBRECHAT_BIND_ADDRESS=127.0.0.1` unless host firewalling guarantees only the auth gateway can reach the tenant gateway.

Do not expose `documentdb`, `ferretdb`, `redis`, `meilisearch`, optional `vectordb`, or object-store admin ports to public networks. The `redis` compose service runs Valkey and keeps the Redis-protocol service name for application compatibility.

## Object Store Decision

The base compose stack includes MinIO because LibreChat already supports S3-compatible object storage, but the recommended no-AGPL production path for this deployment is SeaweedFS through `deploy-compose.ferretdb.seaweedfs.yml`. SeaweedFS identifies as Apache-2.0 and provides an S3-compatible gateway.

MinIO is not MIT or Apache-2.0. MinIO documents current community MinIO as AGPLv3 and points commercial/proprietary production use toward AIStor/commercial licensing:

- https://github.com/minio/minio
- https://www.min.io/legal/customer-license-and-subscription-agreement

Production choices:

- **SeaweedFS internal object store**: use `deploy-compose.ferretdb.seaweedfs.yml` and merge `deploy/ferretdb/.env.seaweedfs.example` into `.env`.
- **MinIO commercial license**: use `deploy-compose.ferretdb.yml` as-is after commercial licensing is approved.
- **External S3-compatible backend**: use `deploy-compose.ferretdb.external-s3.yml` and do not run MinIO containers. Candidate backends still need your own legal and operational review. SeaweedFS identifies as Apache-licensed and provides an S3 gateway; Ceph documents source licensing as LGPL2.1/LGPL3.0 and provides RGW S3.

SeaweedFS deployment command shape:

```bash
docker compose \
  --env-file deploy/ferretdb/.env \
  -f deploy-compose.ferretdb.yml \
  -f deploy-compose.ferretdb.seaweedfs.yml \
  up -d
```

External S3 deployment command shape:

```bash
docker compose \
  --env-file deploy/ferretdb/.env \
  -f deploy-compose.ferretdb.yml \
  -f deploy-compose.ferretdb.external-s3.yml \
  up -d
```

When using external S3, merge `deploy/ferretdb/.env.external-s3.example` into `.env`, create the bucket before first boot, and back up that object store with its native backup mechanism.

## RAG Decision

RAG is disabled by default for the no-unknown-license commercial path. The base stack does not run `rag_api` or `vectordb`, and LibreChat falls back to native parsing when `RAG_API_URL` is absent.

To enable RAG:

1. Set `RAG_ENABLED=true`.
2. Append `deploy-compose.ferretdb.rag.yml` to `COMPOSE_FILES` after the object-store override.
3. Pin `RAG_API_IMAGE` and `PGVECTOR_IMAGE` by digest.
4. Fill `RAG_API_SOURCE_URL`, `RAG_API_SOURCE_REF`, and `RAG_API_SOURCE_LICENSE`.
5. Set `RAG_API_LICENSE_REVIEWED=true` only after source, notices, image build provenance, and redistribution rights are reviewed.

Command shape with SeaweedFS plus RAG:

```bash
docker compose \
  --env-file deploy/ferretdb/.env \
  -f deploy-compose.ferretdb.yml \
  -f deploy-compose.ferretdb.seaweedfs.yml \
  -f deploy-compose.ferretdb.rag.yml \
  up -d
```

## Cache Decision

The compose service is named `redis` because LibreChat expects `redis://redis:6379`, but it runs Valkey. Redis Community Edition 7.4+ is RSALv2/SSPLv1, while Valkey documents BSD-3-Clause licensing:

- https://redis.io/legal/licenses/
- https://valkey.io/topics/license/

For a fresh production deployment, start directly on Valkey. If you are migrating an existing Redis 7.4+ volume, do not reuse its AOF/RDB files directly; Valkey 8.1 cannot read Redis 7.4 RDB format 12. Quiesce the app, drain pending stream work, and either reset `redis_data` or run a separately tested export/import path.

## Env And Image Pins

Start from:

- `deploy/ferretdb/.env.example`
- `deploy/ferretdb/images.linux-amd64.env`
- `deploy/ferretdb/.env.seaweedfs.example`, when using internal SeaweedFS
- `deploy/ferretdb/.env.external-s3.example`, only if using external S3
- `deploy/ferretdb/.env.rag.example`, only after RAG source/license/provenance review

Generate a fresh SeaweedFS/Valkey production env file:

```bash
DOMAIN_SERVER=https://chat.yourdomain.tld \
DOMAIN_CLIENT=https://chat.yourdomain.tld \
OBJECT_STORE_MODE=seaweedfs \
deploy/ferretdb/bin/generate-env.sh
```

The generator creates `deploy/ferretdb/.env`, copies `librechat.yaml` from the production example if it is missing, uses `deploy/ferretdb/images.linux-amd64.env` for pinned image refs, and writes random secrets with file mode `0600`.

Before production start, review `.env` and set real provider credentials. Leave `RAG_ENABLED=false` for the default commercial stack. If you enable RAG, complete the RAG source/license review fields first. Validate the result:

```bash
deploy/ferretdb/bin/validate-env.sh
```

Regenerate image pins for a deliberate upgrade:

```bash
nix develop -c deploy/ferretdb/bin/pin-images.sh linux amd64 > /tmp/images.linux-amd64.env
```

Review release notes, update `.env`, run the compatibility harness and DR drill in staging, then roll the pins to production.

## First Boot

After generating and reviewing `/opt/librechat/deploy/ferretdb/.env`, use the host bootstrap script for the SeaweedFS production path:

```bash
cd /opt/librechat
COMPOSE_PROJECT_NAME=librechat-ferretdb \
ENV_FILE=/opt/librechat/deploy/ferretdb/.env \
COMPOSE_FILES=/opt/librechat/deploy-compose.ferretdb.yml,/opt/librechat/deploy-compose.ferretdb.seaweedfs.yml \
BACKUP_ROOT=/srv/librechat/backups \
TENANT_GATEWAY_URL=http://127.0.0.1:3080 \
npm run host:bootstrap
```

The bootstrap script:

- validates the production env;
- renders Docker Compose config into `artifacts/bootstrap-host/<timestamp>/`;
- builds the LibreChat API image;
- installs rendered SeaweedFS systemd units;
- starts/enables the stack, backup timer, healthcheck timer, and backup-shipping timer when configured;
- runs an initial healthcheck, first backup, backup freshness check, optional backup-shipping dry-run, and release evidence generation.

Preview the commands and rendered systemd units without changing the host:

```bash
BOOTSTRAP_DRY_RUN=true npm run host:bootstrap
```

If you need to boot manually instead, use the commands below:

```bash
cd /opt/librechat
deploy/ferretdb/bin/validate-env.sh
docker compose --env-file deploy/ferretdb/.env -f deploy-compose.ferretdb.yml -f deploy-compose.ferretdb.seaweedfs.yml config >/tmp/librechat-compose.yml
docker compose --env-file deploy/ferretdb/.env -f deploy-compose.ferretdb.yml -f deploy-compose.ferretdb.seaweedfs.yml build api
docker compose --env-file deploy/ferretdb/.env -f deploy-compose.ferretdb.yml -f deploy-compose.ferretdb.seaweedfs.yml up -d
docker compose --env-file deploy/ferretdb/.env -f deploy-compose.ferretdb.yml -f deploy-compose.ferretdb.seaweedfs.yml ps
```

Run the gateway smoke test after first boot and after any auth-gateway change:

```bash
TENANT_GATEWAY_URL=http://127.0.0.1:3080 npm run smoke:tenant-gateway
```

The auth gateway must set `X-Auth-Tenant-Id`. Browser clients must not be able to set or spoof that header on the path to LibreChat.

## Auth Gateway

Reference configs live in `deploy/ferretdb/auth-gateway/`:

- `nginx-auth-gateway.conf.template`
- `Caddyfile.example`
- `traefik-dynamic.yml.example`

All examples assume a separate auth service verifies the user and returns `X-Auth-Tenant-Id` as a response header to the public gateway. The public gateway must strip client-supplied `X-Tenant-Id` and `X-Auth-Tenant-Id`, copy only the auth service's `X-Auth-Tenant-Id`, and proxy to the local tenant gateway at `http://127.0.0.1:3080`.

Run public conformance checks after deployment:

```bash
AUTH_GATEWAY_URL=https://chat.yourdomain.tld \
AUTH_GATEWAY_VALID_HEADERS_JSON='{"Cookie":"session=replace-with-valid-session"}' \
npm run smoke:auth-gateway
```

If the auth gateway redirects unauthenticated users instead of returning `401` or `403`, keep the default `AUTH_GATEWAY_EXPECT_UNAUTH_STATUSES=401,403,302`. If your auth layer uses bearer tokens, pass them as JSON:

```bash
AUTH_GATEWAY_URL=https://chat.yourdomain.tld \
AUTH_GATEWAY_VALID_HEADERS_JSON='{"Authorization":"Bearer replace-with-valid-token"}' \
npm run smoke:auth-gateway
```

The public conformance test verifies spoofed tenant headers do not bypass authentication. It cannot prove the auth service selected the correct tenant unless your auth layer exposes a tenant-specific diagnostic or you run application-level two-tenant tests with real sessions.

## Systemd

Install the sample units after adjusting `/opt/librechat` if needed:

```bash
sudo cp deploy/ferretdb/systemd/librechat-ferretdb-seaweedfs.service /etc/systemd/system/
sudo cp deploy/ferretdb/systemd/librechat-ferretdb-seaweedfs-backup.service /etc/systemd/system/
sudo cp deploy/ferretdb/systemd/librechat-ferretdb-seaweedfs-backup.timer /etc/systemd/system/
sudo cp deploy/ferretdb/systemd/librechat-ferretdb-seaweedfs-healthcheck.service /etc/systemd/system/
sudo cp deploy/ferretdb/systemd/librechat-ferretdb-seaweedfs-healthcheck.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now librechat-ferretdb-seaweedfs.service
sudo systemctl enable --now librechat-ferretdb-seaweedfs-backup.timer
sudo systemctl enable --now librechat-ferretdb-seaweedfs-healthcheck.timer
```

Use the non-SeaweedFS units only when MinIO has been commercially approved.

Both compose stack units run `deploy/ferretdb/bin/validate-env.sh` as `ExecStartPre`. Systemd will refuse to start the stack while placeholder domains/secrets remain, images are not digest pinned, MinIO lacks commercial-license confirmation, Redis 7.4+ is configured instead of Valkey, or the RAG override is enabled without completed RAG source/license review metadata.

## Backups

The included backup script captures:

- DocumentDB physical `pg_basebackup` plus globals
- RAG pgvector logical dump plus globals, only when `RAG_ENABLED=true`
- SeaweedFS data-volume tarball, when using internal SeaweedFS
- MinIO bucket mirror, when using commercially approved internal MinIO
- Meilisearch data tarball
- Valkey data tarball
- Deployment config snapshot and redacted env snapshot

SeaweedFS backups briefly stop gateway, API, SeaweedFS init, and SeaweedFS while taking the physical object-store snapshot. DocumentDB, optional RAG, Valkey, and Meilisearch remain online during their backup steps.

Run manually:

```bash
COMPOSE_PROJECT_NAME=librechat-ferretdb \
ENV_FILE=/opt/librechat/deploy/ferretdb/.env \
COMPOSE_FILES=/opt/librechat/deploy-compose.ferretdb.yml,/opt/librechat/deploy-compose.ferretdb.seaweedfs.yml \
BACKUP_ROOT=/srv/librechat/backups \
BACKUP_RETENTION_DAYS=14 \
/opt/librechat/deploy/ferretdb/bin/backup.sh
```

Ship backup archives and `.sha256` files off-host. Encrypt backups at rest. If you need lower RPO than daily full backups, add PostgreSQL WAL archiving or pgBackRest for the DocumentDB service and test point-in-time recovery separately.

Configure rclone backup shipping:

```bash
cp deploy/ferretdb/.env.backup-shipping.example deploy/ferretdb/.env.backup-shipping
$EDITOR deploy/ferretdb/.env.backup-shipping
COMPOSE_PROJECT_NAME=librechat-ferretdb \
ENV_FILE=/opt/librechat/deploy/ferretdb/.env \
BACKUP_ROOT=/srv/librechat/backups \
/opt/librechat/deploy/ferretdb/bin/ship-backups.sh
```

After the first successful manual shipping run, install and enable the optional shipping timer:

```bash
sudo cp deploy/ferretdb/systemd/librechat-ferretdb-ship-backups.service /etc/systemd/system/
sudo cp deploy/ferretdb/systemd/librechat-ferretdb-ship-backups.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now librechat-ferretdb-ship-backups.timer
```

## Restore

Restores are destructive:

```bash
COMPOSE_PROJECT_NAME=librechat-ferretdb \
ENV_FILE=/opt/librechat/deploy/ferretdb/.env \
COMPOSE_FILES=/opt/librechat/deploy-compose.ferretdb.yml,/opt/librechat/deploy-compose.ferretdb.seaweedfs.yml \
RESTORE_CONFIRM=I_UNDERSTAND_THIS_REPLACES_DATA \
/opt/librechat/deploy/ferretdb/bin/restore.sh /srv/librechat/backups/20260504T120000Z.tar.gz
```

Restore with the same `postgres-documentdb` image version that created the backup. Upgrade recovery should be tested as a separate procedure.

## DR Drill

Run drills against staging, not production:

```bash
COMPOSE_PROJECT_NAME=librechat-ferretdb-staging \
ENV_FILE=/tmp/librechat-ferretdb-staging.env \
COMPOSE_FILES=/opt/librechat/deploy-compose.ferretdb.yml,/opt/librechat/deploy-compose.ferretdb.seaweedfs.yml \
DRILL_CONFIRM=I_UNDERSTAND_THIS_REPLACES_DATA \
DRILL_ROOT=/tmp/librechat-ferretdb-drill \
/opt/librechat/deploy/ferretdb/bin/drill.sh
```

The drill seeds sentinel data into DocumentDB, the configured internal object store, Meilisearch, and RAG PostgreSQL when enabled; backs up; deletes the sentinels; restores; verifies sentinels; and runs the tenant-gateway smoke test.

## Monitoring

Minimum checks:

- `docker compose ps` has no unhealthy services.
- `GET /health` on the API succeeds through the tenant gateway with a valid auth-gateway tenant header.
- Last successful backup age is below your RPO.
- DocumentDB, SeaweedFS/object store, Meilisearch, Valkey, optional RAG PostgreSQL, and Docker volume disk usage stay below alert thresholds.
- API logs have no repeated FerretDB `InternalError`, tenant isolation strict-mode errors, or auth-gateway header rejections beyond expected unauthenticated probes.
- DocumentDB backup archive size is non-zero and restore drill passes on a fresh staging stack.

Host-local healthcheck command:

```bash
COMPOSE_PROJECT_NAME=librechat-ferretdb \
ENV_FILE=/opt/librechat/deploy/ferretdb/.env \
COMPOSE_FILES=/opt/librechat/deploy-compose.ferretdb.yml,/opt/librechat/deploy-compose.ferretdb.seaweedfs.yml \
BACKUP_ROOT=/srv/librechat/backups \
BACKUP_MAX_AGE_HOURS=30 \
DISK_WARN_PERCENT=85 \
/opt/librechat/deploy/ferretdb/bin/healthcheck.sh
```

Systemd marks `librechat-ferretdb-seaweedfs-healthcheck.service` failed if any required service is down, the tenant gateway `/health` endpoint cannot be reached with a trusted tenant header, the newest backup is stale, or disk usage is above the configured threshold. Wire that failed unit state into your host monitoring.

## License Audit

Generate the release license inventory:

```bash
LICENSE_AUDIT_DIR=/srv/librechat/license-audit npm run license:audit
```

The audit explicitly lists every workspace package, npm dependency, and deployment/runtime callout that is not `MIT` or `Apache-2.0`. It also flags missing npm license metadata, the repo-level `LICENSE` versus package-manifest license mismatch, MinIO AGPL/commercial risk, Redis 7.4+ RSALv2/SSPLv1 avoidance through Valkey, proprietary optional font references, and optional RAG image licensing/provenance that needs final review before RAG is enabled.

## Release Evidence

Run the full evidence bundle before first production launch and before planned upgrades:

```bash
COMPOSE_PROJECT_NAME=librechat-ferretdb \
ENV_FILE=/opt/librechat/deploy/ferretdb/.env \
COMPOSE_FILES=/opt/librechat/deploy-compose.ferretdb.yml,/opt/librechat/deploy-compose.ferretdb.seaweedfs.yml \
BACKUP_ROOT=/srv/librechat/backups \
TENANT_GATEWAY_URL=http://127.0.0.1:3080 \
AUTH_GATEWAY_URL=https://chat.yourdomain.tld \
AUTH_GATEWAY_VALID_HEADERS_JSON='{"Cookie":"session=replace-with-valid-session"}' \
RELEASE_EVIDENCE_REQUIRE_AUTH_GATEWAY=true \
RELEASE_EVIDENCE_REQUIRE_BACKUP_SHIPPING=true \
EVIDENCE_ROOT=/srv/librechat/release-evidence \
npm run release:evidence
```

The evidence runner writes `summary.json`, `summary.md`, step logs, redacted environment and compose snapshots, and a fresh license audit under the selected evidence directory. It exits `0` for `GO`, `1` for `NO-GO`, and `2` for `INCOMPLETE`.

Required checks by default:

- Production env validation.
- Docker Compose render and service listing.
- FerretDB/DocumentDB compatibility harness against a disposable `LibreChatCompat` database.
- Host healthcheck, including backup freshness.
- Tenant gateway smoke test.
- License audit generation.

Public auth-gateway conformance and backup-shipping dry-run are automatic when their environment is configured. For production sign-off, require both with `RELEASE_EVIDENCE_REQUIRE_AUTH_GATEWAY=true` and `RELEASE_EVIDENCE_REQUIRE_BACKUP_SHIPPING=true`.

## Upgrade And Rollback

Upgrade flow:

1. Regenerate image pins in staging.
2. Build the new LibreChat API image.
3. Run `npm run db:compat:ferretdb` against staging FerretDB.
4. Run `deploy/ferretdb/bin/drill.sh` against staging.
5. Apply image/env changes to production.
6. Run tenant-gateway smoke and watch service logs.

Rollback flow:

1. Revert `.env` image pins to the previous known-good values.
2. Rebuild or retag the previous LibreChat API image if needed.
3. Restart compose.
4. If data changed incompatibly, restore the last known-good backup archive.

## Public Cutover

Cutover sequence:

1. Keep `LIBRECHAT_BIND_ADDRESS=127.0.0.1` and start the Compose stack.
2. Run `TENANT_GATEWAY_URL=http://127.0.0.1:3080 npm run smoke:tenant-gateway` on the host.
3. Install one public auth-gateway config and verify TLS.
4. Confirm the auth service returns `X-Auth-Tenant-Id` only after authentication.
5. Point DNS at the public auth gateway.
6. Run `npm run smoke:auth-gateway` against the public URL with one valid session or bearer token.
7. Run `deploy/ferretdb/bin/healthcheck.sh`.

Cutover rollback:

1. Repoint DNS or load balancer back to the previous service.
2. Stop the public auth-gateway listener.
3. Keep the internal Compose stack running while investigating unless data integrity is in question.
4. If the new stack wrote incompatible data, restore the last known-good backup and rerun the DR drill in staging before another cutover attempt.

## Go-Live Checklist

- Object-store license decision is documented.
- `RAG_ENABLED=false`, or RAG source/license/provenance review is documented and `deploy-compose.ferretdb.rag.yml` is included intentionally.
- `.env` contains digest-pinned production image refs.
- `deploy/ferretdb/bin/validate-env.sh` passes with production values.
- Auth gateway is the only source of `X-Auth-Tenant-Id`.
- `npm run smoke:auth-gateway` passes against the public URL with a valid auth session.
- Public firewall exposes only the intended ingress.
- Backups run from systemd timer and ship off-host.
- A staging DR drill has passed using the same image set.
- Monitoring covers service health, disk, backup freshness, and tenant-gateway smoke.
- `npm run license:audit` output has been reviewed and archived for the release.
- Rollback image pins and last known-good backup archive are available.
