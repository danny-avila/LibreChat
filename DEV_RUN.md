# Local dev: run frontend + backend with one command

Use this to start both the backend and the frontend with a single command during local development.

## Prerequisites
- Node 18+ (recommended)
- npm (or use bun/pnpm if you prefer; default scripts assume npm)

## Steps
1. Install dependencies (root workspace will install workspaces too):

```bash
npm install
```

2. Create a local `.env` file with required variables (copy `.env.example` if present). At minimum set:
- `MONGO_URI` (local MongoDB or Atlas)
- `CREDS_KEY` and `CREDS_IV`
- `JWT_SECRET` and `JWT_REFRESH_SECRET`

3. Run the dev command:

```bash
npm run dev
```

This runs both servers concurrently:
- Backend: `npm run backend:dev` → nodemon starting `api/server/index.js` on `PORT` (default 3080)
- Frontend: `npm run frontend:dev` → Vite dev server (default port 3090)

Vite is configured to proxy `/api` and `/oauth` to the backend. If you change backend port, set `BACKEND_PORT` or `HOST` in `.env` so the proxy resolves correctly.

## Troubleshooting
- If the frontend cannot reach `/api`, ensure the backend is running and `BACKEND_PORT` matches backend `PORT`.
- Check server logs in the terminal windows for runtime errors.

If you want, I can also add an npm script that runs the servers with separate logs (e.g., `concurrently --names "API,WEB" -c "bgBlue.bold,bgGreen.bold" ...`) — tell me if you prefer colored prefixes and I’ll add it.
