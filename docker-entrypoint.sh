#!/bin/sh
set -e

: "${CONFIG_PATH:=/app/librechat.yaml}"
printf '%s\n' "$LIBRECHAT_CONFIG" > "$CONFIG_PATH"

exec "$@"
