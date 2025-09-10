#!/bin/sh
set -eu

APP_DIR="/app"
DB_PATH="/data/db"
LOG_DIR="$APP_DIR/api/logs"
IMAGES_DIR="$APP_DIR/client/public/images"
UPLOADS_DIR="$APP_DIR/uploads"

mkdir -p "$DB_PATH" "$LOG_DIR" "$IMAGES_DIR" "$UPLOADS_DIR"

# Ensure correct ownership for the node user when running as root
if [ "$(id -u)" = "0" ]; then
  chown -R node:node "$DB_PATH" "$LOG_DIR" "$IMAGES_DIR" "$UPLOADS_DIR"
  exec gosu node "$0" "$@"
fi

export HOST=${HOST:-0.0.0.0}

# Auto-detect Ollama if not provided
if [ -z "${OLLAMA_BASE_URL:-}" ]; then
  for url in \
    "http://ollama:11434" \
    "http://host.docker.internal:11434" \
    "http://127.0.0.1:11434"; do
    if curl -fsS --max-time 2 "$url/api/tags" >/dev/null 2>&1; then
      export OLLAMA_BASE_URL="$url"
      echo "[entrypoint] Detected Ollama at $url" >&2
      break
    fi
  done
  # Try common Docker bridge gateways (Linux)
  if [ -z "${OLLAMA_BASE_URL:-}" ]; then
    for gw in 172.17.0.1 172.18.0.1; do
      url="http://$gw:11434"
      if curl -fsS --max-time 2 "$url/api/tags" >/dev/null 2>&1; then
        export OLLAMA_BASE_URL="$url"
        echo "[entrypoint] Detected Ollama at $url" >&2
        break
      fi
    done
  fi
  # Detect default gateway via /proc/net/route if still not found
  if [ -z "${OLLAMA_BASE_URL:-}" ] && [ -r /proc/net/route ]; then
    GW_HEX=$(awk '$2=="00000000" {print $3; exit}' /proc/net/route || true)
    if [ -n "$GW_HEX" ]; then
      GW_IP=$(printf '%s' "$GW_HEX" | python3 - <<'PY'
import sys
gw_hex = sys.stdin.read().strip()
if gw_hex:
    parts = [str(int(gw_hex[i:i+2], 16)) for i in (6,4,2,0)]
    print('.'.join(parts))
PY
)
      if [ -n "$GW_IP" ]; then
        url="http://$GW_IP:11434"
        if curl -fsS --max-time 2 "$url/api/tags" >/dev/null 2>&1; then
          export OLLAMA_BASE_URL="$url"
          echo "[entrypoint] Detected Ollama at $url" >&2
        fi
      fi
    fi
  fi
fi

# If no MONGO_URI provided, start embedded mongod and set it
if [ -z "${MONGO_URI:-}" ]; then
  echo "[entrypoint] No MONGO_URI provided, starting embedded MongoDB at ${DB_PATH}" >&2
  # Start mongod in the background
  mongod --dbpath "$DB_PATH" --bind_ip 127.0.0.1 --port 27017 --noauth --fork \
    --logpath "$LOG_DIR/mongod.log" --logappend

  export MONGO_URI="mongodb://127.0.0.1:27017/LibreChat"

  # Graceful shutdown for mongod
  _shutdown() {
    echo "[entrypoint] Shutting down..." >&2
    mongod --shutdown --dbpath "$DB_PATH" >/dev/null 2>&1 || true
  }
  trap _shutdown TERM INT EXIT
fi

echo "[entrypoint] Starting LibreChat backend..." >&2
exec npm run backend
