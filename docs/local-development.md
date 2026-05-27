# Local Development Guide

Run MongoDB and Meilisearch in Docker while developing the API and UI on the host with hot reload.

## Prerequisites

- Node.js v20.19.0+ or ^22.12.0 or >= 23.0.0
- Docker & Docker Compose
- A `.env` file at the project root (copy from `.env.example`)

## 1. Start infrastructure services

```bash
docker compose -f docker-compose.local.yml up -d
```

This starts:
- **MongoDB** on `localhost:27017`
- **Meilisearch** on `localhost:7700`

To also start the RAG API + vector DB:

```bash
docker compose -f docker-compose.local.yml --profile rag up -d
```

## 2. Configure `.env`

Minimum required values for local development:

```env
MONGO_URI=mongodb://127.0.0.1:27017/LibreChat
DOMAIN_CLIENT=http://localhost:3090
DOMAIN_SERVER=http://localhost:3080
SUPER_ADMIN_EMAIL=your@email.com
```

If Meilisearch is running, also set:

```env
MEILI_HOST=http://localhost:7700
MEILI_MASTER_KEY=your_master_key
```

## 3. Install dependencies

```bash
npm run smart-reinstall
```

Use `npm run reinstall` for a clean wipe + reinstall from scratch.

## 4. Start the backend (with hot reload)

```bash
npm run backend:dev
```

The API server starts on `http://localhost:3080` and restarts automatically on file changes via nodemon.

To start with the Node.js inspector attached:

```bash
npm run backend:inspect
```

## 5. Start the frontend (with HMR)

In a separate terminal:

```bash
npm run frontend:dev
```

The Vite dev server starts on `http://localhost:3090` with Hot Module Replacement. Requires the backend to be running first.

## 6. Rebuild compiled packages after changes

If you change code in `packages/data-provider`, `packages/data-schemas`, `packages/api`, or `packages/client`, rebuild before the backend picks up the changes:

```bash
npm run build:data-provider   # packages/data-provider only
npm run build:data-schemas    # packages/data-schemas only
npm run build:api             # packages/api only
npm run build                 # all packages via Turborepo (parallel, cached)
```

## 7. Stop infrastructure

```bash
docker compose -f docker-compose.local.yml down
```

## Useful scripts

| Command | Description |
|---|---|
| `npm run backend:dev` | Backend with nodemon hot reload |
| `npm run frontend:dev` | Frontend Vite dev server (port 3090) |
| `npm run backend` | Backend in production mode |
| `npm run build` | Build all packages (Turborepo) |
| `npm run smart-reinstall` | Install deps + build if lockfile changed |
| `npm run reinstall` | Clean wipe + reinstall from scratch |
| `npm run create-user` | Create a user from the CLI |
| `npm run invite-user` | Send an invite email from the CLI |
| `npm run list-users` | List all users |
| `npm run reset-password` | Reset a user's password |
| `npm run flush-cache` | Clear the application cache |
