# Deploying LibreChat to Vercel (Frontend + Backend)

This repo now includes a serverless wrapper and a `vercel.json` so you can host **both** the frontend (Vite `client`) and the backend (Express API) on Vercel.

## What I added ✅
- `api/[...slug].js` — single catch-all Vercel Serverless Function that forwards requests to an Express app
- `api/server/vercel-app.js` — a lightweight `createApp()` initializer for serverless usage (no `app.listen()`)
- `vercel.json` — build rules & routes mapping
- Added dependency: `serverless-http` in root `package.json`

## Before you deploy — required environment variables
Set the following **Environment Variables** in the Vercel dashboard (Project Settings → Environment Variables):

- `MONGO_URI` (required)
- `CREDS_KEY` (required)
- `CREDS_IV` (required)
- `JWT_SECRET` and `JWT_REFRESH_SECRET` (required for auth)
- `OPENAI_API_KEY` or other AI provider keys (if using chat features)
- `MEILI_HOST` and `MEILI_MASTER_KEY` if `SEARCH=true`
- Any other envs from your `.env` used in runtime

**Security tip:** Use Vercel secrets (Environment Variables) or integrate **Azure Key Vault** / secret provider for production.

## How it works
- Frontend (`/client`) is built as a static site (Vercel `@vercel/static-build`) and served from `/client/dist`
- Backend requests under `/api/*` are routed to the serverless entry `api/[...slug].js`, which lazy-initializes an Express app using `api/server/vercel-app.js`

## Local testing
- You can still run backend locally with `npm run backend` (it starts a full server)
- To run the serverless behaviour locally, install the Vercel CLI and run:
  - `npm i -g vercel`
  - `vercel dev`

## Notes and caveats
- Some background/cluster features (the `cluster` multi-worker mode) and long-running tasks are not applicable in serverless; the wrapper uses a lightweight initialization path.
- Cold starts may occur — connections are cached across warm invocations (DB uses cached global connection), but expect occasional initialization overhead.
- Static SPA fallback is not served by the serverless functions — the static build serves the frontend.

If you want, I can:
1. Create a short GitHub Actions workflow or README snippet to automate the Vercel GitHub Integration steps, or
2. Help you set environment variables on your Vercel project and run the first deployment.

Tell me which next step you want me to do. — GitHub Copilot
