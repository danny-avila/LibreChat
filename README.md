# LibreChat-FIPS

Fork of [LibreChat](https://github.com/danny-avila/LibreChat) (v0.8.1-rc2) for deployment on Red Hat OpenShift, with optional FIPS compliance.

Upstream docs: [docs.librechat.ai](https://docs.librechat.ai/)

## Quick Start: Deploy to OpenShift

### Prerequisites

- `oc` CLI, logged into your OpenShift cluster
- `helm` CLI installed
- `python3` with `bcrypt` (`pip install bcrypt`)
- A `.env` file in the repo root with your API keys (see `.env.example`)
- A `librechat.yaml` in the repo root with your MCP server URLs and endpoint config

### One-Command Deploy

```bash
./scripts/deploy-golden-path.sh \
  --admin-email you@example.com \
  --admin-name "Your Name" \
  --agents-file agents-export.json \
  --make-public
```

This will:
1. Create the namespace, grant SCCs, create secrets and ConfigMap
2. Helm install LibreChat + MongoDB + Meilisearch
3. Create an ADMIN user with a generated password (printed once at the end)
4. Import agents from the export file and make them publicly visible
5. Verify health and print a summary

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--admin-email` | (required) | Email for the admin account |
| `--admin-name` | email prefix | Display name |
| `--namespace` | `librechat-fips` | OpenShift namespace |
| `--agents-file` | (none) | Path to `agents-export.json` for import |
| `--make-public` | off | Make imported agents visible to all users |
| `--image-registry` | `ghcr.io` | Container image registry |
| `--image-repo` | `danny-avila/librechat` | Container image repository |
| `--image-tag` | Chart appVersion | Container image tag |
| `--skip-user` | off | Skip admin user creation |
| `--skip-agents` | off | Skip agent import |
| `--dry-run` | off | Show what would be done |

### Updating Configuration

After editing `librechat.yaml`:

```bash
./update-librechat-config.sh librechat-fips
```

### Common Operations

```bash
# Check status
make status NAMESPACE=librechat-fips

# Follow logs
make logs NAMESPACE=librechat-fips

# Export agents (for migration to another cluster)
make export-agents NAMESPACE=librechat-fips

# Import agents
make import-agents NAMESPACE=librechat-fips EMAIL=you@example.com PUBLIC=true

# Restart
make restart NAMESPACE=librechat-fips

# Tear down
make undeploy NAMESPACE=librechat-fips
```

## Configuration

### `.env`

Contains API keys and secrets (JWT, encryption keys, Meilisearch master key, provider API keys). See `.env.example` for the full list.

### `librechat.yaml`

Primary application config: MCP servers, custom AI endpoints, memory settings, interface options, rate limits. Mounted into the pod as a ConfigMap at `/app/librechat.yaml`.

### `helm/librechat/values-openshift.yaml`

Helm values for OpenShift. The deploy script patches the cluster hostname and image settings automatically via `sed`, so the values file doesn't need manual cluster-specific edits.

## FIPS Compliance

For FIPS-enabled clusters, build with `Containerfile.fips` (on the `feat/fips-openshift-deployment` branch):

- Red Hat UBI 9 / nodejs-20 base with FIPS-validated OpenSSL 3.0
- bcrypt replaced with PBKDF2-HMAC-SHA256
- HMAC-SHA1 replaced with HMAC-SHA256 for TOTP

Note: existing bcrypt password hashes are incompatible - users must reset passwords after migration.

## Development

```bash
npm ci                    # Install dependencies
npm run build:packages    # Build shared packages (required before running)
npm run backend:dev       # API server with auto-reload (port 3080)
npm run frontend:dev      # Vite dev server with HMR
npm run test:api          # Backend tests
npm run test:client       # Frontend tests
npm run lint              # ESLint
npm run format            # Prettier
```

## Upstream

Based on [danny-avila/LibreChat](https://github.com/danny-avila/LibreChat). See upstream [changelog](https://www.librechat.ai/changelog) for release notes.
