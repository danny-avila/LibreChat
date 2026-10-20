> **Source consolidation (2026-10-18):** New Meo Web product development now lives in [`meo-ai/meo/web/client`](https://github.com/QwQdoge/meo-ai/tree/main/meo/web/client), beside desktop, Android, UI Schema and Rust Core. The import is merged on `meo-ai` `main`. This repository and its existing production deployment remain rollback/history until explicit cutover. Do not continue parallel feature development here.

# Meo AI Web

Meo AI Web is the browser client for **Meo AI**, one product across Web,
native desktop and Android. Meo Account owns identity, OAuth and encrypted BYOK;
Meo API owns account-scoped AI state and cloud orchestration.

> **Status: development preview.** The React cutover still requires authenticated
> browser acceptance. Source, tests and a successful build do not establish that
> production login, inference or cross-device history works.

## Source ownership

| Path                                                | Responsibility                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| `client/`                                           | Canonical React/TypeScript Meo application                          |
| `client/src/components/Meo/`                        | Meo workspace, Chat and Account session integration                 |
| `packages/client/`, `packages/data-provider/`       | Shared Web primitives, types and services                           |
| `meo-pages/functions/`                              | Temporary browser OAuth/session and same-origin transport edge      |
| `meo-pages/public/`                                 | Legacy static UI retained for rollback; no new product behavior     |
| `api/`, `packages/api/`, other upstream directories | Retained LibreChat infrastructure; not a second Meo cloud authority |
| `UPSTREAM.md`                                       | Upstream documentation and attribution                              |

New Chat, Work, Projects, Skills, Memory and routing behavior belongs in the
shared contracts/backend and the React client. A navigation entry does not mean
its full workspace is implemented. See [architecture](docs/meo-web-architecture.md)
and the scoped [Meo contribution rules](client/src/components/Meo/AGENTS.md).

## Runtime path

```text
React client
  → same-origin Pages edge (OAuth PKCE + encrypted HttpOnly session cookie)
  → Meo API /v1/* (authorization, Chat context, conversations, Projects, runs)
  → provider broker / Neon
```

Chat preparation and streaming forward to `/v1/chat/prepare` and
`/v1/chat/stream`. The edge preserves `conversationId`, prompt and consent;
Meo API assembles history and Project context. Model/connection discovery uses
the Account-owned broker. Provider keys and OAuth tokens are not exposed to
browser JavaScript.

Desktop retains C++/QML and native adapters. Android retains Kotlin/Compose and
Rust JNI. Shared runtime/protocol development lives in
[meo-ai](https://github.com/QwQdoge/meo-ai); server business behavior lives in
[meo-api](https://github.com/QwQdoge/meo-api).

## Verification

With repository dependencies available:

```sh
npm test --prefix meo-pages
node meo-pages/scripts/check-build.mjs
```

The second command checks an **existing** React output and imports the edge
handlers; it does not rebuild or prove runtime acceptance. To reproduce the
Pages build, run `npm run build` from `meo-pages` in a dedicated build checkout.
It installs workspaces, builds React and replaces the disposable `dist` output.
Run focused React tests/typechecks for changed client work as described in
`AGENTS.md`.

P0 browser acceptance must cover real Account login, refresh, connection/model
discovery, explicit consent, streaming, Stop and history recovery. Check a
follow-up turn against saved history and Project instructions as well as a new
conversation. Record failures and deployment revisions; do not label mocked
transport tests as real-provider or cross-platform acceptance.

## Deployment and rollback

The temporary Pages project root is `meo-pages`; its output is `dist`, built
from `client/`. `public` is retained rollback material. See the
[Pages deployment contract](meo-pages/README.md) for public configuration and
OAuth callback requirements.

React promotion requires authenticated acceptance and an identified previous
Pages deployment plus compatible Worker rollback point. Keep production
promotion explicit; changing this README or running local tests does not deploy.

## Upstream

This repository preserves its **LibreChat** provenance. Reuse upstream
infrastructure deliberately while keeping Meo product behavior behind the
shared Meo API/core boundaries.
