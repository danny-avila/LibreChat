FROM node:24-slim

ARG GITNEXUS_VERSION=1.5.3

# 1. Build native addons with Bookworm toolchain, then remove build tools
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ caddy curl \
    && npm install -g gitnexus@${GITNEXUS_VERSION} \
    && apt-get purge -y --auto-remove python3 make g++ \
    && rm -rf /var/lib/apt/lists/* /root/.npm

# 2. Upgrade libstdc++ from Trixie — @ladybugdb/core prebuilt binary needs
#    GLIBCXX_3.4.32 which Bookworm (3.4.31) doesn't ship.
#    Done AFTER removing g++ to avoid libc6-dev version conflict.
RUN echo "deb http://deb.debian.org/debian trixie main" > /etc/apt/sources.list.d/trixie.list \
    && apt-get update \
    && apt-get install -y -t trixie libstdc++6 \
    && rm /etc/apt/sources.list.d/trixie.list \
    && rm -rf /var/lib/apt/lists/*

# 3. Pre-install LadybugDB FTS + vector extensions so the cache in
#    ~/.kuzu/extension/ is baked into the image. Workaround for upstream
#    bug: gitnexus serve's pool-adapter calls LOAD EXTENSION but never
#    INSTALL, so without this step, query()'s BM25 + semantic search
#    silently return empty.
COPY install-extensions.js /tmp/install-extensions.js
RUN node /tmp/install-extensions.js && rm -rf /tmp/install-extensions.js /tmp/lbug-ext-install

# 4. Patch pool-adapter.js to also LOAD EXTENSION vector after FTS.
#    Upstream only loads FTS at serve time; without vector extension
#    loaded, semantic search's CALL QUERY_VECTOR_INDEX fails silently.
RUN POOL_ADAPTER=/usr/local/lib/node_modules/gitnexus/dist/core/lbug/pool-adapter.js \
    && grep -q "LOAD EXTENSION fts" "$POOL_ADAPTER" \
    && sed -i "s|await available\[0\]\.query('LOAD EXTENSION fts');|await available[0].query('LOAD EXTENSION fts'); try { await available[0].query('LOAD EXTENSION vector'); } catch (e) { /* vector extension may not be installed */ }|g" "$POOL_ADAPTER" \
    && echo "pool-adapter.js patched to load vector extension"

# Copy pre-built GitNexus indexes (one per branch) and register each.
# The directory name becomes the repo name in `list_repos` output, so
# each branch lands in /LibreChat or /LibreChat-dev etc.
COPY indexes/ /indexes/
RUN set -e && \
    for dir in /indexes/*/; do \
        name=$(basename "$dir"); \
        target="/$name"; \
        mkdir -p "$target"; \
        cp -r "$dir.gitnexus" "$target/.gitnexus"; \
        gitnexus index "$target" --allow-non-git; \
    done && \
    rm -rf /indexes

# Caddy reverse proxy: bearer token auth in front of gitnexus serve
COPY Caddyfile /etc/caddy/Caddyfile

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
