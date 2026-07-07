#!/usr/bin/env bash
# Starts backend + frontend dev servers bound to 0.0.0.0 so other devices on
# the LAN can reach them. Backend gets HOST=0.0.0.0 via env; frontend gets
# --host 0.0.0.0 via CLI flag only (not env), because vite.config.ts also
# reads process.env.HOST to build the dev-proxy target for /api and /oauth —
# setting that env var to 0.0.0.0 would break the proxy's connection back to
# the backend on the same machine.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BACKEND_PORT="${PORT:-3080}"
FRONTEND_PORT="${CLIENT_PORT:-3090}"

LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"

pids=()
cleanup() {
  trap - INT TERM EXIT
  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

HOST=0.0.0.0 npm run backend:dev &
pids+=("$!")

(cd client && npm run dev -- --host 0.0.0.0) &
pids+=("$!")

echo ""
echo "Backend:  http://localhost:${BACKEND_PORT}"
echo "Frontend: http://localhost:${FRONTEND_PORT}"
if [ -n "$LAN_IP" ]; then
  echo "LAN access: http://${LAN_IP}:${FRONTEND_PORT}"
fi
echo ""

wait
