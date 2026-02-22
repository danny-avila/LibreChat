# LLM Hub — Design Document

> Working title: `llm-hub` (may be renamed later)
> Created: 2026-02-22

## Vision

A modern, open-source LLM interface that makes the best features of Claude, ChatGPT, and others available with any model. Provider-independent, self-hosted, community-driven.

## Decision Log

### Fork Base: LibreChat (MIT)

**Decision:** Fork [LibreChat](https://github.com/danny-avila/LibreChat) (MIT license)

**Evaluated Alternatives:**

| Option | Result | Reason |
|---|---|---|
| OpenWebUI | Rejected | Restrictive custom license (since v0.6.6), fewer features than LibreChat, outdated |
| LobeChat/LobeHub | Rejected | Best UI, but restrictive commercial license for derivatives, codebase mid-2.0-rewrite |
| Build from scratch (Next.js) | Rejected | 3-6 months to feature parity, no ecosystem advantage |
| big-AGI | Rejected | Good multi-model feature, but fewer features overall |

**Why LibreChat:**
- MIT license = full freedom for rebranding and distribution
- ~80% feature parity from day 1 (Artifacts, MCP, Agents, RAG, Multi-Model, Code Execution)
- Active upstream with ClickHouse backing (since Nov 2025)
- Skills/Progressive Disclosure natively built-in (Deferred Tool Loading)
- Cross-conversation memory already in production
- MERN stack (MongoDB, Express, React, Node) — largest developer community

### Tech Stack

Keeping LibreChat's existing stack:
- **Frontend:** React + TypeScript
- **Backend:** Node.js / Express
- **Database:** MongoDB
- **RAG:** Python/FastAPI + pgvector
- **Containerization:** Docker / Docker Compose

Potential long-term migration to Next.js App Router — decision deferred until architectural limitations become clear.

### Project Structure

- **Public GitHub repo** (fork of LibreChat)
- **Deployment:** Self-hosted via Docker Compose behind reverse proxy
- **Separate git repo** with dedicated Docker Compose stack

## Feature Prioritization

### Phase 1: Fork + Deploy (Week 1-2)
- Fork LibreChat and set up as own repo
- Configure Docker Compose for production deployment
- Set up reverse proxy routing with SSL
- CI/CD: GitHub → server deployment pipeline

### Phase 2: Custom Features — Foundations (Week 3-8)
- **Memory System** (Claude-level): Cross-conversation memory with semantic extraction
- **Skills / Progressive Disclosure**: Lazy-loading tool system (short description → full prompt on-demand)
- **Canvas / Inline Editing**: Beyond LibreChat's Artifacts — iterative editing in side panel

### Phase 3: Advanced Features (Month 3+)
- **Code Sessions**: Sandboxed coding environments (like Claude Code sessions), git-worktree-based
- **Multi-Model Comparison**: Side-by-side prompt comparison (currently broken in LibreChat)
- **Cron Agents**: Scheduled automatic LLM invocations
- **Voice Mode**: TTS/STT integration

### Phase 4: Community & Polish (Month 6+)
- UI/UX overhaul (aim for LobeChat-level design quality)
- Plugin/extension system
- Contributor documentation
- Public launch

## Deployment Architecture

### GitHub → Server Pipeline

```
Developer (local)
    │
    ├── git push → GitHub (public repo)
    │                 │
    │                 ├── GitHub Actions / Webhook
    │                 │         │
    │                 │         ▼
    │                 │   Production Server
    │                 │         │
    │                 │         ├── docker compose pull
    │                 │         └── docker compose up -d
    │                 │
    │                 └── GitHub Container Registry (ghcr.io)
    │                           │
    │                           └── Custom Docker Image
    │
    └── Alternative: git pull + docker compose up -d
```

### Deployment Options

**Option A: Image-based (Recommended for production)**
- GitHub Actions builds Docker image on every push/tag
- Image pushed to ghcr.io
- Server pulls new image and restarts containers
- Clean, reproducible, rollback-capable

**Option B: Git-pull + build on server (Good for fast iteration)**
- Repo cloned on server
- On changes: `git pull && docker compose up -d`
- Faster for development, less overhead
- Can be triggered via webhook or manually

**Recommendation:** Option B for the initial phase (fast iteration), switch to Option A later.

### Docker Compose Integration

- Dedicated `docker-compose.yml` with all required services
- `docker-compose.override.yml` for server-specific config (reverse proxy labels, networks)
- `.env` for secrets and environment-specific settings
- See `docker-compose.override.yml.example` for reverse proxy setup template

## Open Questions

- [ ] Final project name / branding
- [x] GitHub organization or personal repo? → Personal (jan-nikolov)
- [x] MongoDB: Dedicated instance or shared with other services? → Dedicated (in compose stack)
- [x] Which LLM providers to configure initially? → OpenRouter (single API for all models)
