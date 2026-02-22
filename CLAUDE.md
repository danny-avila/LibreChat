# CLAUDE.md — LLM Hub

> Working title: `llm-hub` (may be renamed later)

## Project Overview

Fork of [LibreChat](https://github.com/danny-avila/LibreChat) (MIT license) aiming to build a modern LLM interface that makes the best features of Claude, ChatGPT, and others available with any model. Provider-independent, self-hosted, community-driven.

**Base:** LibreChat v0.8.3+
**License:** MIT (inherited from LibreChat)
**Stack:** React + TypeScript (frontend), Node.js/Express (backend), MongoDB, Python/FastAPI (RAG)

## Deployment

Self-hosted via Docker Compose behind a reverse proxy (Traefik).
See `docker-compose.yml` and `.env.example` for setup instructions.

## Custom Features (Our Differentiator)

Features we build ourselves because they are missing or immature in LibreChat:

1. **Memory System** — Cross-conversation memory at Claude's level
2. **Skills / Progressive Disclosure** — Lazy-loading tool system
3. **Canvas** — Iterative editing in side panel (beyond basic Artifacts)
4. **Code Sessions** — Sandboxed coding environments (git-worktree-based)
5. **Multi-Model Comparison** — Side-by-side prompt comparison
6. **Cron Agents** — Scheduled automatic LLM invocations

## Key Files

- `docs/plans/2026-02-22-llm-hub-design.md` — Initial design document with all decisions

## Upstream Sync

LibreChat upstream: https://github.com/danny-avila/LibreChat
- Selective cherry-picks of good upstream changes
- Keep custom features in separate directories/modules where possible
- Review upstream changes before merging, avoid conflicts

## Conventions

- All code, commits, docs, and comments in **English**
- Docker Compose for container orchestration
- Reverse proxy (Traefik) handles SSL termination and routing
