# Meo AI Web architecture

This repository currently contains two Web surfaces, but only one is the product.

## Canonical Web application

The canonical Meo AI Web is the React/TypeScript application under `client/`.

`chat.meoarch.org` must ultimately serve this application. New user-facing Meo product work belongs in the React client and shared contracts, backed by Meo API / the shared Meo AI Core.

The invariant is not that every platform uses one process. The invariant is that **business logic exists only once**.

Canonical product topology:

```text
                 Meo Account
                      │
              identity / OAuth
                      │
          ┌───────────┴───────────┐
          │                       │
      Web Edge                Native auth
          │                       │
          └───────────┬───────────┘
                      ▼
                   meo-api
                      │
               Shared Meo AI Core
                      │
                    Neon
                      │
       ┌──────────────┼──────────────┐
       │              │              │
      Web          Desktop        Android
```

Meo API / the shared core and Neon are authoritative for account-owned AI state and behavior such as:

- Conversation and messages
- Project and Project Memory
- Skills
- AgentRun / Work
- Device and remote-runtime metadata
- model routing
- tool approval
- artifacts and persistent file metadata
- usage and account AI statistics
- compact context / summaries

Do not create Web-only versions of those domains.

Platform adapters are expected to differ where the platform itself differs. Examples include browser HttpOnly cookies, OAuth callback handling, Android secure storage, Linux KWallet, macOS Keychain, and Windows Credential Manager.

## Legacy Pages UI

`meo-pages/public/*` is the legacy/static Pages UI that was used to bootstrap `chat.meoarch.org`.

It must not receive new Chat, Projects, Work, Skills, Memory, Agent, device, artifact or model-routing product logic. Those features belong in the canonical React client plus shared API/contracts.

During the cutover, the old static files may remain in the repository for rollback/history, but they are not a client architecture and must not be used as the Pages build output once the React cutover is active.

`meo-pages/AGENTS.md` enforces this as a hard local rule.

## Web edge / BFF boundary

A thin Web edge is a valid long-term component. Browser OAuth/session concerns do not need to be forced into the Meo API process itself.

The Web edge may own browser-specific transport/session concerns such as:

- OAuth/OIDC PKCE start and callback
- secure HttpOnly browser session/token cookies
- CSRF/state handling
- browser session refresh handoff
- minimal same-origin API forwarding where required

It must **not** own Meo AI business state or duplicate Chat, Projects, Skills, Work, Memory, Agent, Device, artifact or model-routing logic.

Target shape:

```text
Meo Account
     │
     ▼
Web Edge / BFF
  ├── /oauth/*  browser identity/session transport
  └── /api/*    thin authenticated forwarding when needed
     │
     ▼
   meo-api
     │
     ▼
Shared Meo AI Core + Neon
```

Native platforms use their own auth/token storage adapters but enter the same Meo API and shared business contracts.

## Work / remote execution

Remote Work extends the shared backend rather than becoming a Web-specific feature:

```text
meo-api / AgentRun
       │
       ▼
 Device Relay
       │
       ▼
 meo-agentd
       │
       ▼
AgentService
```

Web and Android may act as controllers for authenticated online devices. The remote protocol, permissions, AgentRun state and device model remain shared backend contracts.

## Cloudflare Pages cutover rule

The current Pages project may keep `/meo-pages` as its build root temporarily so existing browser edge Functions continue to work, but its static build output must come from `client/`.

The intended migration order is:

1. Connect the React client to Meo Account through the thin Web edge.
2. Connect the React client to the shared Meo API contracts and make Chat work end-to-end.
3. Connect Project, Skills and Work through those same shared APIs.
4. Build the React client and serve it on a preview deployment while retaining the browser auth edge.
5. Promote the same React build path to `chat.meoarch.org` and smoke-test login/session restore/API access.
6. Remove the legacy `meo-pages/public/app.js`, `core.js`, `index.html` and `style.css` after the rollback window.
7. Keep only a thin `web-edge` for browser auth/session transport if it remains useful; remove the rest of the legacy Pages structure.

Do not add new product features to `meo-pages/public` while this migration is in progress.

## Chat transport contract

The canonical React client calls the same-origin edge with JSON:
`credentialId`, `model`, optional `conversationId`, `prompt`, and (for streaming)
`consent`. The edge forwards the body unchanged:

| Browser route                | Owning API route        |
| ---------------------------- | ----------------------- |
| `POST /api/meo/chat/prepare` | `POST /v1/chat/prepare` |
| `POST /api/meo/chat/stream`  | `POST /v1/chat/stream`  |

Do not translate these requests into direct broker inference in Pages Functions.
That drops conversation identity and bypasses server-owned history/Project context.
Meo API owns request validation, context assembly, consent payload binding and
provider options. Connection/model discovery may continue using the broker.

The edge retains same-origin checks, forwards the encrypted session's access
token, renews its HttpOnly cookie after refresh, and passes through stream bodies,
statuses and cancellation signals. A resource-server 401 must not erase a valid
browser session. Passing an AbortSignal locally does not prove production model
cancellation; verify Stop through the deployed Cloudflare/provider path.

Run `npm test --prefix meo-pages` for transport regressions. Real-account tests
must additionally verify a follow-up turn uses saved context and that the consent
shown for Project context matches the eventual stream request. History persistence
is still performed separately by React; this transport change does not make Chat
a durable background AgentRun or guarantee history after closing the tab.
