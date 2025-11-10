# Local Web Search Services

LibreChat bundles two helper containers to power the “Local (no keys)” browsing preset: the **SearxNG** meta-search engine and the **ws-local** orchestrator/scraper. Together they enable a full search → fetch → (rerank) pipeline that never leaves your Docker network, so any model can browse without API keys.

---

## SearxNG (`searxng` service)

- **Role**: provides meta-search over multiple public engines and returns normalized JSON that ws-local can post-process.
- **Image & Port**: runs `searxng/searxng:latest`, listening on `http://searxng:8080` within the compose network.
- **Configuration**:
  - Mounts `docker/searxng/settings.yml` (read-only) for engine selection, result categories, and throttling. Edit this file to customize sources.
  - Key environment variables (set in `docker-compose.yml`):
    - `SEARXNG_BASE_URL` – base URL ws-local uses (`http://searxng:8080` by default). Change this if you rename the service or expose a different port.
    - `INSTANCE_NAME` – label surfaced by the SearxNG UI (useful if you ever expose the admin panel for diagnostics).
  - `docker/searxng/default_settings.yml` mirrors upstream defaults; keep local tweaks inside `settings.yml` so upgrades stay simple.
- **Relationship to ws-local**: ws-local issues `GET /search?format=json` against this service. If the base URL or port changes, update both `SEARXNG_BASE_URL` (compose file) and `WS_LOCAL_BASE_URL` (backend env).
- **Observability**:
  - `docker compose logs searxng` highlights missing engines, bot-detection warnings, or rate limits.
  - SearxNG expects a client IP header. Ws-local already injects `X-Forwarded-For`, but manual curl requests should include it to avoid the “X-Forwarded-For nor X-Real-IP header is set!” warning.
  - Temporarily publishing port 8080 lets you view the built-in SearxNG UI for debugging.
- **Common Issues**:
  - *403 or empty results*: usually an upstream search engine blocking anonymous calls. Disable that engine in `settings.yml` or switch to alternatives.
  - *Startup failure*: syntax errors in `settings.yml` cause the container to exit immediately—validate YAML before redeploying.
  - *Log spam about missing engines*: remove stale engine blocks from `settings.yml` to silence the warnings.

---

## ws-local (`ws-local` service)

- **Role**: the single entry point LibreChat calls. It orchestrates search, scraping, optional reranking, and enforces safety limits (blocked protocols, private IPs, size caps, per-host concurrency).
- **Build & Runtime**: constructed from `./ws-local` atop `mcr.microsoft.com/playwright:v1.56.1-jammy`. Node runs `src/index.js`; Playwright powers headless Chromium fetches.
- **HTTP API**:
  - `GET /health` → `{ ok: true }` readiness check used by backend status chips.
  - `GET /search` → wraps SearxNG (`q`, `max`, `safe` params). Responds with `{ query, safe, results[] }`.
  - `POST /fetch` → Playwright + Readability extraction. Body `{ urls[], maxBytes? }`. Returns `{ docs[] }` with sanitized text, snippets, metadata, or error markers.
  - `POST /rerank` → lightweight lexical reranker. Body `{ query, docs[] }`, returns scored docs sorted best-first.
- **Key Environment Variables** (set in `docker-compose.yml`):
  - Connectivity: `PORT` (default 7001) and `SEARXNG_URL` (must match the SearxNG service URL).
  - Limits: `MAX_FETCH_URLS`, `MAX_TEXT_BYTES`, `CACHE_TTL_MS`, `PLAYWRIGHT_NAV_TIMEOUT`, `TOTAL_TIMEOUT_MS`, `PER_HOST_CONCURRENCY`, `GLOBAL_CONCURRENCY`.
  - When upgrading Playwright, bump both the Dockerfile base image (`v1.xx.x-jammy`) and the npm dependency in `ws-local/package.json`, then rebuild.
- **Processing Flow**:
  1. Deduplicate inputs and block unsafe protocols or private CIDRs.
  2. Use a shared Chromium browser with per-host and global concurrency guards.
  3. Strip boilerplate via Mozilla Readability (with a `trafilatura` fallback) and truncate text by byte limits for token safety.
  4. Cache successful fetches for `CACHE_TTL_MS` to avoid refetching the same URL in a browsing burst.
- **Observability**:
  - `docker compose logs ws-local` shows concise request logs (method, route, latency). Tail this during debugging.
  - For quick checks, `docker compose exec api curl http://ws-local:7001/search?q=hello` validates connectivity without exposing the port externally.
  - Chromium debug: exec into the container and set `DEBUG=pw:browser*` before launching for verbose Playwright output.
- **Common Issues**:
  - *Playwright “Executable doesn’t exist” errors*: rebuild the image after upgrading dependencies (`docker compose build ws-local && docker compose up -d ws-local`).
  - *Frequent timeouts*: raise `PLAYWRIGHT_NAV_TIMEOUT`/`TOTAL_TIMEOUT_MS` or reduce the per-host concurrency if the target sites respond slowly.
  - *Captcha or JavaScript-heavy pages*: expect partial content; consider whitelisting different sources or increasing wait times.
  - *Backend recursion errors*: typically caused by mismatched tool payloads, not ws-local itself. Validate the tool schema (`api/app/clients/tools/structured/WebSearch.js`) if the agent keeps retrying the tool.

---

## Pipeline Summary

1. A model (tool-native or shimmed via `[[WEB: ...]]`) triggers LibreChat’s `WebSearch` tool.
2. The backend handler (`api/server/services/WebSearch/handler.js`) calls ws-local to:
   - Perform SearxNG search,
   - Fetch article content with Playwright,
   - Optionally rerank results.
3. Ws-local communicates with SearxNG internally—no public endpoints or API keys required.
4. The handler emits structured results and citations back to the client UI via SSE.

Since both containers live on the compose network, keep them alongside the API service to prevent your local browse surface from being exposed externally.

---

## Quick Reference

| Service  | Source / Image                              | Internal URL          | Config Highlights                                    | Responsibilities                                     |
|----------|---------------------------------------------|-----------------------|------------------------------------------------------|------------------------------------------------------|
| searxng  | `${SEARXNG_IMAGE:-searxng/searxng:latest}`   | `http://searxng:8080` | Configure via env (`SEARXNG_BASE_URL`, etc.)         | Aggregate meta-search results                         |
| ws-local | `ws-local/Dockerfile` → `${WS_LOCAL_IMAGE:-librechatneo-ws-local}` | `http://ws-local:7001` | Env limits in `docker-compose.yml`, `WS_LOCAL_BASE_URL` in API | Orchestrate search, scraping, rerank, safety filtering |

### Pre-built Images & CI

`docker-compose.yml` tags the services with overridable image names (e.g., `API_IMAGE`, `WS_LOCAL_IMAGE`, `SEARXNG_IMAGE`). Build/push the API and ws-local images in CI so deploy targets can `docker compose pull && docker compose up -d`. SearxNG defaults to the upstream image, so no custom build is necessary unless you want to pin a fork. Use this document whenever you customize browsing, upgrade Playwright/SearxNG, or debug web-search behavior in LibreChat.
