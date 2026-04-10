#!/bin/sh
set -e

if [ -z "$API_TOKEN" ]; then
  echo "ERROR: API_TOKEN secret is not set."
  echo "Run: flyctl secrets set API_TOKEN=<your-token>"
  exit 1
fi

# Cap Node heap to match the Fly machine (leaves headroom for Caddy + OS).
# Without this, gitnexus defaults to --max-old-space-size=8192 which over-commits
# and gets killed by the OOM killer on small machines.
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=768}"

# Start gitnexus serve in background, pipe output to stdout/stderr
gitnexus serve --host 127.0.0.1 --port 4747 2>&1 &
GITNEXUS_PID=$!

# Wait for gitnexus to be ready (up to 30s)
echo "Waiting for gitnexus serve to start..."
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:4747/api/info > /dev/null 2>&1; then
    echo "gitnexus serve is ready (pid $GITNEXUS_PID)"
    break
  fi
  # Check if process died
  if ! kill -0 "$GITNEXUS_PID" 2>/dev/null; then
    echo "ERROR: gitnexus serve exited prematurely"
    exit 1
  fi
  sleep 1
done

# Final check
if ! curl -sf http://127.0.0.1:4747/api/info > /dev/null 2>&1; then
  echo "ERROR: gitnexus serve failed to start within 30s"
  exit 1
fi

# Start caddy auth proxy in foreground
exec caddy run --config /etc/caddy/Caddyfile
