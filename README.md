# Meo AI Web

Meo AI Web is the browser client for **Meo AI**: a Meo Account-connected AI chat experience that lets users choose their own provider connections and models while keeping account, consent, and conversation handling inside the Meo ecosystem.

> **Status:** development preview. The web client is usable for testing, but the project is still being refined for the MeoArch Personal Project release.

## What is usable now

- Sign in with Meo Account using OAuth/OIDC.
- Use provider connections already configured in Meo Account.
- Select supported models or enter a model ID for compatible providers.
- Stream assistant replies and stop generation with real request cancellation.
- Keep conversation history synced through Meo Cloud.
- Restore per-conversation drafts in the current browser session.
- Copy complete messages or individual code blocks.
- Use IME-safe Enter handling for Chinese/Japanese input.
- Preserve scroll position while reading earlier messages during streaming.
- Use responsive mobile navigation, keyboard focus states, reduced-motion support, and basic shortcuts.

The lightweight Cloudflare Pages implementation lives in [`meo-pages/`](./meo-pages/README.md).

## Repository layout

| Path | Purpose |
| --- | --- |
| `meo-pages/` | Current Meo AI web client and Cloudflare Pages Functions |
| `client/`, `api/`, packages and supporting directories | Upstream LibreChat code retained in this fork for reference and possible reuse |
| `UPSTREAM.md` | Preserved upstream LibreChat README and attribution |

## Current architecture

The active Meo web path intentionally stays small:

```text
Browser
  ↓
Cloudflare Pages / Pages Functions
  ↓
Meo Account OAuth session
  ↓
Meo Account AI provider broker
  ↓
User-selected provider/model

Conversation history
  ↓
Meo API / Neon PostgreSQL
```

Provider credentials are not entered directly into this web UI. Connections are managed through Meo Account, and each AI request uses the consent flow exposed by the Account broker.

## Local verification

The Meo Pages project uses Node 22 and has no browser framework build step.

```bash
cd meo-pages
npm test
npm run build
```

`npm run build` verifies the required Pages files, imports the server handlers, and syntax-checks the browser JavaScript.

## Deployment

The current browser client is designed for Cloudflare Pages. Static files are under `meo-pages/public`, while OAuth and API routes are implemented with Pages Functions.

`/new` is explicitly routed to the SPA entry point. Unknown static routes use the branded 404 page.

See [`meo-pages/README.md`](./meo-pages/README.md) for the deployment-specific configuration and environment variables.

## Near-term work

The highest-value remaining work is validation and product polish rather than adding more surface area:

- Real-browser and mobile regression testing for stop/stream/IME/scroll behavior.
- Conversation search and fuller keyboard navigation.
- Better initial/history loading states.
- Richer Markdown support with a well-tested sanitizer/parser migration.
- Shared semantic design tokens with MeoUI instead of web-only color constants.
- Social preview artwork and repository screenshots.
- Formal preview release notes and known limitations.

## Upstream

This repository is a fork of **LibreChat**. The original upstream README has been preserved in [`UPSTREAM.md`](./UPSTREAM.md) so LibreChat documentation and attribution remain available without making the repository look like an unmodified upstream mirror.

For the Meo-specific browser implementation, start with [`meo-pages/README.md`](./meo-pages/README.md).
