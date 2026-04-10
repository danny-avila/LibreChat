#!/bin/sh
set -e

# Cap Node heap to match the container's memory limit, leaving headroom
# for Caddy and the OS. Without this, gitnexus defaults to 8GB which
# over-commits and gets killed by the OOM killer on small machines.
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}"

# Register every index mounted under /indexes/<name>/.gitnexus/.
# This is idempotent — re-registering an existing repo updates the
# metadata pointer without touching the index data.
if [ -d /indexes ]; then
  for dir in /indexes/*/; do
    [ -d "$dir" ] || continue
    name=$(basename "$dir")
    if [ -d "$dir.gitnexus" ]; then
      echo "Registering index: $name"
      gitnexus index "$dir" --allow-non-git || echo "WARN: failed to register $name"
    fi
  done
else
  echo "WARN: /indexes directory not mounted"
fi

# Serve on 127.0.0.1 is wrong here — inside a docker container the
# reverse proxy (Caddy) lives in a separate container and reaches
# gitnexus over the docker network. Bind 0.0.0.0 but DO NOT expose
# port 4747 on the host in docker-compose.yml — only Caddy is exposed.
exec gitnexus serve --host 0.0.0.0 --port 4747
