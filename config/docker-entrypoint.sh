#!/bin/sh
set -e

# Handle relative paths - convert to absolute if needed
if [ -n "$METHODOLOGY_DIR" ]; then
  case "$METHODOLOGY_DIR" in
    /*) ;; # Already absolute
    *) METHODOLOGY_DIR="/app/$METHODOLOGY_DIR" ;; # Make absolute
  esac
fi

# Optional: Run init-runpod-agent.js if METHODOLOGY_DIR is set
if [ -n "$METHODOLOGY_DIR" ] && [ -d "$METHODOLOGY_DIR" ]; then
  echo "METHODOLOGY_DIR is set to: $METHODOLOGY_DIR"

  # Wait for RAG API to be ready (with timeout)
  if [ -n "$RAG_API_URL" ]; then
    echo "Waiting for RAG API at $RAG_API_URL..."
    ATTEMPTS=0
    MAX_ATTEMPTS=60
    until curl -sf "$RAG_API_URL/health" > /dev/null 2>&1; do
      ATTEMPTS=$((ATTEMPTS + 1))
      if [ $ATTEMPTS -ge $MAX_ATTEMPTS ]; then
        echo "Warning: RAG API not ready after ${MAX_ATTEMPTS} attempts, skipping agent init"
        break
      fi
      echo "  RAG API not ready (attempt $ATTEMPTS/$MAX_ATTEMPTS), waiting..."
      sleep 5
    done

    if [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; then
      echo "RAG API is ready!"
      echo "Running init-runpod-agent.js..."
      node /app/config/init-runpod-agent.js || {
        echo "Warning: init-runpod-agent.js failed, continuing with server startup"
      }
    fi
  else
    echo "RAG_API_URL not set, skipping agent initialization"
  fi
else
  echo "METHODOLOGY_DIR not set or doesn't exist, skipping agent initialization"
fi

# Start the main application
echo "Starting LibreChat API server..."
exec node server/index.js
