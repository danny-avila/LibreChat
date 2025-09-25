_public_

# GovAI / LibreChat – quick run cheatsheet

For every mode below you need **two tiny setup steps first** – they are identical in all cases:

```bash
# 1  Environment file
cp govai.env.example .env          # used by both compose and local dev

# 2  Generated but empty YAML overlays – tracked by .gitignore
cp librechat.merged.example.yaml librechat.merged.yaml     # ← stays empty on first run
cp admin-overrides.example.yaml admin-overrides.yaml       # ← stays empty on first run
cp librechat.example.yaml librechat.yaml
```

Now open `.env` and set at minimum:

```dotenv
# core runtime
CONFIG_PATH="librechat.merged.yaml"
LIBRECHAT_TAG=feat-adminpanel_ui_improvements   # or any tag you built/pulled

# AI provider (used by chat UI **and** RAG embeddings)
OPENAI_API_KEY=<your-openai-key>
# …or ANTHROPIC_API_KEY / GOOGLE_KEY …
# …or a custom endpoint like UbiOps (see the librechat.example.yaml)
EMBEDDINGS_PROVIDER=ollama
EMBEDDINGS_MODEL=nomic-embed-text
```
---

## 1  Production stack (pre-built image)

```bash
# 0  (one-time) authenticate with GitHub Container Registry
# export a fine-grained PAT that has `read:packages` scope
docker login ghcr.io

# pull a tagged API image built by CI
docker compose -f docker-compose.prod.yml pull

# start with production compose
docker compose -f docker-compose.prod.yml up -d
```

Mounts declared in `docker-compose.prod.yml` map the two YAML files as writable bind mounts so runtime updates persist to the host.

---

That’s all – choose the mode that fits your workflow, ensure the two env vars (`CONFIG_PATH`, `LIBRECHAT_TAG`) and an AI key are present, and LibreChat / GovAI is ready to chat and embed documents.

Probably running at http://localhost:3080 if you did not change the config.

The Admin panel is reachable from the account settings in the bottom left of the main application. 

## 2  Dev mode (code on host, services in Docker)

Spin up the required backing services once:

```bash
docker compose -f docker-compose.dev.yml up -d  # MongoDB, MeiliSearch, RAG, etc.

# Ollama users – one-time (per machine) pull of the Nomic embed model
docker compose exec ollama ollama pull nomic-embed-text
```

Then, in your working tree:

```bash
# install & build shared workspaces
npm i
npm run build:data-provider && npm run build:data-schemas && npm run build:api

# build the GovAI admin package & admin frontend
cd packages/librechat-admin && npm run build
cd ../../admin-frontend       && npm run build
cd ..                         # back to repo root

# launch backend with hot-reload
npm run backend:dev

# (optional) second terminal – live-reload React client
npm run frontend:dev           # http://localhost:3090
```

The `docker-compose.dev.yml` stack exposes the same ports as the local and prod stacks, so no further configuration is required.

---

## 3  Local Docker stack (developer-friendly)

```bash
# build & start using local compose file
docker compose -f docker-compose.local.yml up --build -d

# the UI is now at http://localhost:3080
```

The stack watches `admin-overrides.yaml`; saving settings in the Admin Panel rewrites that file and regenerates `librechat.merged.yaml` automatically.

---

## Project Structure

```
GovAI/
├── api/                    # LibreChat backend (Express)
├── client/                 # Main user-facing React app
├── admin-frontend/         # React admin dashboard
├── packages/
│   ├── librechat-admin/    # Express router + admin logic
│   ├── data-provider/      # React-Query hooks & data utils
│   ├── data-schemas/       # Shared TypeScript/Zod schemas
│   └── api/                # Client-side API helpers
│   └── custom/             # Mounts additional routes (e.g. admin) into core app
├── config/                 # Configuration utilities & scripts
├── docker-compose.dev.yml  # Containers for dev services
├── docker-compose.local.yml
├── docker-compose.prod.yml
├── .env.example            # Environment template
├── librechat.yaml          # Base runtime config
└── GOVAI.md               # This quick-start guide
```

### Why three “admin” pieces?

1. **packages/custom/** – tiny entry-point loaded from `api/server/index.js`.
   It receives the Express `app` instance and mounts any custom routers
   (currently the admin router) at runtime. Keeping this in a separate
   workspace lets us inject routes without touching core LibreChat code.

2. **packages/librechat-admin/** – an independent NPM workspace that
   exposes `buildAdminRouter(requireJwtAuth)`; it contains all backend
   logic (override settings, user management, etc.).  When `custom/mount.js`
   runs, it `require`s this package and attaches the router at `/admin`.

3. **admin-frontend/** – a standalone React frontend compiled to static
   assets that headless-loads inside the `/admin` routes served by the
   router above.  Building it separately keeps the admin UI dependencies
   out of the main client bundle.

At runtime the sequence is:

1. core `api/server/index.js` → `require('custom').mount(app)`
2. `packages/custom/mount.js` locates `requireJwtAuth`, builds the admin
   router from `packages/librechat-admin`, and mounts it.
3. Requests to `/admin/*` are now handled by the router and serve the
   admin React bundle.


## Changed files:
server/index.js -> Mount point for the adminpanel
server/controller/agents/client.js -> more strong opiniation towards using the file search tool

client/src/components/Chat/Input/Files/AttachFileMenu.tsx -> hide the image upload in the UI, auto-enable file upload
client/src/components/Chat/Input/Files/ -> hide the image upload in the UI, auto-enable file upload

BadgeRowContext.tsx -> Made sure that file addition leads to activated file_search 
BadgeRowContext -> Made sure that file addition leads to activated file_search 

client/store/settings.ts -> buttons below message.
client/src/components/Messages/HoverButtons.tsx -> buttons below message.

client/src/components/Nav/SettingsTabs/Chat/Chat.tsx -> added the setttings for turning on the other options below chatmessages.

Components/Auth/AuthLayout.tsx -> larger logos for the login page

Added some languages for the new settings