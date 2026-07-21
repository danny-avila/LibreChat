# Long-lived GitNexus image for DigitalOcean droplet deployment.
#
# This image does NOT bake in the index data. Indexes are mounted from
# the host at /indexes/<repo>/.gitnexus/ and registered at container
# startup. A fresh index only requires rsync + container restart — no
# image rebuild on every push.

FROM node:24.16.0-slim

ARG GITNEXUS_VERSION=1.6.7
# Pin the native DB to match the index workflow; gitnexus's ^0.17.0 range
# would otherwise let the served image drift from the CI-produced index.
ARG LADYBUG_VERSION=0.17.1

# 1. Build native addons with Bookworm toolchain, then remove build tools.
#    curl stays for the docker healthcheck; Caddy lives in its own container.
#    LadybugDB is pinned nested under gitnexus so step 3's require() resolves it.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ curl \
    && npm install -g gitnexus@${GITNEXUS_VERSION} \
    && npm install --no-save --prefix /usr/local/lib/node_modules/gitnexus "@ladybugdb/core@${LADYBUG_VERSION}" \
    && apt-get purge -y --auto-remove python3 make g++ \
    && rm -rf /var/lib/apt/lists/* /root/.npm

# 2. Upgrade libstdc++ from Trixie — @ladybugdb/core prebuilt binary needs
#    GLIBCXX_3.4.32 which Bookworm (3.4.31) doesn't ship.
RUN echo "deb http://deb.debian.org/debian trixie main" > /etc/apt/sources.list.d/trixie.list \
    && apt-get update \
    && apt-get install -y -t trixie libstdc++6 \
    && rm /etc/apt/sources.list.d/trixie.list \
    && rm -rf /var/lib/apt/lists/*

# 3. Pre-install LadybugDB FTS + vector extensions so ~/.kuzu/extension/
#    is baked into the image. gitnexus serve loads extensions with a
#    load-only policy and never installs them at runtime, so the cache
#    must already exist. (GitNexus loads the vector extension itself
#    via loadVectorExtension — no adapter patch needed.)
COPY install-extensions.js /tmp/install-extensions.js
RUN node /tmp/install-extensions.js && rm -rf /tmp/install-extensions.js /tmp/lbug-ext-install

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 4747

ENTRYPOINT ["/entrypoint.sh"]
