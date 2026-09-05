#!/bin/sh
# Start command for Render deploys (see render.yaml).
#
# Render assigns the MongoDB private service its own internal host, port, and
# generated root password, and blueprints cannot concatenate strings, so the URI
# is assembled here from MONGO_HOSTPORT, MONGO_USERNAME, and MONGO_PASSWORD. To
# use an external database, delete the librechat-mongo service, which removes
# all three, then set MONGO_URI.
#
# Render also attaches one disk per service, while LibreChat writes user files to
# two locations (api/config/paths.js). Both are empty in the built image, so they
# are replaced with symlinks onto the disk.
set -eu

DATA_DIR=/app/data

# Generated credentials can contain characters that are not URI-safe.
uri_encode() {
  node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$1"
}

if [ -n "${MONGO_HOSTPORT:-}" ]; then
  if [ -n "${MONGO_PASSWORD:-}" ]; then
    credentials="$(uri_encode "${MONGO_USERNAME:-}"):$(uri_encode "$MONGO_PASSWORD")@"
    export MONGO_URI="mongodb://$credentials$MONGO_HOSTPORT/LibreChat?authSource=admin"
  else
    export MONGO_URI="mongodb://$MONGO_HOSTPORT/LibreChat"
  fi
fi

if [ -n "${RENDER_EXTERNAL_URL:-}" ]; then
  export DOMAIN_CLIENT="${DOMAIN_CLIENT:-$RENDER_EXTERNAL_URL}"
  export DOMAIN_SERVER="${DOMAIN_SERVER:-$RENDER_EXTERNAL_URL}"
fi

# Replacing a path that holds files would delete them, so fail instead.
link_onto_disk() {
  target=$1
  link=$2

  mkdir -p "$target"

  if [ -L "$link" ]; then
    rm -f "$link"
  elif [ -d "$link" ] && [ -n "$(ls -A "$link")" ]; then
    echo "render-start: $link holds files; refusing to replace it with a symlink to $target" >&2
    exit 1
  else
    rm -rf "$link"
  fi

  ln -s "$target" "$link"
}

link_onto_disk "$DATA_DIR/uploads" /app/uploads
link_onto_disk "$DATA_DIR/images" /app/client/public/images

exec npm run backend
