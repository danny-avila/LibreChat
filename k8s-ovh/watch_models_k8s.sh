#!/bin/bash
set -eu

AUTH_HEADER="Authorization: Bearer ${LITELLM_MASTER_KEY:-}"
LITELLM_MODELS_URL="${LITELLM_MODELS_URL:-http://litellm:8000/v1/models}"
CHECK_EVERY="${CHECK_EVERY:-15}"
NAMESPACE="${NAMESPACE:-librechat}"
DEPLOYMENT="${DEPLOYMENT:-librechat-api}"

hash_models() {
  curl -sf -H "$AUTH_HEADER" "$LITELLM_MODELS_URL" | sha256sum | awk '{print $1}'
}

restart_deployment() {
  echo "🔄 Restarting deployment $DEPLOYMENT in namespace $NAMESPACE..."
  # Use kubectl to restart the deployment
  kubectl rollout restart deployment/"$DEPLOYMENT" -n "$NAMESPACE"
}

# Wait until LiteLLM is reachable
echo "⏳ Waiting for LiteLLM models endpoint at $LITELLM_MODELS_URL..."
until current="$(hash_models)"; do
  echo "Waiting for LiteLLM..."
  sleep 5
done
last="$current"
echo "✅ Initial models hash: $last"
echo "👀 Watching for changes every $CHECK_EVERY seconds..."

while true; do
  sleep "$CHECK_EVERY"
  if current="$(hash_models)"; then
    if [ "$current" != "$last" ]; then
      echo "🚨 Models changed ($last -> $current). Triggering restart..."
      restart_deployment || echo "❌ Restart failed."
      last="$current"
    fi
  else
    echo "⚠️ Could not reach models endpoint; will retry."
  fi
done
