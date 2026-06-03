# Moasherat deployment (LibreChat + analytics MCP)

Self-hosted stack for **محلل رضا الحج** and related presets using [Moasherat/analytics_chatbot](https://github.com/Moasherat/analytics_chatbot).

## Layout

Clone both repositories as siblings:

```text
your-workspace/
  analytics_chatbot/
  LibreChat/          # this repo (fork or upstream)
```

## Setup

```bash
# MCP keys (Cube, Directus)
cd ../analytics_chatbot
cp .env.example .env
# edit .env

cd ../LibreChat
cp .env.example .env
# set MEILI_MASTER_KEY and vLLM/OpenAI settings
cp librechat.moasherat.yaml librechat.yaml
```

## Run

```bash
docker compose -f docker-compose.moasherat.yml -f docker-compose.moasherat.override.yml up -d --build
```

| Service | URL |
|---------|-----|
| LibreChat UI | http://localhost:3080 |
| MCP | http://localhost:3000/mcp |

Recreate MCP after env changes:

```bash
docker compose -f docker-compose.moasherat.yml -f docker-compose.moasherat.override.yml up -d --force-recreate mcp
```

## Files

| File | Purpose |
|------|---------|
| `librechat.moasherat.yaml` | MCP server, presets, allowed domains |
| `docker-compose.moasherat.yml` | Full stack including `analytics-mcp` |
| `docker-compose.moasherat.override.yml` | Local tweaks (MCP healthcheck off) |

Preprompt sources live in **analytics_chatbot** (`preprompt_v6.txt`, etc.); copy changes into `librechat.moasherat.yaml` when updating agents.
