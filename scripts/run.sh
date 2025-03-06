#!/bin/bash

GIT_ROOT=$(git rev-parse --show-toplevel)
BACKEND_PORT=${PORT:-3080}
FRONTEND_PORT=${FRONTEND_PORT:-3090}

source "${GIT_ROOT}/.env"

kill_port() {
  local port=$1
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    lsof -ti "tcp:$port" | xargs kill -9
  else
    # Linux
    fuser -k "$port/tcp"
  fi
}

# Check if an argument is provided
if [ $# -eq 0 ]; then
  echo "Usage: $0 <backend|frontend>"
  exit 1
fi

source "${GIT_ROOT}/.env"

case "$1" in
backend)
  echo "Stopping backend ..."
  kill_port "$BACKEND_PORT"
  echo "Starting backend ..."
  PORT="$BACKEND_PORT" npm run backend:dev
  ;;
frontend)
  echo "Stopping frontend ..."
  kill_port "$FRONTEND_PORT"
  echo "Building data-provider ..."
  npm run build:data-provider
  echo "Starting frontend ..."
  PORT="$FRONTEND_PORT" npm run frontend:dev
  ;;
*)
  echo "Invalid argument. Use 'backend' or 'frontend'."
  exit 1
  ;;
esac
