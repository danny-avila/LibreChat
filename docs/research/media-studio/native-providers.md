# Native media providers

Implementation reference, verified against published provider documentation on **2026-09-17**.
This describes the adapters in this branch. The earlier [provider survey](providers.md) and
[integration design](integrations.md) contain proposals and are not configuration references.
Contract tests exercise serialization, polling and output handling through injected transports;
they do not establish paid account access or successful generation for every listed model.

Media Studio can use OpenRouter and separate direct provider accounts. A model's connection
selects its credentials, API, available controls and billing route. Selecting an OpenRouter
provider route stays within OpenRouter; it does not use that provider's direct API key. Direct
connections are explicitly configured and never replace a selected OpenRouter account silently.

## Configuration

Add integrations under `media.integrations` in `librechat.yaml`. Each `id` must be unique.
`api` selects an implemented protocol; `label` names its connection in the picker.
The [configuration schema](../../../packages/data-provider/src/media/config.ts) is authoritative.

```yaml
media:
  enabled: true
  integrations:
    - id: router-images
      label: OpenRouter
      api: openrouter.images
      endpointRef: { kind: custom, name: OpenRouter }
      catalog: { kind: discovered, allModels: true }
      operations: [image.generate, image.edit]
    - id: router-videos
      label: OpenRouter
      api: openrouter.videos
      endpointRef: { kind: custom, name: OpenRouter }
      catalog: { kind: discovered, allModels: true }
      operations: [video.generate]
    - id: openai-images
      label: OpenAI direct
      api: openai.images
      endpointRef:
        kind: direct
        apiKey: ${OPENAI_API_KEY}
      catalog:
        kind: configured
        models: [openai/gpt-image-2.5-flare, openai/gpt-5.4-image-2]
      operations: [image.generate, image.edit]
interface:
  media: { use: true, create: true }
```

The named `OpenRouter` custom endpoint must already exist with its API root and credential.
`kind: builtin` can reuse the existing `openAI` or `google` account; `kind: direct` uses the
provider defaults in the table below and accepts an optional `baseURL` override.
Keys, base URLs, headers and connection options can reference `${ENVIRONMENT_VARIABLES}`.
Keep secrets in the server environment. These references and credentials are not sent to the
browser. `credentialName` optionally associates a direct integration with an existing saved
credential; `apiKey: user_provided` uses that saved credential instead of a deployment key.

### Excluding a provider connection

Set `enabled: false` on an existing `media.integrations` entry to exclude it. Omission or
`enabled: true` keeps the connection enabled. For example, this retains the configuration for
OpenRouter videos while removing it from selection:

```yaml
- id: router-videos
  enabled: false
  label: OpenRouter
  api: openrouter.videos
  endpointRef: { kind: custom, name: OpenRouter }
  catalog: { kind: discovered, allModels: true }
  operations: [video.generate]
```

Excluded connections have no picker entry or Media provider-key entry, and their models are not
discovered. To exclude a provider's images and videos, disable both configured connections.
A key shared with an enabled connection or a chat endpoint remains in Provider API keys.

New submissions, retries and queued work cannot start on an excluded connection. History remains
accessible, and already accepted provider jobs can finish polling and downloading results.
Queued work can still be cancelled. Re-enable the entry to make it selectable again without deleting its
configuration or saved personal keys.

This is a Media Studio configuration field, separate from chat endpoint configuration.
Chat's `ENDPOINTS`, model-spec menus and `endpoints.agents.allowedProviders` retain their
existing chat and agent scopes.

### Personal provider keys

Studio follows the chat endpoint credential policy. Only enabled integrations listed in YAML appear.
A configured deployment key makes a provider available without personal setup. An unresolved
environment variable remains an administrator configuration problem; it does not grant a user
permission to replace that deployment account.

Set `apiKey: user_provided` to let each user supply a personal key through the provider's settings
icon or **Settings → Data & Privacy → Provider API keys**. Selecting an unconfigured personal
provider also opens its key settings, keeping the current model and draft intact.
The dialog uses the existing encrypted, user-scoped key
store and supports expiry, replacement and revocation. Saving or removing a key refreshes the
Studio catalog without clearing the current prompt or generation parameters. This saves a
credential; account entitlements and credit are checked by the provider when a request is made.

```yaml
media:
  enabled: true
  integrations:
    - id: xai-images
      label: xAI
      api: xai.images
      endpointRef:
        kind: direct
        apiKey: user_provided
        credentialName: xai-account
      catalog: { kind: discovered, allModels: true }
      operations: [image.generate, image.edit]
    - id: xai-videos
      label: xAI
      api: xai.videos
      endpointRef:
        kind: direct
        apiKey: user_provided
        credentialName: xai-account
      catalog: { kind: discovered, allModels: true }
      operations: [video.generate]
```

Both integrations above share one saved personal account. Without `credentialName`, a direct
integration uses its `id`. A `custom` reference reuses the exact named chat endpoint's key and
its `user_provided` settings; a supported `builtin` reference reuses the built-in chat key.
Keep a shared key's encoding consistent across integrations. Native Google API-key media can
read a Google API key saved by chat, but a service-account-only chat credential does not enable
the Gemini Developer API. Vertex continues to use the administrator's configured service account.
Updating that shared Google API key from Studio preserves an unexpired service-account credential
already saved for chat. Revocation still removes the shared credential as it does in chat settings.

An explicit `baseURL: user_provided` also requires the user's own API key. Deployment keys and
configured secret headers must never be forwarded to a user-selected URL. Provider-specific
options such as Sourceful's brand ID, Azure deployment mappings, model allowlists and routing
policy remain controlled by YAML. They are not editable credential fields.
Direct integrations with configured provider `options` require a fixed API root; those options
cannot be combined with `baseURL: user_provided`.

Keep the original credential valid while accepted provider jobs finish. Changing a key, its
expiry or its configuration can require attention for those jobs; revoking a saved key does
not cancel work already accepted by the provider.

Use `catalog: { kind: configured, models: [...] }` for an explicit model list, or
`catalog: { kind: discovered, allModels: true }` for the complete implemented native profile
list. OpenRouter discovery reads its current image/video catalogs and routes. Native discovery
uses this branch's documented profiles; it does not query account entitlements.
`allowModels` and `excludeModels` constrain discovered catalogs. Vertex requires a configured
model list. A profile is usable only when its configured operations and resolved credentials
are also available; the provider can still reject unavailable deployments or exhausted balances.
Keep a direct integration configured until its accepted jobs finish. Jobs do not store its API
key or secret headers; removing that integration leaves unfinished work requiring attention.

### Uploading reference files and URLs

OpenRouter requires provider-accessible HTTPS URLs for video and audio references. Click
**Upload reference** to enter a URL in a dialog; URL fields stay hidden until this action.
Models that also support local image references offer a file choice in the same dialog.
Models with only local-file input support open the normal file chooser. Native connections
use their documented upload or inline-media APIs and their own credentials.

For direct BytePlus Seedance connections, video references also use the URL dialog. Its
[video-generation contract](https://docs.byteplus.com/en/docs/ModelArk/1520757) documents video
URLs or asset IDs; Studio uses validated HTTPS URLs. Image and audio references still accept
local files as inline data. The absence of a multipart upload endpoint does not by itself make
a provider URL-only: APIs such as [Runway](https://docs.dev.runwayml.com/assets/inputs/)
also accept inline data or provide their own upload step.

Supply a direct HTTPS link to the media bytes that needs no LibreChat cookie or authorization
header. A public object URL or a suitably scoped signed storage URL works; it must remain valid
through queueing and provider processing. This branch does not automatically host local files
on the public internet. OpenRouter's [Files API](https://openrouter.ai/docs/guides/features/files-api.md)
is for workspace/sandbox files and does not produce usable video/audio reference URLs.

LibreChat downloads a supplied URL without credentials, applies public-network and transfer
limits, checks the actual container and media role, and archives the original. It checks the
URL's bytes against that archived digest again before submission. A changed or expired link
must be replaced before generation can proceed. Content type and filename alone do not establish
that a URL contains supported audio or video.

### Google through Vertex or a Gemini API key

Vertex uses the existing service account file, without a separate Gemini API key. Configure
image and video integrations with the appropriate model location:

```yaml
media:
  enabled: true
  integrations:
    - id: vertex-images
      label: Google Vertex
      api: google.generateContent
      endpointRef:
        kind: vertex
        keyFile: ${GOOGLE_APPLICATION_CREDENTIALS}
        projectId: ${GOOGLE_CLOUD_PROJECT}
        location: global
      catalog:
        kind: configured
        models: [google/gemini-3.1-flash-image, google/gemini-3-pro-image]
      operations: [image.generate, image.edit]
    - id: vertex-videos
      label: Google Vertex
      api: google.vertex.videos
      endpointRef:
        kind: vertex
        keyFile: ${GOOGLE_APPLICATION_CREDENTIALS}
        projectId: ${GOOGLE_CLOUD_PROJECT}
        location: us-central1
      catalog:
        kind: configured
        models: [google/veo-3.1, google/veo-3.1-fast, google/veo-3.1-lite]
      operations: [video.generate]
```

`projectId` is optional when the service account file supplies it. Choose a location where the
specific model is available and grant the account permission to invoke it. The server obtains
and refreshes access tokens; neither tokens nor the file contents belong in YAML.
Existing raw configured IDs, including `gemini-3-pro-image-preview` and
`veo-3.1-fast-generate-001`, remain accepted. Canonical profile lists use the OpenRouter IDs once.

For the Gemini Developer API, use `api: google.generateContent` with
`endpointRef: { kind: direct, apiKey: "${GEMINI_API_KEY}" }`. The builtin Google connection
also recognizes `GOOGLE_KEY` and `GEMINI_API_KEY`. Veo in this implementation uses Vertex,
not the Gemini Developer API video endpoint.

### Azure OpenAI and Microsoft MAI

Azure OpenAI uses `openai.images` or `openai.videos` with the configured Azure API root and
authentication headers. Existing named custom endpoints can be reused. The API root must expose
the matching OpenAI route, such as `/openai/v1/images/generations` or `/openai/v1/responses`;
a chat-completions URL is not an API root. Legacy Azure jobs-style video endpoints are a
different protocol and are not implemented by the OpenAI video adapter.

Direct connection `options` can map a documented native ID to a deployment name:
`deployment.gpt-image-2.5-flare: my-image-deployment`. Responses compositions use separate
`deployment.gpt-5.4` and `deployment.gpt-image-2` mappings. The Azure resource must support
the exact models and API operations. A direct OpenAI profile does not establish Azure availability.

Microsoft MAI models use their own Foundry API, not the Azure OpenAI image route:

```yaml
- id: microsoft-images
  label: Microsoft Foundry
  api: microsoft.images
  endpointRef:
    kind: direct
    apiKey: ${AZURE_MAI_API_KEY}
    baseURL: https://YOUR-RESOURCE.services.ai.azure.com/mai/v1
    options:
      deployment.MAI-Image-2.6: YOUR-MAI-DEPLOYMENT
  catalog:
    kind: configured
    models: [microsoft/mai-image-2.6]
  operations: [image.generate, image.edit]
```

This is one entry in `media.integrations`. MAI requires a resource-specific `baseURL`; there
is no global default. Its adapter uses `api-key` authentication. The API also documents Entra
authentication, but this integration does not obtain or refresh Entra tokens.

## Connections and provider requirements

These roots are defaults for `kind: direct`, except Vertex and MAI. A regional override must
serve the same documented protocol and native model IDs. API credentials authenticate provider
requests; result downloads and signed storage uploads do not receive those credentials.

| Integration API                    | API root                                           | Authentication and setup                                                                                                                                                           | Official contract                                                                                                                                                                                                    |
| ---------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai.images`, `openai.videos`   | `https://api.openai.com/v1`                        | Bearer API key; optional `deployment.<native-id>` options for deployment names.                                                                                                    | [Images](https://developers.openai.com/api/docs/guides/image-generation), [video](https://developers.openai.com/api/docs/guides/video-generation)                                                                    |
| `google.generateContent`           | `https://generativelanguage.googleapis.com/v1beta` | `x-goog-api-key`, or `endpointRef.kind: vertex` for service-account authentication.                                                                                                | [Gemini images](https://ai.google.dev/gemini-api/docs/image-generation)                                                                                                                                              |
| `google.vertex.videos`             | Derived from project and location                  | Vertex service account; configured models only.                                                                                                                                    | [Veo 3.1 models](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/veo/3-1-generate)                                                                                                             |
| `microsoft.images`                 | Resource-specific `/mai/v1`                        | `api-key`; model deployment and resource region must match.                                                                                                                        | [MAI Foundry API](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-mai-image)                                                                                                |
| `bfl.images`, `bfl.videos`         | `https://api.bfl.ai/v1`                            | `x-key`; poll the returned regional operation URL.                                                                                                                                 | [BFL OpenAPI](https://api.bfl.ai/openapi.json)                                                                                                                                                                       |
| `recraft.images`                   | `https://external.api.recraft.ai/v1`               | Bearer API key; vector models return SVG.                                                                                                                                          | [Recraft OpenAPI](https://external.api.recraft.ai/doc/spec/external-api.yaml)                                                                                                                                        |
| `xai.images`, `xai.videos`         | `https://api.x.ai/v1`                              | Bearer API key.                                                                                                                                                                    | [xAI OpenAPI](https://docs.x.ai/openapi.json)                                                                                                                                                                        |
| `runway.videos`                    | `https://api.dev.runwayml.com/v1`                  | Bearer API key; adapter adds `X-Runway-Version: 2024-11-06`. Large inputs use ephemeral signed uploads.                                                                            | [Runway OpenAPI](https://docs.dev.runwayml.com/openapi.json)                                                                                                                                                         |
| `krea.images`                      | `https://api.krea.ai`                              | Bearer API key; edit references upload through `/assets`.                                                                                                                          | [Krea OpenAPI](https://api.krea.ai/openapi.json)                                                                                                                                                                     |
| `sourceful.images`                 | `https://www.riverflow.ai`                         | `Authorization: Riverflow-Key <key>`; `endpointRef.options.brandId` must be a UUID. Key scopes must permit `assets:upload`, `assets:read`, `freestyle:generate` and `images:edit`. | [Riverflow OpenAPI](https://www.riverflow.ai/api/docs/openapi.json)                                                                                                                                                  |
| `alibaba.images`, `alibaba.videos` | `https://dashscope-intl.aliyuncs.com`              | Bearer API key; account, region and model access must match. See the input upload limitation below.                                                                                | [Qwen images](https://www.alibabacloud.com/help/en/model-studio/qwen-image-generation-and-editing-api-reference), [Wan video](https://www.alibabacloud.com/help/en/model-studio/wan3-video-generation-api-reference) |
| `atlas.videos`                     | `https://api.atlascloud.ai/api/v1`                 | Bearer API key; AtlasCloud serves the implemented Kling and Wan variants.                                                                                                          | [Video models](https://www.atlascloud.ai/docs/models/video), [predictions](https://www.atlascloud.ai/docs/predictions), [uploads](https://www.atlascloud.ai/docs/upload-files)                                       |
| `seed.images`, `seed.videos`       | `https://ark.ap-southeast.bytepluses.com/api/v3`   | Bearer BytePlus API key; international native model IDs. A mainland Volcengine host override does not convert those IDs.                                                           | [Seedream](https://docs.byteplus.com/en/docs/ModelArk/1541523), [Seedance](https://docs.byteplus.com/en/docs/ModelArk/1520757)                                                                                       |
| `minimax.videos`                   | `https://api.minimax.io`                           | Bearer API key; Hailuo 3 and Hailuo 2.3 use different documented endpoints.                                                                                                        | [H3 create](https://platform.minimax.io/docs/api-reference/video-generation-v2-create.md), [legacy image-to-video](https://platform.minimax.io/docs/api-reference/video-generation-i2v.md)                           |
| `heygen.videos`                    | `https://api.heygen.com`                           | `x-api-key`; Avatar IV requires an image plus recorded audio or an explicit voice ID.                                                                                              | [Create video](https://developers.heygen.com/reference/create-video.md), [upload audio](https://developers.heygen.com/reference/upload-asset.md)                                                                     |

`endpointRef.options` contains connection configuration such as Sourceful's brand or Azure
deployment names. Generation-specific advanced settings belong in request
`parameters.providerOptions`; only the names advertised by the selected model and operation
are accepted. For example, HeyGen's `voice_id` is a generation setting, not a connection option.

## Implemented model profiles

The IDs below are canonical picker/configuration IDs. Provider adapters translate them to their
documented native names and request shapes. Capabilities can differ between the native API and
an OpenRouter route for the same ID; Media Studio uses the selected connection's controls.

| Provider          | Image profiles                                                                                                                      | Video profiles                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| OpenAI            | GPT Image 2.5 Sunburst / Flare, GPT Image 2, GPT Image 1 / Mini; GPT-5.4 Image 2 and GPT-5 Image compositions                       | Sora 2 Pro; existing configured `sora-2` remains supported     |
| Google            | Gemini 3.1 Flash Lite Image, 3.1 Flash Image, 3 Pro Image, their two existing Preview image variants, 2.5 Flash Image               | Veo 3.1, Fast and Lite through Vertex                          |
| Microsoft         | MAI Image 2.6 / Flash and 2.5 / Pro                                                                                                 | —                                                              |
| Black Forest Labs | FLUX.2 Max / Pro / Flex / Klein 4B                                                                                                  | FLUX 3 Video, Video Edit and Video Upscale                     |
| Recraft           | V4 Styles / Pro / Vector / Pro Vector; V4.1 / Pro / Vector / Pro Vector / Utility / Utility Pro; V4 / Pro / Vector / Pro Vector; V3 | —                                                              |
| xAI               | Grok Imagine Image 2.0 and Image Quality                                                                                            | Grok Imagine Video and Video 1.5                               |
| Runway            | —                                                                                                                                   | Gen-4.5 and Aleph 2                                            |
| Krea              | Krea 2 Large / Medium / Medium Turbo                                                                                                | —                                                              |
| Sourceful         | Riverflow v2 Pro and v2.5 Pro                                                                                                       | —                                                              |
| Alibaba           | Qwen Image 3 / Pro                                                                                                                  | Wan 3.0 / Prime; HappyHorse 1.0 / 1.1                          |
| AtlasCloud        | —                                                                                                                                   | Kling V3.0 Pro / Standard, Kling Video O1, Wan 2.7 and Wan 2.6 |
| BytePlus          | Seedream 5.0 Pro / Lite and 4.5                                                                                                     | Seedance 2.5, 2.0, 2.0 Fast and 2.0 Mini                       |
| MiniMax           | —                                                                                                                                   | Hailuo 3, Hailuo 3 Max and Hailuo 2.3                          |
| HeyGen            | —                                                                                                                                   | Avatar IV                                                      |

### OpenAI mappings and compatibility

`openai/gpt-image-*` profiles call the native Image API with the `openai/` prefix removed.
Existing raw configured IDs, such as `gpt-image-1.5`, still pass through the same API.
Image edits use multipart references and an optional mask. Output format, compression, quality,
size and transparency controls follow the selected model profile.

| OpenRouter ID             | Native request                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| `openai/gpt-5.4-image-2`  | Responses `model: gpt-5.4` with `image_generation` tool `model: gpt-image-2`                |
| `openai/gpt-5-image`      | Responses `model: gpt-5` with `image_generation` tool `model: gpt-image-1`                  |
| `openai/gpt-5-image-mini` | Unavailable natively; the published GPT-5 Mini tool list does not document this composition |

These are explicit one-image Responses compositions, not native model aliases. They use
`store: false`, force the image tool and preserve uploaded image references and masks.
The published [GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4) and
[GPT-5](https://developers.openai.com/api/docs/models/gpt-5) model pages list image generation;
the [GPT-5 Mini](https://developers.openai.com/api/docs/models/gpt-5-mini) page does not.
The standalone GPT Image 1 Mini Image API remains supported.

Sora preserves saved native operation IDs, polls the existing job and authenticates its content
download only against the configured origin. The current video guide documents 4, 8, 12, 16 and
20 second clips and Sora 2 Pro 1080p output; older configured sizes remain available.

### Google image editing and Veo inputs

Gemini uses `generateContent` with text and inline images. Native follow-up edits replay the
previous prompt, original response image/text parts and thought signatures before the new turn.
Gemini 3 image profiles accept up to 14 references, bounded further by deployment limits;
Gemini 2.5 accepts up to three. Flash Lite exposes 1K output only, Flash exposes 512/1K/2K/4K,
and Pro exposes 1K/2K/4K. These model-specific settings are sent in `imageConfig`.

Veo canonical IDs map to `veo-3.1-generate-001`, `veo-3.1-fast-generate-001` and
`veo-3.1-lite-generate-001`. All three support text generation and first/last image frames.
Standard and Fast also accept up to three reference images; Lite does not. A last frame needs
a first frame, and frame inputs cannot be combined with reference-image mode. Reference-image
mode requires eight seconds. Standard also exposes 4K at eight seconds; Fast and Lite expose
720p/1080p. Images use the native JPEG/PNG contract; WebP references are converted to PNG.
See Google's [reference image](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/generate-videos-from-references)
and [first/last frame](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/generate-videos-from-first-and-last-frames)
contracts. Video extension and generated-video input are not advertised by this Veo adapter.

### Provider-specific constraints

- MAI produces one PNG and accepts one native edit reference. Its documented edit endpoint has
  a singular `image` field; OpenRouter's larger reference count is not copied to the native
  capability. Generation dimensions respect the minimum 768 pixels per side and maximum
  1,048,576 pixels. MAI 2.6 supports `auto_aspect_ratio` and `web_grounding`.
- Recraft's four Styles models require style reference images during generation and do not
  advertise native content editing. Vector variants preserve SVG originals.
- xAI Video 1.5 supports documented voice presets through `reference_audios`; custom voice
  recordings require partner access and are not advertised. The legacy Image Quality model
  remains a distinct native ID while the provider supports it.
- Sourceful v2.5 Pro requires an explicit `low`, `medium`, `high` or `xhigh` quality. Its native
  v2 Pro model key is `riverflow-2-pro`.
- DashScope Wan accepts inline image references, but video/audio references need temporary
  OSS uploads. The adapter obtains a policy, uploads to the signed OSS destination and submits
  the resulting `oss://` reference. Alibaba's [temporary upload documentation](https://www.alibabacloud.com/help/en/model-studio/get-temporary-file-url)
  describes this facility as Beijing-only and intended for development/testing despite
  international URLs in examples. Use an eligible matching regional account. A failed upload
  prevents generation submission; this implementation has no alternate durable-hosting port.
- BytePlus uses international deployment IDs, including
  `dola-seedream-5-0-pro-260628`, `seedream-5-0-260128`, `seedream-4-5-251128`,
  `dreamina-seedance-2-5-260628`, `dreamina-seedance-2-0-260128`,
  `dreamina-seedance-2-0-fast-260128` and `dreamina-seedance-2-0-mini-260615`.
  Seedream 5 Pro transparent output requires one PNG. Seedance 2.5 edit/extension options
  require a video reference and the documented adaptive settings.
- AtlasCloud chooses the exact text-to-video or image-to-video variant. Kling storyboard
  durations are checked before uploads. The normal Wan 2.6 image-to-video route is used;
  an inconsistent documentation example naming a different variant does not change the route.
- MiniMax Hailuo 3 uses the v2 task API; Hailuo 2.3 uses the v1 task and file APIs. Hailuo 2.3
  1080p requires six seconds. Native numeric file/task IDs are preserved without unsafe rounding.
- HeyGen Avatar IV requires one image and either recorded audio or `providerOptions.voice_id`.
  With a voice ID, the prompt is the spoken script; with recorded audio, it is the motion prompt.
  The adapter never chooses a voice automatically.

### Explicit native gaps

| Model                                                          | Native status                                                                                       |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `openai/gpt-5-image-mini`                                      | No documented GPT-5 Mini + Image Mini tool composition; shown unavailable natively.                 |
| `sourceful/riverflow-v2-fast`, `sourceful/riverflow-v2.5-fast` | Published Riverflow native model enums do not establish these mappings; shown unavailable natively. |
| `bytedance/seedance-1-5-pro`                                   | Retired by BytePlus; shown unavailable instead of substituting another model.                       |
| `meta/muse-image`                                              | No verified public native API adapter. The captured OpenRouter catalog also had no serving routes.  |

OpenRouter availability is discovered independently. A model listed by OpenRouter without a
serving route remains unavailable until routing metadata changes. An implemented native adapter
does not grant model access, create a deployment or add account credits.

## Stored media and verification

Original images, video and reference audio retain their bytes, digest and durable receipt.
Uploads and downloads remain bounded by `media.transfers.maxImageBytes` (20 MiB by default),
`maxVideoBytes` (512 MiB) and `maxAudioBytes` (20 MiB), plus the existing file policy and native
provider limits. Queued work retains its selected account binding; polling and output recovery
reuse the saved operation. An uncertain submission is not automatically submitted again.
Stopping local work is not evidence that a provider cancelled or refunded remote work.

Supported originals are PNG, JPEG, WebP, safe SVG, MP4 and WebM. Reference audio supports
validated MP3 (`audio/mpeg`), PCM/float WAV (`audio/wav`), Opus/Vorbis OGG (`audio/ogg`) and
non-fragmented audio-only M4A with `mp4a` tracks (`audio/mp4`). Common aliases such as
`audio/x-wav` and `audio/x-m4a` normalize to those formats. Each model still limits which roles
and media types it accepts.

SVG is parsed as XML and checked against the shared sanitization policy. Malformed XML, active
content, foreign objects, external references and unsupported styling are rejected. Accepted
originals remain unchanged and render through an image element; provider inputs use a PNG
conversion. Rejection is preferable to storing a silently altered vector original.
Recraft's inert root `display: block` style and base64-only C2PA manifest inside root metadata
are accepted without changing the original. Keeping the manifest preserves provenance bytes;
the storage validator does not verify its signature or authenticity.

Focused tests are in [parity.spec.ts](../../../packages/api/src/media/adapters/parity.spec.ts),
[vertexVideo.spec.ts](../../../packages/api/src/media/adapters/vertexVideo.spec.ts),
[native.spec.ts](../../../packages/api/src/media/adapters/native.spec.ts),
[direct.spec.ts](../../../packages/api/src/media/adapters/direct.spec.ts), and
[storage.spec.ts](../../../packages/api/src/media/storage.spec.ts). They cover actual adapter
and storage logic at the injected HTTP/persistence boundary. Live account tests and manual UI
results must be reported separately from these contract checks.
