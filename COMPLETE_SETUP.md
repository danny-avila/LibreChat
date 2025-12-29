# Complete Setup Guide

This document walks through every step to provision the Bintybyte AI Chat project from a fresh Linux box through a fully working local deployment.

## 1. Ensure host prerequisites

```bash
sudo apt update
sudo apt install -y make
sudo apt install -y docker-compose-v2
sudo apt install -y docker.io git openssl curl
```

The `make` and `docker-compose-v2` packages fulfill the automation and orchestration layers. Install `docker.io` if you do not yet have the daemon, and add your user to the `docker` group:

```bash
sudo usermod -aG docker "$USER"
```

Then log out and back in so the group change takes effect.

## 2. Clone and bootstrap the repo

```bash
git clone https://github.com/your-org/LibreChat.git
cd LibreChat
make setup
```

`make setup` copies `.env.example`, `librechat.example.yaml`, and `docker-compose.override.yml` into place and prepares the project-specific configuration files that the containers mount.

## 3. Fill in secrets and API keys

Edit `.env` and assign values for the keys you plan to use:

- Core AI providers: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_KEY`
- Specialized providers: `GROQ_API_KEY`, `MISTRAL_API_KEY`, `OPENROUTER_KEY`, `HELICONE_KEY`, `PORTKEY_API_KEY`, `PORTKEY_OPENAI_VIRTUAL_KEY`
- Web search: `JINA_API_KEY`, `SERPER_API_KEY`, `FIRECRAWL_API_KEY`
- Secrets: `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CREDS_KEY`, `CREDS_IV`

Generate new secrets with `openssl rand -hex 32` (or `-hex 16` for `CREDS_IV`) and update the `UID`/`GID` entries to match `$(id -u)`/`$(id -g)`.

## 4. Review `librechat.yaml` and `docker-compose.override.yml`

- Confirm the AI endpoints you want to expose and add or remove models in `librechat.yaml`.
- Ensure `librechat.yaml` remains mounted into `api` via `docker-compose.override.yml`, so changes take effect without rebuilding containers.
- If you plan to run the MCP ClickHouse server locally, double-check the `mcp-clickhouse` service block in the override file.

## 5. Build and launch services

```bash
make build
make up
```

`make up` runs `make ensure-volumes` under the hood to align host permissions before starting every service. Use `make logs` or `make ps` to monitor status and `make logs-api` for API-specific output.

## 6. Post-launch steps

- Access the UI at http://localhost:3080 and create an admin account (with `ALLOW_REGISTRATION=true`).
- Seed additional LDAP users with `make add-ldap-user` if you rely on LDAP authentication.
- Enable agents, web search, or MCP tooling by editing `librechat.yaml` and restarting with `make restart`.

## 7. Production considerations

- Generate new secrets for production (see `[README.md](README.md#-production-deployment)`).
- Add `docker-compose.prod.yml` entries if you need resource limits, logging options, or TLS termination.
- Keep periodic backups of MongoDB (`docker exec chat-mongodb mongodump …`) and monitor logs via `make logs` or the built-in observability tools.

This guide supplements the full [SETUP.md](SETUP.md) walkthrough and the Makefile command helper in [MAKE_SETUP.md](MAKE_SETUP.md) for more granular references.
