# Bizu Chat — Launch Readiness Review

## What This Is

Bizu is a fork of **Bizu v0.8.1-rc2**, an open-source ChatGPT alternative. The goal: a simplified, PT-BR-only ChatGPT clone for the Brazilian market, using cheap Chinese models (DeepSeek, etc.) via OpenRouter, with a freemium subscription model.

---

## Current State of the Codebase

### What's Working (inherited from Bizu)
- Full chat UI with streaming, message editing, branching
- Multi-model support (OpenAI, Anthropic, Google, + custom endpoints like DeepSeek via OpenRouter)
- Built-in token balance/transaction tracking system (MongoDB)
- Email/password authentication (JWT-based)
- Social login scaffolding (Google, GitHub, Discord, Facebook, Apple)
- File uploads, image generation, RAG (document search)
- MCP (Model Context Protocol) server support
- Agents, Assistants API support
- MeiliSearch for conversation search
- Docker Compose deployment (MongoDB + MeiliSearch + PgVector + RAG API)

### What's Been Customized
1. **i18n**: Commit `a4b88bb` simplified i18n for PT-BR focus, but **all 30+ language files still exist** and are still imported in `client/src/locales/i18n.ts`. The cleanup is incomplete.
2. **README**: Updated to describe Bizu scope and roadmap.

### What Has NOT Been Done Yet
Almost everything on the roadmap. The codebase is essentially still vanilla Bizu with minor changes.

---

## Critical Gaps to Launch

### 1. AUTHENTICATION — Supabase Auth (mentioned in roadmap, NOT started)
**Current**: Bizu uses its own JWT auth backed by MongoDB (`api/server/services/AuthService.js`, `api/strategies/`). It works, but it's complex.

**Decision needed**:
- **Option A**: Keep Bizu's auth as-is. It works, has email/password, social login, password reset. Simpler to launch fast.
- **Option B**: Migrate to Supabase Auth. Cleaner for a new product, but requires replacing the entire auth layer.

**Recommendation**: Keep Bizu's auth for v1 launch. It's battle-tested. Migrate later if needed.

### 2. PAYMENTS — Stripe Integration (NOT started, zero code)
**Current**: Bizu has a built-in **token balance system** (`api/models/Balance.js`, `api/server/controllers/Balance.js`, `api/models/tx.js`) that tracks token credits per user. It supports auto-refill with configurable intervals. But there is **no payment gateway** — no Stripe, no billing page, no subscription management.

**What's needed**:
- Stripe Checkout / Billing Portal integration
- Subscription plans (free, basic_cn, pro_global per the README)
- Webhook handler for `checkout.session.completed`, `customer.subscription.updated/deleted`
- Link Stripe subscription status to Bizu's balance system OR implement plan-based model access control
- Billing/subscription management page in the client UI
- Plan-based model gating (free users get limited models, paid users get more)

### 3. MODEL CONFIGURATION — DeepSeek/Chinese Models via OpenRouter
**Current**: The `bizu.example.yaml` has OpenRouter configured as a custom endpoint. DeepSeek pricing is already in `api/models/tx.js`. The infrastructure exists.

**What's needed**:
- Create a production `bizu.yaml` with the exact models you want to offer
- Configure model tiers per plan (free = DeepSeek-V3 only, basic_cn = all Chinese models, pro = global models)
- Set up the `OPENROUTER_KEY` environment variable
- Potentially simplify the model selector UI to hide endpoints and just show models

### 4. UI SIMPLIFICATION (partially planned, NOT done)
Per the README "Phase 2" roadmap, these need to be hidden:
- Agents panel
- Image generation
- File uploads (or limit to paid)
- Presets
- Audio/TTS/STT
- Assistants

**What's needed**: Update `bizu.yaml` interface config:
```yaml
interface:
  agents: false
  presets: false
  prompts: false
  bookmarks: false
  multiConvo: false
  fileSearch: false
  endpointsMenu: false  # hide multi-endpoint, just show models
  marketplace:
    use: false
```

### 5. i18n CLEANUP (started, NOT finished)
**Current**: The commit `a4b88bb` was supposed to simplify i18n but all 30+ language files still exist and are imported. This bloats the client bundle significantly.

**What's needed**:
- Remove all locale directories except `en/` (fallback) and `pt-BR/`
- Simplify `client/src/locales/i18n.ts` to only import these two
- Set default language to `pt-BR` instead of browser detection
- Remove language selector from settings UI

### 6. BRANDING
**Current**: Still says "Bizu" everywhere — app title, docker containers, terms of service, welcome message, help URL.

**What's needed**:
- Update `.env`: `APP_TITLE=Bizu`
- Update `bizu.yaml`: custom welcome message, privacy policy, terms of service URLs
- Replace logo/favicon in `client/public/`
- Update `HELP_AND_FAQ_URL`

### 7. DEPLOYMENT & INFRASTRUCTURE
**Current**: Docker Compose with MongoDB + MeiliSearch + PgVector + RAG API.

**What's needed for production**:
- Decide hosting: VPS (Hetzner/DigitalOcean are cheap), or cloud (AWS/GCP)
- Set up domain and SSL (Caddy or nginx + Let's Encrypt)
- Secure MongoDB (currently `--noauth`!)
- Set production environment variables (real JWT secrets, not the example ones)
- Set up `.env` from `.env.example` with real values
- Consider Redis for session storage in production
- Backup strategy for MongoDB

### 8. ENVIRONMENT VARIABLES (critical for launch)
These must be set with real values:
- `OPENROUTER_KEY` — for model API calls
- `JWT_SECRET` and `JWT_REFRESH_SECRET` — generate new ones, the example ones are public
- `CREDS_KEY` and `CREDS_IV` — same, generate new ones
- `MEILI_MASTER_KEY` — generate a real one
- `MONGO_URI` — secure connection string
- `DOMAIN_CLIENT` and `DOMAIN_SERVER` — your actual domain
- `APP_TITLE=Bizu`
- Email config for password reset (if enabling)

---

## Features You Can Remove Entirely (to simplify codebase)

These exist in Bizu but aren't needed for Bizu v1:
- **Plugins system** (`api/server/routes/plugins.js`) — complex, not needed
- **Assistants API** — OpenAI-specific, not needed for OpenRouter
- **Azure OpenAI** — not needed
- **AWS Bedrock** — not needed
- **LDAP/SAML/OpenID auth** — not needed for consumer product
- **SharePoint integration** — enterprise feature
- **MCP servers** — advanced, not needed for v1
- **E2E tests** (already noted for removal)
- **Helm charts** — Kubernetes, overkill for v1
- **RAG system** — nice-to-have but complex, remove for v1

---

## Suggested Launch Sequence

### Phase 1: Minimum Viable Product (launch-ready)
1. Clean up i18n (keep only pt-BR + en fallback)
2. Brand everything as "Bizu" (titles, logos, welcome, ToS)
3. Configure `bizu.yaml` with DeepSeek models via OpenRouter
4. Disable unnecessary UI features (agents, assistants, presets, etc.)
5. Set up production `.env` with real secrets
6. Secure Docker deployment (MongoDB auth, SSL)
7. Test the basic chat flow end-to-end

### Phase 2: Monetization
8. Integrate Stripe (subscriptions + webhook)
9. Implement plan-based model gating
10. Build simple pricing/billing page
11. Connect Stripe to balance system

### Phase 3: Polish
12. Remove unused code (plugins, assistants, Azure, Bedrock, etc.)
13. Custom landing page / onboarding
14. Analytics (already has GTM support)
15. Error monitoring (Sentry or similar)

---

## Architecture Summary

```
bizu-chat/
├── api/                    # Express.js backend (Node.js)
│   ├── server/            # Routes, controllers, middleware
│   ├── models/            # MongoDB models (Mongoose)
│   ├── strategies/        # Auth strategies (local, social, LDAP, etc.)
│   └── lib/               # Core business logic
├── client/                # React frontend (Vite)
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── locales/       # i18n translations
│   │   └── hooks/         # React hooks
│   └── public/            # Static assets
├── packages/              # Shared packages (monorepo)
│   ├── data-provider/     # API client, types, schemas
│   ├── data-schemas/      # Zod schemas
│   ├── api/               # Shared API utilities
│   └── client/            # Shared client utilities
├── config/                # CLI scripts (user management, balance)
├── docker-compose.yml     # Dev Docker setup
├── deploy-compose.yml     # Production Docker setup
└── bizu.example.yaml # Model/feature configuration
```

**Database**: MongoDB (conversations, users, messages, balances, transactions)
**Search**: MeiliSearch (conversation search)
**Vector DB**: PostgreSQL + pgvector (RAG, can be removed for v1)
**Auth**: JWT + refresh tokens, stored in MongoDB
**AI Models**: Via OpenRouter (OpenAI-compatible API)
