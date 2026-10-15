# Retained LibreChat compatibility integration

The production browser app is `meo-pages/` on Cloudflare Pages. This older
LibreChat integration is retained for compatibility and is not a second hosted
identity or cloud authority. Both adapters consume Meo API endpoints.

This is a separate LibreChat fork. LibreChat supplies the responsive chat shell,
conversation renderer, and account session; Meo-specific behavior is isolated in
`meo/` plus small route and router registrations.

## Account ownership and login

- Meo Account is the only identity provider and encrypted BYOK authority.
- LibreChat uses its built-in OpenID Connect login with PKCE. Register the exact
  callback `${DOMAIN_SERVER}/oauth/openid/callback` in Meo Account.
- The browser uses the LibreChat same-origin session cookie. OIDC access tokens
  remain in the server-side session and are forwarded from the API adapter to
  Meo Account and Meo Cloud; provider API keys never enter the browser or
  LibreChat database.
- `MEO_ACCOUNT_OAUTH_CLIENT_ID` must equal `OPENID_CLIENT_ID`. The broker checks
  this client identity on every chat consent and invocation.

## Provider and chat flow

`/api/meo` reads enabled credential metadata and model metadata through
`ai-provider-broker`. Model-listing fallback lets a user enter a model ID by
hand. A chat turn first requests the broker's payload-bound consent preview;
the UI shows provider, model, purpose, data categories and destination before
invocation. The browser stores only the selected credential ID and visible chat
state. It never receives an Account access token or provider key.

The Account broker requests `stream: true` from OpenAI-compatible providers,
normalizes their SSE into token deltas, and sends those events through the Meo
same-origin API to the browser. Browser disconnects abort the provider request.
Other Account provider styles can add their own stream adapter later.

## Deep links and cloud history

`/new?connection=<credential-id>&model=<model-id>` selects an Account credential
and model after Meo Account login. The adapter verifies the connection belongs
to the signed-in user and confirms the model is in the connection's discovered
models when discovery is supported. Invalid values return to the selectors.
Conversation and message history lives in Meo Cloud and is scoped to the verified
Account user ID. `localStorage` keeps only the active conversation pointer.

## Local startup

Use Node 24+ and the package manager declared by the upstream repository. From
the fork root:

```sh
cp .env.example .env
cp meo/librechat.meo.example.yaml librechat.yaml
```

Set `MONGO_URI`, `DOMAIN_CLIENT=http://localhost:3080`,
`DOMAIN_SERVER=http://localhost:3080`, `OPENID_ISSUER`, `OPENID_CLIENT_ID`,
`OPENID_USE_PKCE=true`, `OPENID_REUSE_TOKENS=true`, `MEO_ACCOUNT_URL`, and
`MEO_ACCOUNT_OAUTH_CLIENT_ID` in `.env`. Set `MEO_API_URL=https://api.meoarch.org`
for the provider broker and conversation history. Leave `OPENID_CLIENT_SECRET` empty for
the registered public PKCE client. Register `http://localhost:3080/oauth/openid/callback`
for local development. Never put provider keys in `.env` or `librechat.yaml`.

Install and build the shared packages, then start MongoDB/Redis and both app
processes:

```sh
npm install
npm run build:data-provider
npm run build:data-schemas
npm run build:api
npm run build:client-package
npm run backend:dev
```

In a second terminal, run `npm run b:client:dev`, then open
`http://localhost:3080/new`. The route requires a working Meo Account OIDC
client and a signed-in Account with at least one enabled provider connection.

## AgentRun seam

The browser chat does not call local AgentService. The existing Meo Cloud client
remains the future entry point for AgentRun creation and replayable SSE at
`/v1/agent-runs/events`; reconnect must resume the same `run_id`. First-version
ordinary chat does not depend on AgentRun availability.
