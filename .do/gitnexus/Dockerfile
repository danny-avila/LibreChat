# Long-lived GitNexus image for DigitalOcean droplet deployment.
#
# This image does NOT bake in the index data. Indexes are mounted from
# the host at /indexes/<repo>/.gitnexus/ and registered at container
# startup. A fresh index only requires rsync + container restart — no
# image rebuild on every push.

FROM node:24-slim

ARG GITNEXUS_VERSION=1.5.3

# 1. Build native addons with Bookworm toolchain, then remove build tools.
#    curl stays for the docker healthcheck; Caddy lives in its own container.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ curl \
    && npm install -g gitnexus@${GITNEXUS_VERSION} \
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
#    is baked into the image. Workaround for upstream GitNexus 1.5.3 bug.
COPY install-extensions.js /tmp/install-extensions.js
RUN node /tmp/install-extensions.js && rm -rf /tmp/install-extensions.js /tmp/lbug-ext-install

# 4. Patch lbug-adapter.js to also LOAD EXTENSION vector after FTS.
RUN LBUG_ADAPTER=/usr/local/lib/node_modules/gitnexus/dist/mcp/core/lbug-adapter.js \
    && grep -q "LOAD EXTENSION fts" "$LBUG_ADAPTER" \
    && sed -i "s|await available\[0\]\.query('LOAD EXTENSION fts');|await available[0].query('LOAD EXTENSION fts'); try { await available[0].query('LOAD EXTENSION vector'); } catch (e) { /* vector extension may not be installed */ }|g" "$LBUG_ADAPTER" \
    && grep -c "LOAD EXTENSION vector" "$LBUG_ADAPTER" \
    && echo "lbug-adapter.js patched to load vector extension"

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 4747

ENTRYPOINT ["/entrypoint.sh"]
