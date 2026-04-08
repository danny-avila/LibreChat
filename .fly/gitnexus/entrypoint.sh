#!/bin/sh
set -e

if [ -z "$API_TOKEN" ]; then
  echo "ERROR: API_TOKEN secret is not set."
  echo "Run: flyctl secrets set API_TOKEN=<your-token>"
  exit 1
fi

# Start gitnexus serve in background
gitnexus serve --host 127.0.0.1 --port 4747 &

# Start caddy auth proxy in foreground
exec caddy run --config /etc/caddy/Caddyfile
