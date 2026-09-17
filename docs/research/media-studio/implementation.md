# Local implementation

This branch contains an opt-in implementation, alongside the research and proposed longer-term design.

## User experience

- **Media Studio** opens a generation conversation. Provider, model, image/video mode, and generation parameters live in the same collapsible sidebar used by the agent builder. The prompt uses the shared chat composer, with reference uploads beside the send action.
- Prompts and results read chronologically, with the composer below the thread. Queue independent generations and refine a selected result. Each generation records its selected parent; retries are separate attempts on the same turn.
- After an image completes, a follow-up prompt edits it automatically. The composer shows the current image, carries its original into the request, and advances to the next completed result. Selecting an older result pins that image; removing the reference or choosing **Image** starts a fresh generation.
- **History** switches the current conversation to a gallery with two, three, or four cards per row. Returning to the conversation preserves its draft and scroll position. Gallery filters, column count, and the selected view survive a page reload; older saved filters keep working.
- Upload references as supported by the selected model, or open an existing chat image in the studio. OpenRouter video and audio references use a direct HTTPS media link; the server downloads and archives the original, then verifies that the link still contains the same bytes before dispatch. Native connections use their documented upload APIs. SVG results retain their vector originals.
- Open the same workspace from the chat composer, or send a studio original back to a compatible chat.
- Configured native Google image models also work through ordinary chat. The existing chat invocation streams ordered text/image parts into durable media storage; it is not invoked or billed a second time by the media worker.

## Implemented provider paths

| Connection             | Images                                                                         | Videos                                                                        | Discovery                                                             |
| ---------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| OpenRouter             | Image API generation, reference editing and SVG outputs                        | Generation, editing, upscaling and avatars through the asynchronous Video API | Complete dedicated catalogs with opt-in `allModels`, or curated lists |
| OpenAI                 | GPT Image generation and multipart editing; documented Responses compositions  | Sora generation, polling and download                                         | Native profiles or explicit configured models                         |
| Google                 | Gemini native text/image generation and reference editing; signed continuation | Vertex Veo 3.1 including Lite, frames and supported reference inputs          | Native image profiles; configured Vertex models                       |
| Other native providers | BFL, Recraft, xAI, Krea, Sourceful, Alibaba, Seed, Microsoft MAI               | BFL, xAI, Runway, Alibaba, AtlasCloud, Seed, MiniMax, HeyGen                  | Documented native profiles and protocol-specific controls             |

OpenRouter image controls come from the selected eligible provider route within one OpenRouter connection. Route selection, references and advanced provider options survive saved drafts and refinement. Endpoint routing/privacy requirements remain in force. Video supports provider-specific options but does not advertise undocumented route pinning. Native providers without configured credentials remain visible and disabled. See [native provider setup and coverage](native-providers.md) for API roots, credentials, regional constraints and explicitly unavailable models.

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
    - id: vertex-videos
      label: Google (Vertex AI)
      api: google.vertex.videos
      endpointRef:
        kind: vertex
        keyFile: '${GOOGLE_SERVICE_KEY_FILE}'
        location: us-central1
      catalog:
        kind: configured
        models: [veo-3.1-fast-generate-001, veo-3.1-generate-001]
      operations: [video.generate]

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

API-key connections reuse the native provider credentials (`OPENAI_API_KEY` and `GOOGLE_KEY`, including the existing user-provided credential mechanism). Studio's Google image connection also accepts `GEMINI_API_KEY` when `GOOGLE_KEY` is unset or empty. An explicit `GOOGLE_KEY=user_provided` still requires that user's saved key. This fallback does not change chat authentication.

The Vertex connection uses the service-account JSON at `endpointRef.keyFile`, which accepts environment variable references or a literal local path. Set `GOOGLE_SERVICE_KEY_FILE` to that path for the example above. `endpointRef.projectId` can override the project in the file; `location` defaults to `us-central1`. Authentication uses renewable OAuth tokens and binds saved jobs to the service account and project rather than the current access token. API-key credentials and OpenRouter routing are independent of this connection.

In Studio, select **Video → Provider → Google (Vertex AI)**. Veo profiles expose their supported durations, resolutions, aspect ratios, audio and frame inputs. Standard Veo 3.1 supports reference images for eight-second requests; Lite supports first/last frames without reference mode. Completed video bytes are saved to the existing media store without requiring a Cloud Storage bucket. Polling retains the original Vertex operation across access-token renewal, server restart and interrupted ingestion.

Gemini image responses include private continuation signatures that can exceed the default 1 MiB part limit. For these models, set `media.limits.maxNativePartBytes: 4194304` while retaining the default 4 MiB `maxNativeRecordingBytes` total limit. These signatures remain server-side and enable later edits; a response above either configured limit cannot be accepted.

For OpenRouter, point `endpointRef: {kind: custom, name: OpenRouter}` at an existing custom endpoint API root and use `api: openrouter.images` or `openrouter.videos` with `catalog: {kind: discovered, allModels: true}`. The dedicated catalogs currently contain 52 image and 29 video models; entries without serving routes remain unavailable. Existing curated `allowModels` configurations retain their behavior; a nonempty allowlist restricts full discovery too, and `excludeModels` removes entries afterward. Keep image and video integrations separate; the mode picker displays the appropriate connection.

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
- Video editing, upscaling, avatar creation and references follow each model's documented capabilities. There is no timeline editor, standalone audio generation or Gemini Developer API video adapter.
- Cancellation is available while queued. Accepted provider work is not advertised as cancellable without a verified provider cancellation contract.
- Generation from temporary chat is blocked; a complete temporary-retention lifecycle is required before enabling it.
- Studio Gemini continuation includes the selected parent's user/model exchange. Ordinary native chat uses its existing conversation history.
- Discovery fails closed when refreshing a provider catalog fails. It does not silently use expired capability metadata.
- There is no administrative UI for resolving uncertain provider charges or submissions yet. Such attempts remain visible as requiring attention and keep their liability reserved.

## Local verification

The repository has provider-boundary tests, standalone MongoDB persistence/accounting tests, native SDK stream/replay tests, and focused UI tests. No live inference is needed for these checks.

Local verification on 2026-09-17 passed 435 focused tests: 337 API media tests, 46 Studio UI tests, 39 shared contract tests and 13 shared picker tests. All four changed workspaces passed `npx tsc --noEmit`, scoped formatting/lint passed, and the production build completed. The existing Lighthouse conversation gate passed with 250 ms of injected latency per MongoDB query: median LCP 3.849 s (4.5 s budget), CLS 0.014 (0.1 budget), and TBT 76.7 ms (500 ms budget).

The real browser checks covered all 52 image and 29 video catalog entries, Google provider routes, unavailable native accounts, gallery columns, restored image editing, hosted-reference errors and retry, and desktop/mobile media playback. Direct provider contracts were checked against their published APIs using injected transports; unconfigured native accounts were not billed or live-tested. OpenRouter live generation results are distinct from those native contract checks.

The live OpenRouter sweep exercised all 51 runnable image models and all 29 video models. Fifty image models and all 29 video models returned durable originals with verified byte counts and SHA-256 digests, including SVG, video editing, upscaling and an audio-driven avatar. All 50 image originals also passed complete pixel decoding, and all 29 video originals displayed decoded frames near the beginning and end in the browser. FLUX.2 Max ended with uncertain submission status and was not resubmitted; Meta Muse had no serving route. Failed attempts from earlier SVG/reference validation checks remain recorded separately from successful verification attempts.

```sh
# Production build, startup and existing conversation performance gate
npm run lighthouse

# Real local server, browser, MongoDB and image provider fixture
E2E_BASE_URL=http://localhost:3099 npx playwright test --config=e2e/playwright.config.media.ts
```

The media browser fixture is isolated and uses synthetic images generated locally. Its screenshot is written to `e2e/media/.test-results/studio.png`. Do not run the media browser fixture and Lighthouse simultaneously: the existing test harness shares authentication/runtime state files.
