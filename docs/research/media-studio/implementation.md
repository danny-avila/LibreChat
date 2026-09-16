# Local implementation

This branch contains an opt-in implementation, alongside the research and proposed longer-term design. It has not been connected to a paid provider during development.

## User experience

- **Media Studio** opens from the sidebar. A connection/model selector exposes the operations and controls supported by that offering.
- Queue independent generations, browse tiles, open their history, and refine a selected result. Each generation records its selected parent; retries are separate attempts on the same turn.
- Upload an image or open an existing chat image in the studio. Imports capture immutable originals before a generation can use them.
- Open the same workspace from the chat composer, or send a studio original back to a compatible chat.
- Configured native Google image models also work through ordinary chat. The existing chat invocation streams ordered text/image parts into durable media storage; it is not invoked or billed a second time by the media worker.

## Implemented provider paths

| Connection | Images                                                                         | Videos                                                  | Discovery                                                  |
| ---------- | ------------------------------------------------------------------------------ | ------------------------------------------------------- | ---------------------------------------------------------- |
| OpenRouter | Image API generation and reference editing                                     | Asynchronous Video API generation, polling and download | Explicit model allowlist plus live operation metadata      |
| OpenAI     | GPT Image generation and multipart editing                                     | Sora generation, polling and download                   | Explicit configured models and supported protocol controls |
| Google     | Gemini native text/image generation and reference editing; signed continuation | Not implemented                                         | Explicit configured image models                           |

OpenRouter image controls come from one eligible, pinned provider endpoint. Endpoint routing/privacy requirements remain in force. Video offerings that require unsupported request policy or a transformation workflow are unavailable. Unknown native model families are unavailable until their controls are described explicitly.

## Enable locally

Media is disabled when the configuration section is absent. Add the following to an existing `librechat.yaml`, preserving the deployment's existing endpoints and billing configuration:

```yaml
interface:
  media:
    use: true
    create: true

media:
  enabled: true
  integrations:
    - id: openai-images
      label: OpenAI images
      api: openai.images
      endpointRef:
        kind: builtin
        endpoint: openAI
      catalog:
        kind: configured
        models: [gpt-image-1]
      operations: [image.generate, image.edit]

    - id: gemini-images
      label: Gemini images
      api: google.generateContent
      endpointRef:
        kind: builtin
        endpoint: google
      catalog:
        kind: configured
        models: [gemini-2.5-flash-image]
      operations: [image.generate, image.edit]
```

These connections reuse the native provider credentials (`OPENAI_API_KEY` and `GOOGLE_KEY`, including the existing user-provided credential mechanism). For OpenRouter, point `endpointRef: {kind: custom, name: OpenRouter}` at an existing custom endpoint API root and use `api: openrouter.images` or `openrouter.videos` with `catalog: {kind: discovered, allowModels: [...]}`. Keep image and video integrations separate. Discovery does not authorize arbitrary models outside the allowlist.

Restart the local server after changing the media configuration. Build with `npm run frontend`, then start the normal backend. The existing local file storage must be available. The pinned agents SDK patch is applied during installation; see [`patches/README.md`](../../../patches/README.md).

`interface.media` supplies explicit role permission intent. Stored permissions are preserved when the section is omitted; runtime enablement does not silently grant creation permission. The `media.surfaces` fields control the studio and chat entry points independently.

If balance enforcement is enabled, configure each integration's `billing.creditsPerUSD` and `billing.maxCostUSD`, with a reviewed `estimatedCostUSD` when the provider does not report authoritative monetary usage. These are deployment accounting policy, not provider prices. `maxCostUSD` reserves credit before dispatch; it is not a remote provider spending cap. Actual excess cost becomes durable debt. Unknown paid cost requires reconciliation rather than inventing a zero charge. Native chat retains its normal chat accounting.

## Runtime boundaries

```text
client/src/components/Media       shared studio/chat workspace and feature-owned Jotai drafts
client/src/data-provider/Media    typed queries, polling and command recovery
packages/data-provider/src/media  public requests, responses, capabilities and YAML configuration
packages/api/src/media           services, provider adapters, worker, storage and native chat port
packages/data-schemas             media persistence, owner fences, immutable asset receipts and accounting
api/server                       dependency injection and route/startup wiring
```

The normal HTTP server hosts the worker; no Redis service or MongoDB replica set is required. MongoDB claims and durable receipts coordinate multiple processes. A submission is journalled before a provider call. An uncertain direct submission is never automatically regenerated. Async operations retain their provider handle for polling. File publication has its own receipt so a completed original can be found after a lost acknowledgment.

A media thread contains immutable content turns; each execution attempt is a separate job. Private provider recovery data and Gemini thought signatures stay server-side. Public parts carry opaque continuation references. Native replay verifies the owner, model and credential binding before loading the original content.

## Deliberate limits of this first implementation

- Originals use local storage. S3, Azure, Firebase and CloudFront media adapters remain to be implemented through the storage port.
- Tile previews lazily load originals. Separate thumbnails, video posters and transcoding are not implemented.
- Video support covers generation and documented frame inputs. Video editing, extension, upscaling, audio-only generation and native Google video are not implemented.
- Cancellation is available while queued. Accepted provider work is not advertised as cancellable without a verified provider cancellation contract.
- Generation from temporary chat is blocked; a complete temporary-retention lifecycle is required before enabling it.
- Studio Gemini continuation includes the selected parent's user/model exchange. Ordinary native chat uses its existing conversation history.
- Discovery fails closed when refreshing a provider catalog fails. It does not silently use expired capability metadata.
- There is no administrative UI for resolving uncertain provider charges or submissions yet. Such attempts remain visible as requiring attention and keep their liability reserved.

## Local verification

The repository has provider-boundary tests, standalone MongoDB persistence/accounting tests, native SDK stream/replay tests, and focused UI tests. No live inference is needed for these checks.

Local verification on 2026-09-16 includes workspace typechecks, production builds, focused tests, and the browser flow below. The existing Lighthouse conversation gate passed with 250 ms of injected latency per MongoDB query: median LCP 4.096 s (4.5 s budget), CLS 0.017 (0.1 budget), and TBT 144 ms (500 ms budget).

```sh
# Production build, startup and existing conversation performance gate
npm run lighthouse

# Real local server, browser, MongoDB and image provider fixture
E2E_BASE_URL=http://localhost:3099 npx playwright test --config=e2e/playwright.config.media.ts
```

The media browser fixture is isolated and uses synthetic images generated locally. Its screenshot is written to `e2e/media/.test-results/studio.png`. Do not run the media browser fixture and Lighthouse simultaneously: the existing test harness shares authentication/runtime state files.
