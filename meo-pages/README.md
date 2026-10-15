# Meo AI on Cloudflare Pages

This is a small Cloudflare Pages app for `chat.meoarch.org`. It uses Meo Account for OAuth and Meo API for provider-key operations and conversation history. The browser only calls same-origin Pages Functions; the server-side functions exchange tokens and call versioned Meo endpoints.

## Free-tier deployment

Cloudflare Pages serves the static UI and runs the small `/api/*` and `/oauth/*` handlers as Pages Functions. Pages Free includes 100,000 dynamic requests per day; static asset requests are free. The app does not need a continuously running container, MongoDB, a paid Workers plan, or additional domain/DNS purchases. Provider inference remains subject to the selected provider's existing billing and usage limits.

In the Cloudflare Pages project, set the root directory to `meo-pages`, build command to `npm run build`, and output directory to `public`. Builds run on Cloudflare's build infrastructure. Deploy the `main` branch after GitHub Actions passes.

The repository build watch include is `meo-pages/*` (`*` matches nested paths in Pages build watch rules), so LibreChat upstream-only commits do not consume Pages builds.

## Runtime variables

Set these for Production (and Preview only when using a registered OAuth callback):

| Variable | Value |
| --- | --- |
| `MEO_ACCOUNT_URL` | `https://account.meoarch.org` |
| `MEO_API_URL` | `https://api.meoarch.org` |
| `MEO_OAUTH_CLIENT_ID` | `8f2e0255-187d-448f-9e25-bc275d1b6015` |
| `SESSION_SECRET` | A random 32-byte base64url secret stored as a Cloudflare secret; never commit or print it |

The public OAuth client must register `https://chat.meoarch.org/oauth/openid/callback` with the new Meo Account OAuth server and request `https://api.meoarch.org` as its resource. The app uses PKCE. Access and refresh tokens are encrypted in a `Secure`, `HttpOnly`, `SameSite=Lax` cookie and are never exposed to browser JavaScript or local storage. Provider keys never leave Meo Account/Meo API.

The authorization request includes `offline_access`, which Better Auth requires
to issue the refresh token used by this app. The client ID must also exist in
the Account production `oauth_client` table: configuring the Pages variable
alone does not register it. Meo API auth migration
`0005_meo_ai_web_client.sql` owns the production Web registration. Missing Pages
client configuration returns a local 503 instead of sending a broken OAuth
request to Account.

## Local checks

No package installation is needed. Run `npm test` and `npm run build` from this directory. The build command is a lightweight source-layout check; Cloudflare performs the actual Pages build remotely.

## Runtime contract

- Browser → same-origin Pages Functions → Meo API `/v1/ai/provider-broker` for connection metadata, model discovery, consent and streaming inference.
- Streaming responses are passed through as SSE; request abort signals propagate to the broker fetch.
- Browser → same-origin Pages Functions → Meo API `/v1/conversations*` for conversation and message rows. Meo API authenticates the account token and enforces ownership in each query.
- `?connection=<credential-id>&model=<model-id>` is validated against the signed-in user's accessible connections and available models. Invalid values fall back to the selector.
