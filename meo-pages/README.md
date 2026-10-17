# Meo AI on Cloudflare Pages

> **Legacy UI / temporary browser edge.** The canonical Meo AI Web is the React/TypeScript application under `client/`. Do not add new Chat, Projects, Work, Skills, Memory, Agent, model-routing, or other product behavior to `meo-pages/public/*`. During migration this directory keeps the browser OAuth/session Pages Functions and a rollback copy of the old static UI only. See `../docs/meo-web-architecture.md`.

`chat.meoarch.org` currently uses this Cloudflare Pages project. The migration target is to serve the React build from `client/` while temporarily retaining the same-origin Pages Functions for OAuth/session handling.

The `cutover/react-web-pages` branch is the Pages preview lane for this migration. Production auto-deploy remains disabled while the React build is verified; the existing production deployment stays live until the cutover is explicitly promoted.

## React cutover deployment

Cloudflare Pages keeps the project root at `meo-pages` temporarily so the existing `functions/oauth/*` and minimal `functions/api/*` browser edge continue to work.

The Pages build command is `npm run build`. That command installs the repository workspaces, builds the canonical React client from `../client`, and stages its static output into `meo-pages/dist`.

The Pages output directory must therefore be `dist`, **not** `public`.

`meo-pages/public/*` is no longer the intended production build output. It remains only during the rollback window and will be deleted after the React production cutover is proven stable.

Build watch paths should include the React client and the shared packages required by the client, plus the temporary Pages edge. Changes to those paths must trigger a Pages build; legacy static-UI-only changes should not be a reason to expand product behavior there.

## Runtime variables

Set these for Production (and Preview only when using a registered OAuth callback):

| Variable | Value |
| --- | --- |
| `MEO_ACCOUNT_URL` | `https://account.meoarch.org` |
| `MEO_API_URL` | `https://api.meoarch.org` |
| `MEO_OAUTH_CLIENT_ID` | `8f2e0255-187d-448f-9e25-bc275d1b6015` |
| `SESSION_SECRET` | A random 32-byte base64url secret stored as a Cloudflare secret; never commit or print it |

The public OAuth client must register `https://chat.meoarch.org/oauth/openid/callback` with the Meo Account OAuth server and request `https://api.meoarch.org` as its resource. The app uses PKCE. Access and refresh tokens are encrypted in a `Secure`, `HttpOnly`, `SameSite=Lax` cookie and are never exposed to browser JavaScript or local storage. Provider keys never leave Meo Account/Meo API.

The authorization request includes `offline_access`, which Better Auth requires to issue the refresh token used by this app. The client ID must also exist in the Account production `oauth_client` table: configuring the Pages variable alone does not register it. Meo API auth migration `0005_meo_ai_web_client.sql` owns the production Web registration. Missing Pages client configuration returns a local 503 instead of sending a broken OAuth request to Account.

## Local checks

The Pages build now depends on the repository workspaces because it builds `client/`. Run `npm run build` from `meo-pages` to reproduce the Pages staging step. The build validates that `dist/index.html` comes from the React client and that the temporary OAuth/API Functions still import successfully.

## Runtime contract

- Browser UI: canonical React app from `client/`.
- Browser auth edge: temporary same-origin Pages Functions under `/oauth/*`.
- Browser API edge: temporary minimal same-origin Pages Functions under `/api/*`, forwarding to Meo API where required.
- Meo API / Neon remain authoritative for account-owned Chat, Project, context, file metadata, usage and device/runtime state.
- The Pages edge must not grow a second copy of Chat, Projects, Work, Skills, Memory or Agent business logic.
