FROM node:24-slim

ARG GITNEXUS_VERSION=1.5.3

# Build tools for native addons (LadybugDB, tree-sitter), cleaned up after install
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ caddy \
    && npm install -g gitnexus@${GITNEXUS_VERSION} \
    && apt-get purge -y --auto-remove python3 make g++ \
    && rm -rf /var/lib/apt/lists/* /root/.npm

WORKDIR /repo

# Copy the pre-built GitNexus index (from CI artifact)
COPY .gitnexus/ .gitnexus/

# Register the index so `gitnexus serve` can discover it
RUN gitnexus index /repo --allow-non-git

# Caddy reverse proxy: bearer token auth in front of gitnexus serve
# Token is set via FLY_API_SECRET (flyctl secrets set API_TOKEN=...)
COPY Caddyfile /etc/caddy/Caddyfile

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
