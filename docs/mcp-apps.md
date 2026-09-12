# MCP Apps

LibreChat renders tool-linked MCP Apps with the official MCP Apps SDK. The MCP server stays behind
LibreChat: a View calls LibreChat's authenticated HTTP routes, and LibreChat forwards the operation
through the MCP connection that owns that server. Browser Views never receive MCP credentials.

This integration targets the
[stable `2026-01-26` MCP Apps protocol](https://github.com/modelcontextprotocol/ext-apps/blob/v1.7.5/specification/2026-01-26/apps.mdx),
implemented by
[`@modelcontextprotocol/ext-apps` 1.7.5](https://github.com/modelcontextprotocol/ext-apps/tree/v1.7.5).
The lockfile is the executable version boundary.

## Support profile

| Area                            | Supported behavior                                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| App resource                    | A tool-linked `ui://` resource with `text/html;profile=mcp-app`, supplied as UTF-8 `text` or base64 `blob`                 |
| MCP connection                  | Shared, ordinary per-user/custom-variable, MCP OAuth, and direct OpenID connections                                        |
| View operations                 | Same-server tool calls, resource reads, resource and template listing, text messages, policy-controlled links, and logging |
| Visibility                      | Model, App, dual-visible, and omitted visibility follow the MCP Apps visibility rules                                      |
| Rendering                       | One settled App on its tool-result surface; legacy inline HTML keeps its existing adapter with resize/actions              |
| History                         | A stored settled result replays its input, unchanged result, and read-derived App document after reload                    |
| Search and public share         | Search results do not load Apps; public shares omit UI resources and retain ordinary transcript and tool text              |
| Unsupported connection profiles | OBO, Graph-token placeholders, and request-body credential placeholders do not offer an interactive App View               |

Optional draft features such as sampling, downloads, App-provided tools, state restoration, external
View URLs, and partial tool input are outside this profile.

Set `mcpSettings.apps: true` to enable MCP Apps and legacy inline HTML. When the field is omitted,
new MCP Apps stay disabled while existing legacy inline HTML remains enabled for upgrade
compatibility. An explicit `false` disables both. Authenticated clients fail closed when the
resolved policy is unavailable or malformed; configuration changes take effect when startup
configuration is refreshed, such as after a page reload.
Consequently, a new client paired with an older backend that omits the authenticated policy
withholds both MCP Apps and legacy inline HTML. LibreChat's monolithic same-version deployment is
the supported upgrade path.

MCP App browser routes use independent, per-user, one-minute limits. Configure positive integer
values at `rateLimits.mcpApps.resourcesPerMinute` and
`rateLimits.mcpApps.toolCallsPerMinute`; their defaults are 120 and 60 respectively.

## Required sandbox deployment

The chat application and Sandbox Proxy must use different URL origins. Set the client build variable
to an absolute proxy URL and allow the chat origin to frame the proxy response:

```dotenv
VITE_MCP_SANDBOX_URL=https://mcp-sandbox.example.com/api/mcp/sandbox
MCP_SANDBOX_FRAME_ANCESTORS=https://chat.example.com
```

`VITE_MCP_SANDBOX_URL` is read while building the client. It must be an absolute `http:` or `https:`
URL whose origin differs from the chat page. Missing, invalid, or same-origin values fail closed and
show the View load error.

Pass the value explicitly to either supported image build:

```bash
docker build --build-arg VITE_MCP_SANDBOX_URL=https://mcp-sandbox.example.com/api/mcp/sandbox -t librechat:mcp-apps .
docker build -f Dockerfile.multi --build-arg VITE_MCP_SANDBOX_URL=https://mcp-sandbox.example.com/api/mcp/sandbox -t librechat:mcp-apps-multi .
```

Route `https://mcp-sandbox.example.com/api/mcp/sandbox` to the LibreChat sandbox handler without
adding authentication or HTML transformation. Preserve its response headers, especially its CSP,
`Cache-Control`, `Cross-Origin-Resource-Policy`, and frame-ancestor policy. The outer proxy iframe
uses `sandbox="allow-scripts allow-same-origin"`; the proxy creates an opaque-origin inner iframe for
the server-provided document. The dedicated origin should expose only this sandbox endpoint, not
the chat application, session endpoints, or other authenticated LibreChat routes.

The outer proxy response CSP is a loader policy that permits its own blob-backed inner frame. Before
the App document runs, the proxy separately installs the View policy as a CSP meta element inside
that inner document. The View policy comes from the selected resource's `_meta.ui.csp`; with no
declaration it defaults to `frame-src 'none'` and restrictive script, style, image, media, connect,
object, and base URI directives. Valid declared domains only widen their corresponding directives.

## Server contract

An App tool declares its View on `_meta.ui.resourceUri` (the deprecated `ui/resourceUri` spelling is
accepted for compatibility). LibreChat reads that exact URI from the same authenticated MCP
connection during the original tool call and persists the selected App-profile document. The tool
result sent to the View remains unchanged, including any embedded resource body; an embedded body
does not replace the required `resources/read` document.

If the initial read fails or returns no usable exact item, the ordinary tool result remains
successful and LibreChat stores a URI-only unavailable descriptor. An authenticated interactive
history view may retry that document read; noninteractive surfaces do not. LibreChat never retries
the tool or executes the embedded App-profile body as a fallback.

Content-level `_meta.ui` from the selected read result controls that exact document. This profile
does not implement the released SDK's recommended fallback to resource-listing metadata, so servers
should repeat View metadata on the `resources/read` content item. When it is absent, LibreChat uses
the restrictive default; relying only on listing metadata is an interoperability limitation rather
than an invalid server response.

View requests remain bound to the authenticated user and originating server. The browser-facing
operations are:

| Method        | Route                                    | Body                                  |
| ------------- | ---------------------------------------- | ------------------------------------- |
| Tool call     | `POST /api/mcp/app-tool-call`            | `{ serverName, toolName, arguments }` |
| Resource read | `POST /api/mcp/resources/read`           | `{ serverName, uri }`                 |
| Resource list | `POST /api/mcp/resources/list`           | `{ serverName, cursor? }`             |
| Template list | `POST /api/mcp/resources/templates/list` | `{ serverName, cursor? }`             |

Successful routes return the raw MCP SDK result. Invalid requests return HTTP 400, missing
authentication returns 401, and a policy without MCP Apps enabled returns 403. An auxiliary
resource read uses the same authenticated server's authority; a View cannot choose another MCP
connection.

Standard MCP OAuth callbacks reuse an existing or refreshable user connection. When interactive
authorization is required, the user starts it through LibreChat's existing MCP UI; an App callback
does not open a separate authorization flow. Direct OpenID reauthentication returns the established
HTTP 401 `invalid_token` shape, rejected bearer credentials return 403, temporary refresh failure
returns 503, and unexpected failures return a generic 500 response.

## Reproducible integration fixture

The focused fixture uses the ordinary mock-provider login and conversation flow, disposable Mongo,
a real LibreChat HTTP server, a real networked MCP SDK server, the official browser `App` and host
`AppBridge`, and Chromium. Its tool result includes benign embedded HTML that differs from the
declared resource. The browser verifies one initial `resources/read`, execution of the read-derived
document, delivery of the unchanged tool result, View-originated tool/resource/list/message
operations, and reload from the persisted document without another read. A public share must retain
ordinary transcript and tool text while exposing no UI attachment, frame, or App RPC.

A second ordinary App resource permits one link origin; its `openLink` button checks both the SDK
result and the page the host opens. Keeping the first resource's CSP undeclared lets the browser
scenario independently verify the complete restrictive default. The same scenario renders an
ordinary legacy `text/html` resource with the installed `@mcp-ui/client`, verifies its resize
message, and follows a benign tool action through the normal chat/tool flow.

Use Node 24 with the exact lockfile installed and Playwright Chromium available. From the repository
root, run the profile with one command:

```bash
node e2e/mcp-apps/run.mjs
```

The runner builds the client with the chat at `http://127.0.0.1:3080` and the Sandbox Proxy at
`http://localhost:3080`. Those URLs reach the same disposable LibreChat process but have distinct
browser origins. The aliases are only a disposable local substitute for separate deployment
origins. The fixture does not contact an external model or MCP provider.

The browser spec is `e2e/specs/mock/mcp-apps.spec.ts`; the disposable official-SDK server is
`e2e/setup/fake-mcp-app-server.mjs`. Keep `E2E_MCP_APPS=true` scoped to this profile so its server and
configuration do not enter the general mock suite.

The server fixture has a faster transport/contract check that does not build LibreChat:

```bash
node --test e2e/mcp-apps/server.test.mjs
```

## Ownership and protocol boundary

```text
MCP server
  ↕ LibreChat MCP manager and the user's existing connection lifecycle
authenticated App operation routes
  ↕ raw MCP SDK request/results
one AppBridge per settled tool-result View
  ↕ source-bound postMessage
dedicated-origin Sandbox Proxy
  ↕ opaque sandboxed inner View
```

The official SDK supplies the MCP server, browser `App`, `AppBridge`, and transport contracts.
LibreChat owns authentication, same-server authorization, persistence, placement, and sandbox
policy. Its inner frame deliberately retains an opaque origin plus nonce/heartbeat liveness; this is
a documented host design beyond the basic official example and is covered by the browser fixture.
