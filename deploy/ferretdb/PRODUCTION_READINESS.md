# Production Readiness Checklist

Use this checklist as the launch sign-off artifact for the self-hosted commercial SeaweedFS/FerretDB deployment. It is intentionally pass/fail oriented; keep the generated evidence bundle, license audit, DR drill archive, and gateway conformance logs with this checklist.

Default commercial target:

- MongoDB is not in the runtime path; LibreChat uses FerretDB plus PostgreSQL/DocumentDB.
- Redis Community Edition 7.4+ is not in the runtime path; the `redis` compose service runs Valkey.
- MinIO is not in the default no-AGPL path; SeaweedFS provides internal S3-compatible storage.
- RAG is disabled by default; `deploy-compose.ferretdb.rag.yml` is included only after source/license/provenance review.
- The stack binds to loopback and is reached publicly only through the auth gateway.

## Launch Record

| Field                 | Value       |
| --------------------- | ----------- |
| Release date          |             |
| Git commit            |             |
| Production host       |             |
| Public URL            |             |
| Object store mode     | `seaweedfs` |
| RAG enabled           | `false`     |
| Evidence bundle path  |             |
| License audit path    |             |
| DR drill archive path |             |
| Backup remote         |             |
| Approver              |             |

## Required Gates

Every required gate must be checked before commercial launch.

| Status | Gate                                 | Pass Criteria                                                                                                                                                       | Evidence                                                  |
| ------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| [ ]    | Production env generated             | `/opt/librechat/deploy/ferretdb/.env` exists, mode `0600`, and contains real domains/secrets.                                                                       | `ls -l /opt/librechat/deploy/ferretdb/.env`               |
| [ ]    | SeaweedFS selected                   | `OBJECT_STORE_MODE=seaweedfs`; `COMPOSE_FILES` includes `deploy-compose.ferretdb.seaweedfs.yml`.                                                                    | `deploy/ferretdb/bin/validate-env.sh` output              |
| [ ]    | RAG disabled or reviewed             | Either `RAG_ENABLED=false`, or `RAG_ENABLED=true` with `deploy-compose.ferretdb.rag.yml`, digest pins, source URL/ref/license, and `RAG_API_LICENSE_REVIEWED=true`. | `.env` redacted snapshot and license audit                |
| [ ]    | Images pinned                        | Active runtime image variables use `@sha256:` digests.                                                                                                              | `deploy/ferretdb/bin/validate-env.sh` output              |
| [ ]    | No placeholder secrets               | Validator reports no placeholder domains, secrets, keys, credentials, or review metadata.                                                                           | `deploy/ferretdb/bin/validate-env.sh` output              |
| [ ]    | Compose renders cleanly              | Docker Compose config renders with the intended files and no unintended RAG services when `RAG_ENABLED=false`.                                                      | `artifacts/bootstrap-host/<timestamp>/compose.config.yml` |
| [ ]    | API image built                      | `LIBRECHAT_API_IMAGE` exists on the host and was built from the intended git commit.                                                                                | `docker image inspect "$LIBRECHAT_API_IMAGE"`             |
| [ ]    | Stack managed by systemd             | SeaweedFS stack, backup timer, and healthcheck timer are enabled. Backup shipping timer is enabled if shipping is configured.                                       | `systemctl status ...` outputs                            |
| [ ]    | Auth gateway owns tenant assignment  | Browser clients cannot spoof `X-Tenant-Id` or `X-Auth-Tenant-Id`; auth service supplies `X-Auth-Tenant-Id` only after authentication.                               | `npm run smoke:auth-gateway` output                       |
| [ ]    | Internal tenant gateway smoke passes | Local gateway rejects missing/malformed tenant headers and overwrites untrusted `X-Tenant-Id`.                                                                      | `npm run smoke:tenant-gateway` output                     |
| [ ]    | Healthcheck passes                   | Services, tenant gateway, backup freshness, and disk thresholds pass.                                                                                               | `deploy/ferretdb/bin/healthcheck.sh` output               |
| [ ]    | First backup completed               | Backup archive and `.sha256` exist under `/srv/librechat/backups`.                                                                                                  | backup archive path                                       |
| [ ]    | Backup ships off-host                | `BACKUP_SHIP_DRY_RUN=true` succeeds, then a real shipping run succeeds to an encrypted/off-host remote.                                                             | `ship-backups.sh` logs                                    |
| [ ]    | Restore drill passes                 | Staging drill passes with the same image set and object-store mode.                                                                                                 | DR drill archive path and terminal log                    |
| [ ]    | License audit reviewed               | Non-MIT/Apache items, inactive RAG risk, MinIO risk, package manifest mismatches, and unknown package licenses have been reviewed.                                  | `license-audit.md`                                        |
| [ ]    | Release evidence returns `GO`        | `npm run release:evidence` exits `0` and `summary.json.releaseStatus` is `GO`.                                                                                      | evidence bundle path                                      |
| [ ]    | Monitoring attached                  | Host monitoring watches systemd healthcheck failures, disk usage, backup freshness, Docker service state, and auth-gateway errors.                                  | monitoring dashboard/check IDs                            |
| [ ]    | Rollback artifacts ready             | Previous image pins, last known-good backup archive, and DNS/load-balancer rollback procedure are documented.                                                       | rollback notes                                            |

## Production Commands

Generate and validate the env:

```bash
cd /opt/librechat
DOMAIN_SERVER=https://chat.yourdomain.tld \
DOMAIN_CLIENT=https://chat.yourdomain.tld \
OBJECT_STORE_MODE=seaweedfs \
deploy/ferretdb/bin/generate-env.sh

deploy/ferretdb/bin/validate-env.sh
```

Preview and run host bootstrap:

```bash
cd /opt/librechat
BOOTSTRAP_DRY_RUN=true npm run host:bootstrap
npm run host:bootstrap
```

Run public auth-gateway conformance:

```bash
AUTH_GATEWAY_URL=https://chat.yourdomain.tld \
AUTH_GATEWAY_VALID_HEADERS_JSON='{"Cookie":"session=replace-with-valid-session"}' \
npm run smoke:auth-gateway
```

Run release evidence:

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

The release evidence command must return:

```text
release status: GO
```

## Optional RAG Enablement Gate

Complete this section only if RAG is enabled.

| Status | Gate                     | Pass Criteria                                                                                  | Evidence                        |
| ------ | ------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------- |
| [ ]    | RAG override intentional | `COMPOSE_FILES` includes `deploy-compose.ferretdb.rag.yml` and `RAG_ENABLED=true`.             | `.env` redacted snapshot        |
| [ ]    | RAG image reviewed       | `RAG_API_IMAGE` digest maps to reviewed source/build provenance.                               | source URL/ref, build log, SBOM |
| [ ]    | RAG license reviewed     | `RAG_API_SOURCE_LICENSE` and notices are approved for commercial use and redistribution model. | legal review reference          |
| [ ]    | RAG backup covered       | `rag/rag.dump` appears in backups and restore drill verifies RAG sentinel data.                | DR drill log                    |

## Sign-Off

Do not launch if any required gate is unchecked.

| Role             | Name | Date | Notes |
| ---------------- | ---- | ---- | ----- |
| Engineering      |      |      |       |
| Operations       |      |      |       |
| Security         |      |      |       |
| Legal/Compliance |      |      |       |
