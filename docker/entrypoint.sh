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
