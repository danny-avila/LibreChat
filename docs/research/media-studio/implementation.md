# Local implementation

This branch contains an opt-in implementation, alongside the research and proposed longer-term design.

## User experience

- **Media Studio** opens a generation conversation. Provider, model, image/video mode, and generation parameters live in the same collapsible sidebar used by the agent builder. The prompt uses the shared chat composer, with reference uploads beside the send action.
- YAML controls the visible connections and whether credentials come from the deployment or each user. Personal-key connections have a settings icon in the provider list and an entry under **Settings → Provider Keys**, using the same encrypted key storage and expiry controls as chat. Saving or revoking a key refreshes availability while preserving the draft.
- Prompts and results read chronologically, with the composer below the thread. Queue independent generations and refine a selected result. Each generation records its selected parent; retries are separate attempts on the same turn.
- After an image completes, a follow-up prompt edits it automatically. The composer shows the current image, carries its original into the request, and advances to the next completed result. Selecting an older result pins that image; removing the reference or choosing **Image** starts a fresh generation.
- **History** switches the current conversation to a gallery with two, three, or four cards per row. Returning to the conversation preserves its draft and scroll position. Gallery filters, column count, and the selected view survive a page reload; older saved filters keep working.
- Gallery images use generated thumbnails and video cards use posters without downloading a movie. Opening a result loads its original image or video playback rendition. Failed or missing previews fall back to the original; downloads, chat references and refinements always keep the original bytes.
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

Restart the local server after changing the media configuration. Build with `npm run frontend`, then start the normal backend. Originals inherit `fileStrategies.image`, then `fileStrategies.default`, then `fileStrategy`; `media.assets.source` overrides that choice. Local disk, S3, CloudFront, Azure Blob and Firebase reuse the deployment's existing file strategies, credentials and storage settings. The same adapters import existing owner-scoped chat files. A writable local upload directory is still needed for bounded staging and derivative processing. The pinned agents SDK patch is applied during installation; see [`patches/README.md`](../../../patches/README.md).

Storage availability checks reuse the initialized storage clients before accepting or dispatching work; they do not perform a live credential or bucket write probe. Cloud streaming uses the existing download strategy, so a range request can consume the remote prefix before returning the requested bytes. Firebase retains its existing buffered upload path and the configured media transfer limits apply.

`interface.media` supplies explicit role permission intent. Stored permissions are preserved when the section is omitted; runtime enablement does not silently grant creation permission. The `media.surfaces` fields control the studio and chat entry points independently.

## Originals and previews

Each original is staged, validated, hashed and uploaded unchanged. Publication records the original and planned derivative locations before uploading, so interrupted writes and deletion can clean up every object. Derivatives belong to the same immutable asset, owner and retention lifecycle; they do not create independent library entries or replace an input used for generation. Existing assets need no migration and continue to display their originals.

Studio originals and derivatives use the owner-authenticated `/api/media/assets/:fileId/content` route; `?rendition=thumbnail`, `poster` or `playback` selects a stored derivative. Media elements authenticate through the existing session cookie, and range requests support video seeking. Stable application URLs avoid expiring cloud download links and handle tenant storage paths consistently. Disabling Studio does not revoke an owner's access to existing retained media, while ownership and expiry checks still apply. Existing original files remain in their current storage locations.

`media.assets.derivatives` enables best-effort image thumbnails and video posters by default. It uses the existing `imageOutputType` for thumbnails/posters and the existing `media.transfers` byte limits. The default maximum dimensions are 640 × 640, preserving aspect ratio without enlargement. `timeoutMs` defaults to 120,000 for the entire derivative operation. These settings can be overridden independently; `enabled: false` retains original-only behavior.

Video processing uses FFmpeg, included in the production containers. Local deployments must install it or set `ffmpegPath` to an executable. Missing FFmpeg, decode errors, byte limits and processing timeouts omit the affected derivative and preserve the original. `transcodeVideo: true` additionally creates bounded H.264/AAC MP4 playback, using the same dimensions, timeout and transfer limits; it defaults to false. No audio is invented for a silent source. Gallery video posters avoid fetching playback bytes until the video is opened. Assets without posters retain viewport-triggered loading.

## Cancellation

Queued jobs cancel atomically before submission. New Runway video and Krea image jobs expose **Request cancellation** after acceptance when their saved policy permits it. Other providers and older jobs remain queued-only. `media.cancellation.enabled` defaults to true inside the opt-in media configuration; disabling it affects new jobs and does not break recovery of an already accepted cancellation.

Cancellation is best effort and keeps accounting liability until the provider establishes a terminal billing outcome. Runway confirms deletion but does not promise a refund or return the final cost, so a confirmed cancellation can still require billing reconciliation. Krea cancellation acknowledgement is followed by polling; only its documented failed/cancelled terminal state establishes a zero charge. If completion is observed first, the result follows the normal success path. Cancellation never resubmits a generation. See [verified provider contracts and recovery](cancellation.md) for the exact response codes, race conditions and retry policy.

## Billing and configuration ownership

Studio uses the existing `balance` and `transactions` settings and the same Balance and Transaction records as chat. Legacy `CHECK_BALANCE` and `START_BALANCE` settings retain their existing YAML override behavior. Admission reuses chat's balance initialization, expired reservation cleanup and automatic refill handling; media holds remain durable across worker restarts. There is no separate Studio wallet, key store, or billing enable switch.

| Existing policy                                   | Studio behavior                                                                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `balance.enabled: true`                           | Reserves the configured maximum before dispatch, then settles the provider-reported cost or a configured estimate into the existing balance and transaction ledger. |
| Balance disabled; transactions enabled or omitted | Records provider monetary/token usage in the existing transaction ledger without debiting a balance. Missing monetary usage remains unknown.                        |
| Balance and transactions explicitly disabled      | Runs without Studio reservations or usage transactions.                                                                                                             |
| Native image generation in ordinary chat          | The chat invocation owns accounting; recording the output in Studio does not charge it again.                                                                       |

With balance enforcement enabled, each integration requires `billing.maxCostUSD`; a connection without this policy remains unavailable before submission. Omitted `billing.creditsPerUSD` uses the existing currency of **1,000,000 token credits per USD**; explicit conversion rates remain supported. New jobs recording known monetary usage without a billing block use the same currency. The rates and accounting mode are frozen when a job is admitted; older jobs retain their original accounting data on recovery. Policy changes before dispatch cannot silently turn an admitted job into unbilled work.

`maxCostUSD` and `estimatedCostUSD` apply to the **whole provider request**, including all requested outputs. Configure a reviewed `estimatedCostUSD` only when an estimate is an acceptable fallback for missing provider monetary usage. These values are deployment accounting policy, not a provider price catalog. `maxCostUSD` reserves credit; it is not a remote provider spending cap. Reported costs above the reservation are still charged, with any uncovered amount retained as durable debt. Unknown paid cost or an uncertain submission requires reconciliation and keeps its liability reserved. No provider cost is inferred from a model name or token count.

Personal provider keys use the existing encrypted Provider Keys settings, including shared endpoint references and expiry. They follow the deployment's balance policy just as chat does; supplying a personal key does not independently disable balance enforcement. Prefer `endpointRef` to an existing chat endpoint over defining the same credential again. Optional generated thread titles use the existing chat usage accounting separately from the media provider request.

Operator resolution of uncertain submissions and charges still needs an administrative entry point before this can be presented as a complete billed-operations workflow. Automatic reconciliation repairs recorded state; it does not guess a provider charge or resubmit uncertain paid work.

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

- Derivatives are produced for new publications and imports. Existing originals are not backfilled automatically. Processing is bounded and best effort; a derivative failure is not a generation failure.
- Video editing, upscaling, avatar creation and references follow each model's documented capabilities. There is no timeline editor, standalone audio generation or Gemini Developer API video adapter.
- Accepted cancellation is available only for the verified Runway/Krea paths. Other provider jobs retain their queued-only capability and billing liability after dispatch.
- Generation from temporary chat is blocked; a complete temporary-retention lifecycle is required before enabling it.
- Studio Gemini continuation includes the selected parent's user/model exchange. Ordinary native chat uses its existing conversation history.
- Discovery fails closed when refreshing a provider catalog fails. It does not silently use expired capability metadata.
- Google Interactions is reserved in the configuration contracts but has no implemented adapter. The working native Google image path uses `google.generateContent`; Vertex video uses `google.vertex.videos`.
- There is no administrative UI for resolving uncertain provider charges or submissions yet. Such attempts remain visible as requiring attention and keep their liability reserved.

## Local verification

The repository has provider-boundary tests, standalone MongoDB persistence/accounting tests, native SDK stream/replay tests, and focused UI tests. No live inference is needed for these checks.

The earlier verification on 2026-09-17 passed 435 focused tests: 337 API media tests, 46 Studio UI tests, 39 shared contract tests and 13 shared picker tests. All four changed workspaces passed `npx tsc --noEmit`, scoped formatting/lint passed, and the production build completed. The existing Lighthouse conversation gate passed with 250 ms of injected latency per MongoDB query: median LCP 3.849 s (4.5 s budget), CLS 0.014 (0.1 budget), and TBT 76.7 ms (500 ms budget). This predates the cloud storage, derivative and accepted-cancellation additions; their final verification is reported separately.

Final local verification on **2026-09-18** passed 567 API tests across 29 suites, 121 Studio UI tests across 10 suites, and 281 shared configuration/media/balance tests. Persistence and ordinary chat accounting regressions also passed. The last navigation-focus change passed all 13 Workspace tests, and the final cookie-authentication/streaming change passed 52 focused tests. All four changed workspaces passed `npx tsc --noEmit`; scoped lint, import ordering, formatting, static checks and whitespace checks passed. The API suite ran all ten derivative tests with real FFmpeg/ffprobe, including playable H.264/AAC output and timeout/size failures.

The final real-server media browser fixture passed in 26.3 seconds. It decoded an authenticated gallery thumbnail, preserved original download/preview URLs, reloaded a failed preview without generation, refined the original, verified mobile creation/navigation focus, and handed the original into chat and the embedded Studio. Its chat destination uses an inert key and a local proxy, so the handoff exercises an enabled destination without contacting a live provider.

The exact `npm run lighthouse` command rebuilt all production artifacts and passed all three cold-navigation runs and the seeded-transcript assertion with the existing 250 ms MongoDB delay. Medians were **LCP 4.013 s**, **CLS 0.01683** and **TBT 72.7 ms**, within the unchanged 4.5 s / 0.1 / 500 ms budgets. On Windows, `CHROME_PATH` selected Playwright's Chromium headless shell and `LIGHTHOUSE_CHROME_FLAGS` supplied a separate temporary `--user-data-dir` to avoid Chrome launcher's locked-profile cleanup failure. The test code, cache reset behavior and budgets were unchanged.

This verification used local fixtures and injected provider/storage boundaries, with no live inference or cloud-account uploads. The historical live-provider exercise below is separate from validation of the new cloud adapters and cancellation contracts.

The real browser checks covered all 52 image and 29 video catalog entries, Google provider routes, unavailable native accounts, gallery columns, restored image editing, hosted-reference errors and retry, and desktop/mobile media playback. Direct provider contracts were checked against their published APIs using injected transports; unconfigured native accounts were not billed or live-tested. OpenRouter live generation results are distinct from those native contract checks.

The live OpenRouter sweep exercised all 51 runnable image models and all 29 video models. Fifty image models and all 29 video models returned durable originals with verified byte counts and SHA-256 digests, including SVG, video editing, upscaling and an audio-driven avatar. All 50 image originals also passed complete pixel decoding, and all 29 video originals displayed decoded frames near the beginning and end in the browser. FLUX.2 Max ended with uncertain submission status and was not resubmitted; Meta Muse had no serving route. Failed attempts from earlier SVG/reference validation checks remain recorded separately from successful verification attempts.

```sh
# Production build, startup and existing conversation performance gate
npm run lighthouse

# Real local server, browser, MongoDB and image provider fixture
E2E_BASE_URL=http://localhost:3099 npx playwright test --config=e2e/playwright.config.media.ts
```

The media browser fixture is isolated and uses synthetic images generated locally. Its screenshot is written to `e2e/media/.test-results/studio.png`. Do not run the media browser fixture and Lighthouse simultaneously: the existing test harness shares authentication/runtime state files.
