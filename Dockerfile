# v0.8.8-rc4

# Base node image
FROM alpine:3.24 AS node

RUN set -eux; \
    for i in 1 2 3 4 5; do \
        apk update \
        && apk upgrade --no-cache \
        && apk add --no-cache nodejs npm python3 py3-pip uv jemalloc 'expat>=2.8.4-r0' \
        && break; \
        echo "apk install failed; retrying $i/5"; \
        rm -rf /var/cache/apk/* /tmp/*; \
        sleep 10; \
    done; \
    addgroup -S node; \
    adduser -S node -G node

# pdfjs-dist 6.x requires Node >=22.13; fail the image build before runtime if
# the Alpine repository ever resolves an older Node version.
RUN node -e 'const [major,minor]=process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 13)) throw new Error(`Node ${process.versions.node} is incompatible with pdfjs-dist 6.2.108`);'

# Set environment variable to use jemalloc
ENV LD_PRELOAD=/usr/lib/libjemalloc.so.2
# Disable dependency installation analytics before any npm lifecycle scripts run.
ENV SCARF_ANALYTICS=false

# Add `uv` for extended MCP support
COPY --from=ghcr.io/astral-sh/uv:0.9.5-python3.12-alpine /usr/local/bin/uv /usr/local/bin/uvx /bin/
RUN uv --version

# Set configurable max-old-space-size with default
ARG NODE_MAX_OLD_SPACE_SIZE=6144
ARG NPM_CI_TIMEOUT_SECONDS=1500
ARG NPM_CI_ATTEMPTS=2

RUN mkdir -p /app && chown node:node /app
WORKDIR /app

USER node

# AWS DocumentDB/RDS TLS CA bundle. Public, non-secret (AWS publishes it at
# this well-known URL) — mongoose's connection options reference it as a
# relative path ("global-bundle.pem"), resolved against WORKDIR at runtime.
# A prior refactor dropped this without anyone noticing because every build
# since has crashed earlier in boot (npm/CMD, then a find-glob deleting
# @opentelemetry/core, then a missing mongodb dependency, then sharp's musl
# binary) - this is the first build to actually reach the Mongo connection
# and surface "ENOENT: no such file or directory, open 'global-bundle.pem'".
RUN wget -q -O global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
    && test -s global-bundle.pem

COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node api/package.json ./api/package.json
COPY --chown=node:node client/package.json ./client/package.json
COPY --chown=node:node packages/data-provider/package.json ./packages/data-provider/package.json
COPY --chown=node:node packages/data-schemas/package.json ./packages/data-schemas/package.json
COPY --chown=node:node packages/api/package.json ./packages/api/package.json
COPY --chown=node:node packages/client/package.json ./packages/client/package.json

RUN \
    touch .env ; \
    # Create directories for the volumes to inherit the correct permissions
    mkdir -p /app/client/public/images /app/logs /app/uploads /app/skill /app/data ; \
    chmod 1777 /app/data ; \
    npm config set fetch-retry-maxtimeout 600000 ; \
    npm config set fetch-retries 5 ; \
    npm config set fetch-retry-mintimeout 15000 ; \
    attempt=1 ; \
    until timeout "$NPM_CI_TIMEOUT_SECONDS" npm install --legacy-peer-deps --ignore-scripts --no-audit ; do \
        status=$? ; \
        if [ "$attempt" -ge "$NPM_CI_ATTEMPTS" ]; then \
            exit "$status" ; \
        fi ; \
        echo "npm install --legacy-peer-deps --ignore-scripts --no-audit failed with exit code $status; retrying attempt $((attempt + 1))/$NPM_CI_ATTEMPTS" ; \
        attempt=$((attempt + 1)) ; \
        npm cache clean --force || true ; \
        sleep 10 ; \
    done

# npm can omit esbuild's platform package when the lockfile was generated on a
# different OS. Fetch the binary required by this Alpine/x64 image explicitly
# before Vite loads its config.
#
# `npm pack` instead of `npm install`: installing into /app re-resolves the
# whole dependency tree, and with --package-lock=false that resolution ignores
# package-lock.json and picks the newest match for every semver range. A single
# range resolving to a version whose tarball the registry CDN is not yet serving
# fails the layer for a package that has nothing to do with esbuild. `npm pack`
# fetches one tarball and touches no other dependency.
RUN set -eu ; \
    ESBUILD_VERSION="$(node -p "require('./node_modules/esbuild/package.json').version")" ; \
    if [ -x "node_modules/@esbuild/linux-x64/bin/esbuild" ]; then \
        echo "@esbuild/linux-x64@${ESBUILD_VERSION} already installed" ; \
    else \
        mkdir -p /tmp/esbuild-pkg node_modules/@esbuild/linux-x64 ; \
        attempt=1 ; \
        until npm pack "@esbuild/linux-x64@${ESBUILD_VERSION}" --pack-destination /tmp/esbuild-pkg ; do \
            status=$? ; \
            if [ "$attempt" -ge "$NPM_CI_ATTEMPTS" ]; then \
                exit "$status" ; \
            fi ; \
            echo "npm pack @esbuild/linux-x64@${ESBUILD_VERSION} failed with exit code $status; retrying attempt $((attempt + 1))/$NPM_CI_ATTEMPTS" ; \
            attempt=$((attempt + 1)) ; \
            sleep 10 ; \
        done ; \
        tar -xzf /tmp/esbuild-pkg/esbuild-linux-x64-*.tgz -C node_modules/@esbuild/linux-x64 --strip-components=1 ; \
        rm -rf /tmp/esbuild-pkg ; \
    fi ; \
    test -x node_modules/@esbuild/linux-x64/bin/esbuild

COPY --chown=node:node . .

RUN \
    # React client build with configurable memory
    NODE_OPTIONS="--max-old-space-size=${NODE_MAX_OLD_SPACE_SIZE}" npm run frontend && \
    test -s /app/client/dist/index.html && \
    npm prune --production && \
    rm -rf /usr/local/include/node && \
    npm cache clean --force

# Re-apply patched package versions after npm prune for Vanta high/medium findings.
RUN node -e 'const fs=require("fs"); const p="package.json"; const pkg=JSON.parse(fs.readFileSync(p,"utf8")); const names=["hono","multer","undici","uuid","form-data","protobufjs","nodemailer","dompurify","@opentelemetry/core","file-type"]; if (pkg.overrides) { for (const n of names) delete pkg.overrides[n]; } fs.writeFileSync(p, JSON.stringify(pkg,null,2));' \
    && npm install --force --legacy-peer-deps --ignore-scripts --no-audit --omit=dev --save=false \
    hono@4.13.7 \
    multer@2.3.0 \
    nanoid@3.3.18 \
    undici@8.10.0 \
    uuid@13.0.1 \
    form-data@4.0.6 \
    protobufjs@8.6.6 \
    nodemailer@9.1.1 \
    dompurify@3.4.13 \
    postcss@8.5.26 \
    svgo@2.8.4 \
    @opentelemetry/propagator-jaeger@2.9.0 \
    @hono/node-server@2.0.11 \
    body-parser@2.3.0 \
    axios@1.19.0 \
    @opentelemetry/core@2.8.0 \
    file-type@21.3.2 \
    js-yaml@4.3.2 \
    brace-expansion@5.0.9 \
    fast-uri@3.1.6 \
    fflate@0.8.3 \
    ip-address@10.3.1 \
    pdfjs-dist@6.2.108 \
    sharp@0.35.4 \
    && rm -rf /app/api/node_modules/sharp /app/packages/api/node_modules/sharp \
    && mkdir -p /app/api/node_modules \
    && cp -a /app/node_modules/sharp /app/api/node_modules/sharp \
    && rm -rf /app/node_modules/gaxios/node_modules/uuid \
    && mkdir -p /app/node_modules/gaxios/node_modules \
    && cp -a /app/node_modules/uuid /app/node_modules/gaxios/node_modules/uuid \
    && rm -rf /app/node_modules/@langchain/google-common/node_modules/uuid \
    && mkdir -p /app/node_modules/@langchain/google-common/node_modules \
    && cp -a /app/node_modules/uuid /app/node_modules/@langchain/google-common/node_modules/uuid \
    && rm -rf /app/node_modules/@hyperdx/otel-web-session-recorder/node_modules/protobufjs \
    && mkdir -p /app/node_modules/@hyperdx/otel-web-session-recorder/node_modules \
    && cp -a /app/node_modules/protobufjs /app/node_modules/@hyperdx/otel-web-session-recorder/node_modules/protobufjs \
    && find /app/node_modules/@opentelemetry -mindepth 2 -path "*/node_modules/@opentelemetry/core" -type d -prune -exec rm -rf {} + \
    && find /app/node_modules/@opentelemetry -mindepth 1 -path "*/node_modules/@opentelemetry" -type d -exec sh -c 'mkdir -p "$1"; cp -a /app/node_modules/@opentelemetry/core "$1/core"' sh {} \; \
    && rm -rf /app/api/node_modules/nodemailer \
    && mkdir -p /app/api/node_modules \
    && cp -a /app/node_modules/nodemailer /app/api/node_modules/nodemailer \
    && rm -rf /app/node_modules/stream-file-type/node_modules/file-type \
    && mkdir -p /app/node_modules/stream-file-type/node_modules \
    && cp -a /app/node_modules/file-type /app/node_modules/stream-file-type/node_modules/file-type \
    && rm -f /app/packages/data-provider/react-query/package-lock.json \
    && rm -f /app/node_modules/@monaco-editor/loader/playground/package-lock.json \
    && npm cache clean --force

# Remove vulnerable nested copies reintroduced by parent-specific npm ranges.
RUN set -eux; \
    rm -rf /app/node_modules/@modelcontextprotocol/sdk/node_modules/@hono/node-server; \
    rm -rf /app/node_modules/@opentelemetry/sdk-node/node_modules/@opentelemetry/propagator-jaeger; \
    test ! -e /app/node_modules/@modelcontextprotocol/sdk/node_modules/@hono/node-server; \
    test ! -e /app/node_modules/@opentelemetry/sdk-node/node_modules/@opentelemetry/propagator-jaeger

# Guard rail: the surgery above (prune, forced pinned-version reinstall,
# nested-copy find/rm/cp) has repeatedly broken unrelated production
# dependencies without failing the build — npm's CMD silently pointed at a
# removed binary, an over-broad find glob deleted the root
# @opentelemetry/core it meant to redistribute, and mongodb went missing
# entirely. Each one only surfaced as a silent ECS crash-loop that rolled
# back to the prior image minutes after the workflow reported success. Fail
# the build here instead, while node_modules is still intact and npm/npx are
# still present to debug with. Paths mirror the exact locations this block
# just placed nodemailer/file-type at, matching how api/server and
# stream-file-type actually require() them at runtime.
RUN node -e '\
const fs = require("fs"); \
const rootOnly = ["mongodb","hono","multer","undici","uuid","form-data","protobufjs","@opentelemetry/core","module-alias","express","mongoose","axios","dompurify","body-parser","js-yaml","@hono/node-server","@opentelemetry/propagator-jaeger","fast-uri","svgo","brace-expansion"]; \
const pathed = [["nodemailer", ["/app/api"]], ["file-type", ["/app/node_modules/stream-file-type"]]]; \
const files = ["/app/global-bundle.pem"]; \
const failures = []; \
for (const name of rootOnly) { \
  try { require.resolve(name); } catch (err) { failures.push(`${name}: ${err.message}`); } \
} \
for (const [name, paths] of pathed) { \
  try { require.resolve(name, { paths }); } catch (err) { failures.push(`${name} (expected under ${paths.join(",")}): ${err.message}`); } \
} \
try { require("sharp"); } catch (err) { failures.push(`sharp (native binary load): ${String(err.message).split("\n")[0]}`); } \
for (const file of files) { \
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) { failures.push(`${file}: missing or empty`); } \
} \
if (failures.length) { \
  console.error("Build-time dependency check FAILED - missing from final image:\n" + failures.join("\n")); \
  process.exit(1); \
} \
console.log(`Build-time dependency check passed (${rootOnly.length + pathed.length + files.length} checks).`); \
'
USER root
# Remove npm tooling from final image for Vanta/AWS Inspector.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /usr/lib/node_modules/npm /usr/bin/npm /usr/bin/npx /home/node/.npm
USER node

# Optional build metadata surfaced in Settings -> About for support triage.
# Declared here (after the heavy install/build steps) so that commit/date
# changing on every CI run does not bust the cache for dependency install
# and frontend build layers. When unset, the backend falls back to local
# git resolution (if .git is present), and finally to empty values.
ARG BUILD_COMMIT=
ARG BUILD_BRANCH=
ARG BUILD_DATE=
ENV BUILD_COMMIT=${BUILD_COMMIT}
ENV BUILD_BRANCH=${BUILD_BRANCH}
ENV BUILD_DATE=${BUILD_DATE}

# Node API setup
EXPOSE 3080
ENV HOST=0.0.0.0
ENV NODE_ENV=production
CMD ["node", "api/server/index.js"]

# Optional: for client with nginx routing
# FROM nginx:stable-alpine AS nginx-client
# WORKDIR /usr/share/nginx/html
# COPY --from=node /app/client/dist /usr/share/nginx/html
# COPY client/nginx.conf /etc/nginx/conf.d/default.conf
# ENTRYPOINT ["nginx", "-g", "daemon off;"]
