#!/bin/sh
set -eu

invalid_id="librechat-mongo-invalid-config-$$"
invalid_container="${invalid_id}-db"
invalid_network="${invalid_id}-network"
invalid_volume="${invalid_id}-data"
invalid_script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

cleanup() {
  docker rm -f "$invalid_container" >/dev/null 2>&1 || true
  docker network rm "$invalid_network" >/dev/null 2>&1 || true
  docker volume rm "$invalid_volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

run_client() {
  docker run --rm --network "$invalid_network" mongo:8.0.20 mongosh --quiet "$@"
}

docker network create "$invalid_network" >/dev/null
docker volume create "$invalid_volume" >/dev/null
docker run -d \
  --name "$invalid_container" \
  --network "$invalid_network" \
  --network-alias mongodb \
  --network-alias wrong-mongodb \
  -v "$invalid_volume:/data/db" \
  mongo:8.0.20 mongod --noauth --replSet rs0 --bind_ip_all >/dev/null

invalid_attempt=0
until run_client --host mongodb:27017 --eval 'db.adminCommand({ ping: 1 })' >/dev/null 2>&1; do
  invalid_attempt=$((invalid_attempt + 1))
  if [ "$invalid_attempt" -ge 60 ]; then
    echo 'MongoDB did not accept connections within 60 seconds' >&2
    exit 1
  fi
  sleep 1
done

run_client --host mongodb:27017 --eval \
  "rs.initiate({_id:'rs0',members:[{_id:0,host:'wrong-mongodb:27017'}]})" >/dev/null

invalid_attempt=0
until run_client --host wrong-mongodb:27017 --eval \
  "const status=db.adminCommand({isMaster:1}); quit(status.ismaster?0:1)" >/dev/null 2>&1; do
  invalid_attempt=$((invalid_attempt + 1))
  if [ "$invalid_attempt" -ge 60 ]; then
    echo 'Wrong-host replica set did not elect a primary within 60 seconds' >&2
    exit 1
  fi
  sleep 1
done

if invalid_output=$(docker run --rm \
  --network "$invalid_network" \
  -v "$invalid_script_dir/init-replica-set.js:/scripts/init-replica-set.js:ro" \
  -v "$invalid_script_dir/init-replica-set.sh:/scripts/init-replica-set.sh:ro" \
  -v "$invalid_script_dir/replica-set-config.js:/scripts/replica-set-config.js:ro" \
  --entrypoint /bin/sh \
  mongo:8.0.20 /scripts/init-replica-set.sh 2>&1); then
  echo 'Initializer accepted an unsupported persisted replica-set address' >&2
  exit 1
fi

case "$invalid_output" in
  *"Expected the bundled MongoDB member 'mongodb:27017', found 'wrong-mongodb:27017'"*) ;;
  *)
    echo "$invalid_output" >&2
    echo 'Initializer did not report the unsupported persisted address' >&2
    exit 1
    ;;
esac

run_client --host wrong-mongodb:27017 --eval \
  "const config=rs.conf(); if(config.members.length!==1||config.members[0].host!=='wrong-mongodb:27017'){throw new Error('initializer rewrote unknown state')}" \
  >/dev/null

echo 'MongoDB initializer rejected the persisted wrong-host configuration without reconfiguration'
