# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LibreChat is an open-source AI chat platform that integrates multiple AI providers (OpenAI, Anthropic, Google, Azure, AWS Bedrock, etc.) with a ChatGPT-inspired UI. This fork adds FIPS compliance considerations for OpenShift deployment.

**Version:** v0.8.1-rc1

## Build & Development Commands

```bash
# Install dependencies (from root)
npm ci

# Build all packages (required before running)
npm run build:packages

# Build frontend only
npm run frontend

# Run backend (production)
npm run backend

# Run backend (development with hot reload)
npm run backend:dev

# Run frontend dev server
npm run frontend:dev

# Lint
npm run lint
npm run lint:fix

# Format
npm run format
```

## Testing Commands

```bash
# Run API tests
npm run test:api

# Run client tests
npm run test:client

# Run single test file (API)
cd api && npx jest path/to/test.spec.js

# Run single test file (client)
cd client && npx jest path/to/test.spec.tsx

# E2E tests (Playwright)
npm run e2e              # Local
npm run e2e:headed       # With browser visible
npm run e2e:debug        # Debug mode
```

## Architecture

### Monorepo Structure

This is an npm workspaces monorepo:

```
LibreChat/
├── api/                    # Express.js backend (Node.js)
│   ├── app/clients/        # AI provider client implementations
│   ├── server/             # Express routes, controllers, middleware
│   ├── models/             # Mongoose models
│   └── strategies/         # Passport auth strategies
├── client/                 # React frontend (Vite)
│   └── src/
│       ├── components/     # React components
│       ├── hooks/          # Custom React hooks
│       ├── store/          # State management (Recoil/Jotai)
│       └── routes/         # React Router routes
├── packages/
│   ├── data-provider/      # Shared data types, API client, React Query hooks
│   ├── data-schemas/       # Zod schemas shared between frontend/backend
│   ├── api/                # MCP protocol implementation
│   └── client/             # Shared client utilities
```

### Key Technologies

- **Backend:** Express.js, MongoDB (Mongoose), Redis (caching/sessions)
- **Frontend:** React 18, Vite, TailwindCSS, Radix UI, React Query
- **Search:** Meilisearch for full-text search
- **Auth:** Passport.js (local, OAuth2, LDAP, SAML)
- **AI Integration:** LangChain, MCP (Model Context Protocol)

### Data Flow

1. `packages/data-provider` defines shared types and API client
2. Client uses React Query hooks from `data-provider/react-query`
3. Backend Express routes in `api/server/routes/`
4. AI requests processed through `api/app/clients/` (OpenAI, Anthropic, etc.)
5. MongoDB stores conversations, users, messages
6. Meilisearch indexes messages for search

### Build Order

Packages must be built in dependency order:
1. `packages/data-provider` → 2. `packages/data-schemas` → 3. `packages/api` → 4. `packages/client` → 5. `client/`

The `npm run build:packages` command handles this.

## OpenShift Deployment

See `OPENSHIFT_DEPLOYMENT.md` for comprehensive deployment instructions. Key points:

- Deploy via Helm chart: `oci://ghcr.io/danny-avila/librechat-chart/librechat`
- Requires `anyuid` SCC for MongoDB, Meilisearch, and LibreChat pods
- Configuration via ConfigMap (`librechat.yaml`) and Secret (`librechat-credentials-env`)
- Update `values-openshift-minimal.yaml` with your cluster's storage class before deploying

### Quick Deploy Sequence

```bash
oc new-project librechat
oc create configmap librechat-config --from-file=librechat.yaml=./librechat.yaml -n librechat
oc create secret generic librechat-credentials-env --from-literal=MONGO_URI='...' ... -n librechat
oc adm policy add-scc-to-user anyuid -z default -z librechat-librechat -z librechat-meilisearch -z librechat-mongodb -n librechat
helm install librechat oci://ghcr.io/danny-avila/librechat-chart/librechat --version 1.9.2 -n librechat --values values-openshift-minimal.yaml
oc set volume deployment/librechat-librechat --add --name=librechat-config-volume --type=configmap --configmap-name=librechat-config --mount-path=/app/librechat.yaml --sub-path=librechat.yaml -n librechat
oc create route edge librechat --service=librechat-librechat --port=3080 --insecure-policy=Redirect -n librechat
```

## FIPS Compliance

See `FIPS-Issues.md` for detailed compliance notes. Summary:

- Deployment works on FIPS-enabled OpenShift clusters
- Container images (Alpine/Debian-based) are NOT FIPS-certified
- For strict FIPS compliance, custom UBI-based images would be needed
- No blocking issues encountered during testing

## Configuration Files

- `librechat.yaml` - Main application config (AI endpoints, MCP servers, features)
- `.env` - Environment variables (API keys, secrets)
- `values-openshift-minimal.yaml` - Helm values for OpenShift deployment

## MCP Server Integration

LibreChat supports Model Context Protocol (MCP) servers. Configure in `librechat.yaml`:

```yaml
mcpServers:
  my-server:
    type: streamable-http  # Use streamable-http, not SSE
    url: https://my-mcp-server.example.com
    timeout: 90000
```

Check MCP connectivity in logs: `oc logs deployment/librechat-librechat | grep "\[MCP\]"`
