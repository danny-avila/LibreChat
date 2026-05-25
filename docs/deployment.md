# Deployment

This is the operational playbook for shipping changes to `chat.patoexpectsspeed.com`. The initial host setup is largely informational — it's already done. The code-change and config-change deploy loops are the parts you'll actually use.

For the architecture context, see [architecture.md](architecture.md).

## Prerequisites

What you need on the laptop you're deploying from:

- This repo cloned at `~/Projects/Work/libre-chat/`.
- Docker Desktop running (with buildx).
- The SSH key at `~/.ssh/llm-chat-key.pem`, mode `600`.
- A GitHub Personal Access Token with `write:packages` scope, logged in via:
  ```
  echo "$GHCR_PAT" | docker login ghcr.io -u <github-username> --password-stdin
  ```
- Your laptop's public IP is in the EC2 security group (SSH is locked to `181.14.33.253/32`).

## Initial setup (reference — already done)

Captured here so it's reproducible if we ever need to rebuild from scratch.

### EC2 instance

- Type: `t3.small`
- Region: `us-east-2` (Ohio)
- AMI: Ubuntu Server 24.04 LTS (x86_64)
- Public IP: `3.14.217.225` (Elastic IP, persistent across stop/start)
- Key pair: `llm-chat-key` (private key on laptop at `~/.ssh/llm-chat-key.pem`)
- Host packages: `docker`, `docker-compose-plugin`, `caddy`

### Security group

| Port | Source | Reason |
|---|---|---|
| 22 (SSH) | `181.14.33.253/32` | Pato's laptop only |
| 80 (HTTP) | `0.0.0.0/0` | Let's Encrypt HTTP-01 challenge |
| 443 (HTTPS) | `0.0.0.0/0` | Public chat traffic |

### DNS (Cloudflare)

| Record | Type | Value | Proxy |
|---|---|---|---|
| `chat.patoexpectsspeed.com` | A | `3.14.217.225` | DNS only (gray cloud) |

The proxy must stay off — Cloudflare's orange-cloud mode breaks Let's Encrypt HTTP-01 validation and adds a TLS hop we don't want.

### Caddyfile (`/etc/caddy/Caddyfile` on EC2)

```
chat.patoexpectsspeed.com {
    reverse_proxy localhost:3080
}
```

Caddy handles cert issuance and renewal automatically.

### GHCR auth on EC2

On the EC2 host, log in with a `read:packages`-only PAT so the host can `docker compose pull` images:

```
echo "$GHCR_READ_PAT" | docker login ghcr.io -u <github-username> --password-stdin
```

The credential is stored at `~/.docker/config.json`. The read-only token is intentionally narrower than the laptop's `write:packages` token.

## Code change deploy

Use this loop when you've touched anything under `api/`, `client/`, `packages/`, or the Dockerfiles — anything that requires rebuilding the container image.

### 1. Edit locally

```
cd ~/Projects/Work/libre-chat
# make changes
```

### 2. Test locally

The `docker-compose.override.yml` in this repo builds a local image tagged `ghcr.io/lexaeon-org/libre-chat:latest` from source via Dockerfile target `node` — same tag as the production image, so `docker compose up -d --build` produces a locally-runnable copy of what would ship to EC2.

```
docker compose down
docker compose up -d --build
```

Open `http://localhost:3080` and exercise the change. Watch logs:

```
docker compose logs api --tail=100 -f
```

### 3. Commit + push

```
git add -A
git commit -m "<message>"
git push origin main
```

### 4. Build and push the multi-arch image

The EC2 host is `linux/amd64`; the laptop may be `arm64`. Build both:

```
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --target node \
  --tag ghcr.io/lexaeon-org/libre-chat:latest \
  --push .
```

Notes:
- `--push` does the GHCR upload directly. There's no separate `docker push` step.
- If you don't have a buildx builder configured, `docker buildx create --use` once.
- The `:latest` tag is what production pulls. For a rollback-able pin, also tag with the git SHA (see [Rollback](#rollback)).

### 5. Deploy on EC2

```
ssh -i ~/.ssh/llm-chat-key.pem ubuntu@3.14.217.225
```

Then on the host:

```
cd ~/libre-chat
docker compose pull
docker compose down
docker compose up -d
docker compose ps
```

`docker compose ps` should show all containers `Up`. If `LibreChat` is restarting, check `docker compose logs api --tail=100`.

> **Local vs EC2 override difference.** Both the local `docker-compose.override.yml` in this repo and the one on EC2 use `image: ghcr.io/lexaeon-org/libre-chat:latest` — the tag is the same. The difference is the `build:` directive: the local override includes it (so `docker compose up -d --build` rebuilds from source), and the EC2 override omits it (so `docker compose pull` fetches the image from GHCR). If you change the local override on EC2, make sure the `build:` block stays out.

## Config-only deploy

Use this faster path when only `.env` or `librechat.yaml` changed. No image rebuild needed.

```
scp -i ~/.ssh/llm-chat-key.pem .env ubuntu@3.14.217.225:~/libre-chat/.env
scp -i ~/.ssh/llm-chat-key.pem librechat.yaml ubuntu@3.14.217.225:~/libre-chat/librechat.yaml

ssh -i ~/.ssh/llm-chat-key.pem ubuntu@3.14.217.225 \
  'cd ~/libre-chat && docker compose down && docker compose up -d'
```

Reminder: `.env` is gitignored — do not commit secrets in this loop.

## Rollback

GHCR retains every pushed image. To roll back to a known-good build:

1. Find the SHA you want from the GHCR UI: `https://github.com/orgs/lexaeon-org/packages/container/libre-chat/versions`.
2. On EC2, edit `~/libre-chat/docker-compose.override.yml` (or whatever override file points at the GHCR image) to pin a specific digest or tag:
   ```yaml
   image: ghcr.io/lexaeon-org/libre-chat@sha256:<digest>
   ```
   or
   ```yaml
   image: ghcr.io/lexaeon-org/libre-chat:<git-sha-tag>
   ```
3. `docker compose pull && docker compose down && docker compose up -d`.

To make this less painful in the future: when building in step 4 above, also push a SHA-tagged image so you have something specific to pin to:

```
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --target node \
  --tag ghcr.io/lexaeon-org/libre-chat:latest \
  --tag ghcr.io/lexaeon-org/libre-chat:$(git rev-parse --short HEAD) \
  --push .
```
