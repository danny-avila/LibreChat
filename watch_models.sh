#!/usr/bin/env sh
set -eu

AUTH_HEADER="Authorization: Bearer ${LITELLM_MASTER_KEY:-}"
LITELLM_MODELS_URL="${LITELLM_MODELS_URL:-http://litellm:8000/v1/models}"
CHECK_EVERY="${CHECK_EVERY:-15}"
TARGET_CONTAINER="${TARGET_CONTAINER:-LibreChat-API}"  # use your container_name

hash_models() {
  curl -sf -H "$AUTH_HEADER" "$LITELLM_MODELS_URL" | sha256sum | awk '{print $1}'
}

restart_api() {
  # Try docker restart by container name
  docker restart "$TARGET_CONTAINER" && return 0

  # Fallback to Docker Engine API via the socket (no docker CLI features required)
  curl --fail --silent --unix-socket /var/run/docker.sock \
    -X POST "http://localhost/containers/${TARGET_CONTAINER}/restart" && return 0

  echo "Failed to restart $TARGET_CONTAINER" >&2
  return 1
}

# Wait until LiteLLM is reachable
until current="$(hash_models)"; do
  echo "Waiting for LiteLLM models endpoint..."
  sleep 2
done
last="$current"
echo "Initial models hash: $last"

while true; do
  sleep "$CHECK_EVERY"
  if current="$(hash_models)"; then
    if [ "$current" != "$last" ]; then
      echo "Models changed ($last -> $current). Restarting ${TARGET_CONTAINER}..."
      restart_api || echo "Restart failed."
      last="$current"
    fi
  else
    echo "Could not reach models endpoint; will retry."
  fi
done
