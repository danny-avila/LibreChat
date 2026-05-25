# Architecture

## Why this fork exists

This is an internal Lexaeon fork of [LibreChat](https://github.com/danny-avila/LibreChat) used as the chat backend for the Synthetic Persona Engine (SPE). SPE personas (bots) sign in, ask questions of an LLM, and pipe the responses to Sternlight. Consumer chat products (ChatGPT, Claude.ai) prohibit bot accounts in their ToS, so Lexaeon runs a chat platform it owns where bot accounts are first-class. The fork's job is to be that platform — same product as upstream LibreChat, with the smallest set of changes needed to make bot logins and multi-persona usage workable.

## Deployment topology

```
                 ┌──────────────────────────┐
                 │   Browser / SPE bots     │
                 └────────────┬─────────────┘
                              │ HTTPS
                              │ chat.patoexpectsspeed.com
                              ▼
       ┌──────────────────────────────────────────────┐
       │  EC2 t3.small (us-east-2, Ubuntu 24.04)      │
       │  Public IP 3.14.217.225 (Elastic)            │
       │                                              │
       │   ┌────────────────────────────────────┐     │
       │   │  Caddy (host)                      │     │
       │   │  :443 → :3080, Let's Encrypt auto  │     │
       │   └─────────────────┬──────────────────┘     │
       │                     │                        │
       │   ┌─────────────────▼──────────────────┐     │
       │   │  Docker Compose stack              │     │
       │   │   • LibreChat API (custom image)   │     │
       │   │   • MongoDB                        │     │
       │   │   • Meilisearch                    │     │
       │   │   • rag_api + pgvector             │     │
       │   └─────────────────┬──────────────────┘     │
       └─────────────────────┼────────────────────────┘
                             │ outbound HTTPS
              ┌──────────────┴──────────────┐
              ▼                             ▼
        Together AI                       Groq
        (primary LLM)                (backup LLM, free tier)
```

## Components

| Component | Role |
|---|---|
| **EC2 instance** | Single t3.small in `us-east-2`, Lexaeon AWS account `743422350824`. Hosts everything except the LLM providers. |
| **Caddy** | Host-level reverse proxy. Terminates TLS with auto-renewing Let's Encrypt certs and forwards `:443 → :3080`. |
| **Cloudflare DNS** | `chat.patoexpectsspeed.com` points at the EC2 elastic IP. DNS-only (proxy disabled) so Let's Encrypt HTTP-01 validation works. |
| **LibreChat API container** | The fork. Image is built from this repo and run via `docker-compose.override.yml` (target `node` in [Dockerfile](../Dockerfile)). |
| **MongoDB** | App database (users, conversations, messages). Volume bind-mounted at `./data-node`. |
| **Meilisearch** | Conversation search index. Volume at `./meili_data_v1.35.1`. |
| **rag_api + vectordb** | Upstream RAG stack (pgvector). Present but not heavily exercised in the pilot. |
| **Together AI** | Primary LLM provider. Prepaid $20 credit, auto-recharge off. Default model `meta-llama/Llama-3.3-70B-Instruct-Turbo`. |
| **Groq** | Backup LLM provider. Free tier (~100K tokens/day). |

The LibreChat endpoint configuration is in [librechat.yaml](../librechat.yaml); secrets and tunables are in `.env` on the EC2 host (gitignored).

## Customizations vs upstream

These are the only places this fork diverges from upstream LibreChat. See the ADRs for reasoning.

| Area | Change | Where |
|---|---|---|
| Login UX | Username field instead of email at signup/login. Stored email is synthesized as `<username>@spe.local`. | [api/strategies/validators.js](../api/strategies/validators.js), [api/server/services/AuthService.js](../api/server/services/AuthService.js), [client/src/components/Auth/LoginForm.tsx](../client/src/components/Auth/LoginForm.tsx), [client/src/components/Auth/Registration.tsx](../client/src/components/Auth/Registration.tsx). See [decisions/2026-05-21-username-login-investigation.md](decisions/2026-05-21-username-login-investigation.md). |
| Email verification | Disabled. No email infrastructure for the chat platform — personas don't have inboxes. | `ALLOW_EMAIL_VERIFICATION=false`, `ALLOW_UNVERIFIED_EMAIL_LOGIN=true` in `.env`. |
| LLM endpoints | Two custom endpoints: Together (primary), Groq (backup). | [librechat.yaml](../librechat.yaml). |
| Session TTL | `SESSION_EXPIRY` bumped from 15 min default → 24 h. Workaround for SPE personas not yet using refresh tokens. | `.env`. See [decisions/2026-05-25-pilot-config-and-provider-swap.md](decisions/2026-05-25-pilot-config-and-provider-swap.md). |
| Rate limits | `LOGIN_MAX` 7 → 20 / 5 min; `REGISTER_MAX` 5 → 20 / 60 min. Sized for the 6-persona pilot. | `.env`. |

## Known gaps

These are real holes in the deployment, not features. Document them honestly so the next person knows what they're walking into.

- **No automated MongoDB backups.** The data-node volume is the only copy of user/conversation data. `mongodump` is scriptable but nothing is scheduled.
- **No CI/CD for image builds.** Workflows that would deploy or push images are disabled (renamed `.yml.disabled` under `.github/workflows/` — `build.yml`, `deploy.yml`, `main-image-workflow.yml`, the `dev-*-images.yml` family, `tag-images.yml`, etc.). Quality checks (lint, tests, accessibility, i18n hygiene) still run normally on PRs. Today, multi-arch images are built and pushed manually from a laptop with `docker buildx`.
- **Bus factor of 1.** Only Pato has SSH and AWS console access; Lex has neither.
- **No staging environment.** Local Docker on the laptop is the only place to test before production.
- **SESSION_EXPIRY workaround.** The 24-hour session is masking a missing feature on the SPE side (refresh-token handling in the persona client). Revisit once SPE catches up.
- **Single small EC2.** t3.small is right-sized for the pilot. Production scale (180 personas, real concurrency) will need to be re-sized and possibly fronted by a load balancer.
