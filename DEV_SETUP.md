# Development Setup — Run Frontend & Backend Together

## Quick Start (One Command)

Run both the backend (Express server on port 3080) and frontend (Vite dev server on port 3090) together with a single command:

```bash
npm run dev
```

This uses `concurrently` to spawn:
- **Backend**: `npm run backend:dev` — Node.js server with auto-reload (nodemon)
- **Frontend**: `npm run frontend:dev` — Vite dev server with HMR

---

## What happens

1. Backend starts on `http://localhost:3080`
2. Frontend dev server starts on `http://localhost:3090`
3. **Frontend is configured to proxy API calls** to backend via Vite proxy rules:
   - `/api/*` → proxied to `http://localhost:3080/api/*`
   - `/oauth/*` → proxied to `http://localhost:3080/oauth/*`

---

## Access the app

Open your browser to:
- **Frontend**: [`http://localhost:3090`](http://localhost:3090) (or the port Vite assigns if 3090 is busy)

All API calls from the browser will automatically go to the backend running on port 3080.

---

## Stop everything

Press `Ctrl+C` in the terminal. `--kill-others` flag ensures both processes terminate.

---

## Individual commands (if needed)

- **Backend only**: `npm run backend:dev`
- **Frontend only**: `npm run frontend:dev`

---

## Environment

Both backend and frontend read from the root `.env` file:
- Frontend uses vars prefixed with `VITE_`, `SCRIPT_`, `DOMAIN_`, `ALLOW_`
- Backend uses all vars (MONGO_URI, JWT_SECRET, CREDS_KEY, CREDS_IV, etc.)

Make sure your `.env` has the required values (see `.env.example` or `README.md`).

---

## Troubleshooting

- **Port 3080 or 3090 already in use?** Change in `.env`:
  - `PORT=3090` (frontend)
  - `BACKEND_PORT=3080` (backend, read by Vite)
  
- **Vite proxy not working?** Check `client/vite.config.ts` — the proxy is configured for `/api` and `/oauth`.

- **Backend won't start?** Ensure MongoDB is running and `MONGO_URI` is set in `.env`.

---

Enjoy! 🎉
