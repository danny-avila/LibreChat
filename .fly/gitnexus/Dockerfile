FROM node:24-slim

ARG GITNEXUS_VERSION=1.5.3

# Upgrade libstdc++ from Debian Trixie — @ladybugdb/core prebuilt binary
# needs GLIBCXX_3.4.32 which Bookworm (3.4.31) doesn't ship
RUN echo "deb http://deb.debian.org/debian trixie main" > /etc/apt/sources.list.d/trixie.list \
    && apt-get update \
    && apt-get install -y -t trixie libstdc++6 \
    && rm /etc/apt/sources.list.d/trixie.list \
    && apt-get install -y --no-install-recommends python3 make g++ caddy curl \
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
