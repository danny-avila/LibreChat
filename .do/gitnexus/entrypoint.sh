#!/bin/sh
set -e

# Cap Node heap below the container's cgroup limit (1792m in compose),
# leaving room for @ladybugdb/core's C++ heap and OS overhead. Native
# allocations happen outside V8's view, so a slim V8 budget is the only
# thing between a heavy query and a cgroup OOM-kill. Without this cap,
# gitnexus defaults to --max-old-space-size=8192 and reserves memory
# the container doesn't have.
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1280}"

# Register every index mounted under /indexes/<name>/.gitnexus/.
# This is idempotent — re-registering an existing repo updates the
# metadata pointer without touching the index data.
#
# Registration failure handling:
#   - main (LibreChat) and dev (LibreChat-dev) are critical. If either
#     fails to register, exit 1 so docker marks the container unhealthy
#     and the deploy workflow's readiness check surfaces the error.
#   - PR indexes (LibreChat-pr-*) are best-effort. A corrupt PR index
#     shouldn't take the whole server down.
if [ -d /indexes ]; then
  for dir in /indexes/*/; do
    [ -d "$dir" ] || continue
    name=$(basename "$dir")
    [ -d "$dir.gitnexus" ] || continue
    echo "Registering index: $name"
    if ! gitnexus index "$dir" --allow-non-git; then
      case "$name" in
        LibreChat|LibreChat-dev)
          echo "ERROR: failed to register critical index $name" >&2
          exit 1
          ;;
        *)
          echo "WARN: failed to register PR index $name — skipping" >&2
          ;;
      esac
    fi
  done
else
  echo "WARN: /indexes directory not mounted" >&2
fi

# Bind 0.0.0.0 inside the container so Caddy (in a separate container
# on the same docker network) can reach gitnexus at gitnexus:4747.
# docker-compose.yml intentionally does NOT expose port 4747 on the
# host — only Caddy's 80/443 are published.
exec gitnexus serve --host 0.0.0.0 --port 4747
