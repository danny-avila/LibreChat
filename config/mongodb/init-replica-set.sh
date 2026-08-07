#!/bin/sh
set -eu

case "${MONGO_URI:-}" in
  '' | mongodb://127.0.0.1:27017/* | mongodb://localhost:27017/* | mongodb://mongodb:27017/* | mongodb://chat-mongodb:27017/*)
    ;;
  *)
    echo 'External MONGO_URI detected; skipping bundled MongoDB replica-set initialization'
    exit 0
    ;;
esac

mongo_uri='mongodb://mongodb:27017/admin?directConnection=true&serverSelectionTimeoutMS=1000&connectTimeoutMS=1000'
if ! timeout 120s sh -c '
  mongo_uri=$1
  until timeout 2s mongosh --quiet "$mongo_uri" \
    --eval "db.adminCommand({ ping: 1 })" >/dev/null 2>&1; do
    sleep 1
  done
' wait-for-mongodb "$mongo_uri"; then
  echo 'MongoDB did not accept connections within 120 seconds' >&2
  exit 1
fi

exec mongosh --quiet "$mongo_uri" /scripts/init-replica-set.js
