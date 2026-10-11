# Meo AI on Cloudflare Pages

This is a small Cloudflare Pages app for `chat.meoarch.org`. It keeps the Meo Account broker as the only provider-key authority and stores conversation history in the existing Supabase `ai_conversations` and `ai_messages` tables under their user-scoped RLS policies.

## Free-tier deployment

Cloudflare Pages serves the static UI and runs the small `/api/*` and `/oauth/*` handlers as Pages Functions. Pages Free includes 100,000 dynamic requests per day; static asset requests are free. The app does not need a continuously running container, MongoDB, a paid Workers plan, or additional domain/DNS purchases. Provider inference remains subject to the selected provider's existing billing and usage limits.

In the Cloudflare Pages project, set the root directory to `meo-pages`, build command to `npm run build`, and output directory to `public`. Builds run on Cloudflare's build infrastructure. Deploy the `main` branch after GitHub Actions passes.

## Runtime variables

Set these for Production (and Preview only when using a registered OAuth callback):

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | `https://bdyhkkgwhcamfyoqcthx.supabase.co` |
| `SUPABASE_ANON_KEY` | Existing public/publishable key for this Supabase project; never use a service-role key |
| `MEO_OAUTH_CLIENT_ID` | `8f2e0255-187d-448f-9e25-bc275d1b6015` |
| `SESSION_SECRET` | A random 32-byte base64url secret stored as a Cloudflare secret; never commit or print it |

The existing public OAuth client already registers `https://chat.meoarch.org/oauth/openid/callback`. The app uses PKCE and the Supabase OAuth token endpoint. Access and refresh tokens are encrypted in a `Secure`, `HttpOnly`, `SameSite=Lax` cookie and are never exposed to browser JavaScript or local storage. Provider keys never leave Meo Account.

## Local checks

No package installation is needed. Run `npm test` and `npm run build` from this directory. The build command is a lightweight source-layout check; Cloudflare performs the actual Pages build remotely.

## Runtime contract

- Browser → same-origin Pages Functions → Meo Account `ai-provider-broker` for connection metadata, model discovery, consent and streaming inference.
- Streaming responses are passed through as SSE; request abort signals propagate to the broker fetch.
- Browser → Supabase PostgREST with the signed-in user's OAuth access token for conversation and message rows. Existing RLS enforces ownership and cross-user isolation.
- `?connection=<credential-id>&model=<model-id>` is validated against the signed-in user's accessible connections and available models. Invalid values fall back to the selector.
