#!/bin/sh
set -eu

attempt=0
until mongosh --quiet --host mongodb:27017 --eval 'db.adminCommand({ ping: 1 })' >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 120 ]; then
    echo 'MongoDB did not accept connections within 120 seconds' >&2
    exit 1
  fi
  sleep 1
done

exec mongosh --quiet --host mongodb:27017 /scripts/init-replica-set.js
