#!/bin/sh
set -eu

smoke_id="librechat-mongo-migration-$$"
smoke_container="${smoke_id}-db"
smoke_network="${smoke_id}-network"
smoke_volume="${smoke_id}-data"
smoke_script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
smoke_server_image=${MONGO_SERVER_IMAGE:-mongo:8.0.20}

cleanup() {
  docker rm -f "$smoke_container" >/dev/null 2>&1 || true
  docker network rm "$smoke_network" >/dev/null 2>&1 || true
  docker volume rm "$smoke_volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

wait_for_mongo() {
  smoke_attempt=0
  until run_healthcheck >/dev/null 2>&1; do
    if [ "$(docker inspect --format '{{.State.Running}}' "$smoke_container")" != 'true' ]; then
      docker logs "$smoke_container" >&2
      echo 'MongoDB exited before accepting connections' >&2
      return 1
    fi
    smoke_attempt=$((smoke_attempt + 1))
    if [ "$smoke_attempt" -ge 60 ]; then
      echo 'MongoDB did not accept connections within 60 seconds' >&2
      return 1
    fi
    sleep 1
  done
}

run_healthcheck() {
  docker exec "$smoke_container" /bin/sh -c \
    "shell=mongosh; command -v mongosh >/dev/null 2>&1 || shell=mongo; \$shell --quiet --host mongodb:27017 --eval 'const status = db.adminCommand({ isMaster: 1 }); quit(status.ismaster ? 0 : 1)'"
}

run_client() {
  docker run --rm \
    --network "$smoke_network" \
    -v "$smoke_script_dir/verify-migration.js:/scripts/verify-migration.js:ro" \
    mongo:8.0.20 mongosh --quiet "$@"
}

stop_mongo() {
  docker stop --time 30 "$smoke_container" >/dev/null
  docker rm "$smoke_container" >/dev/null
}

run_initializer() {
  docker run --rm \
    --network "$smoke_network" \
    -v "$smoke_script_dir/init-replica-set.js:/scripts/init-replica-set.js:ro" \
    -v "$smoke_script_dir/init-replica-set.sh:/scripts/init-replica-set.sh:ro" \
    -v "$smoke_script_dir/replica-set-config.js:/scripts/replica-set-config.js:ro" \
    --entrypoint /bin/sh \
    mongo:8.0.20 /scripts/init-replica-set.sh
}

docker network create "$smoke_network" >/dev/null
docker volume create "$smoke_volume" >/dev/null

docker run -d \
  --name "$smoke_container" \
  --network "$smoke_network" \
  --network-alias mongodb \
  -v "$smoke_volume:/data/db" \
  "$smoke_server_image" mongod --noauth --bind_ip_all >/dev/null
wait_for_mongo
run_client --host mongodb:27017 --eval \
  "db.getSiblingDB('LibreChat').migration_probe.insertOne({_id:'preserved',value:42})" >/dev/null
stop_mongo

docker run -d \
  --name "$smoke_container" \
  --network "$smoke_network" \
  --network-alias mongodb \
  -v "$smoke_volume:/data/db" \
  -v "$smoke_script_dir/verify-migration.js:/scripts/verify-migration.js:ro" \
  "$smoke_server_image" mongod --noauth --replSet rs0 --bind_ip_all >/dev/null
run_initializer
run_initializer
run_healthcheck >/dev/null
run_client \
  'mongodb://mongodb:27017/LibreChat?replicaSet=rs0' \
  /scripts/verify-migration.js >/dev/null
stop_mongo

docker run -d \
  --name "$smoke_container" \
  --network "$smoke_network" \
  --network-alias mongodb \
  -v "$smoke_volume:/data/db" \
  "$smoke_server_image" mongod --noauth --bind_ip_all >/dev/null
wait_for_mongo
run_client --host mongodb:27017 --eval \
  "const marker=db.getSiblingDB('LibreChat').migration_probe.findOne({_id:'preserved'}); if(marker?.value!==42){throw new Error('rollback lost existing data')}" \
  >/dev/null
stop_mongo

echo 'MongoDB standalone upgrade, idempotent initialization, transaction, and rollback verified'
