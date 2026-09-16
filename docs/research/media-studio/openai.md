# OpenAI media API findings

Research retrieved from official OpenAI documentation on **2026-09-15**. These are API
documentation findings, not results of authenticated generation tests. Account eligibility,
regional access, quotas and commercial terms still need validation for the target deployment.

## Image generation has two distinct integration paths

The [image generation guide](https://developers.openai.com/api/docs/guides/image-generation)
describes:

| Path                                | Documented behavior                                                                                                                          | LibreChat implication                                                                                                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Images API                          | Direct image generation and editing, reference images, multiple outputs, configurable output format/quality/dimensions; base64 image results | Appropriate for direct studio generation and an explicit media action in chat. A conversational agent is optional.                                                                    |
| Responses API image-generation tool | A provider-hosted tool invoked by a supported mainline model; multi-turn editing; prior response/image references; partial-image streaming   | Preserve image-generation output items and continuation context in the native Responses integration. This is different from LibreChat's custom function/tool wrapping the Images API. |

The guide currently names `gpt-image-2.5-sunburst` and `gpt-image-2.5-flare` and also documents
earlier GPT Image models. This research does **not** select a new default or imply that the
repository's installed SDK supports every newly documented field. Validate the exact configured
model, API and SDK together during an implementation spike.

Important details from the guide:

- Responses image generation has both mainline-model usage and image-generation usage. A shared
  media accounting path must avoid charging the same usage again through the chat transaction path.
- Multi-turn continuation can use `previous_response_id` or image generation outputs in context.
  Store provider continuation separately from the public asset metadata; a downloaded image alone
  is not a complete conversation checkpoint.
- Generation and edit are distinct actions. Forced editing without an image in context fails.
- Masked editing is model-guided: the guide does not promise exact adherence to mask boundaries.
  Validate mask/input size and format, and describe the operation honestly in the editor.
- Partial-image previews have usage implications. They are transient derivatives, not separate
  completed assets or independent billable generations in LibreChat's UI.
- Format, transparency, quality and size combinations vary by model. The catalog must express
  conditional constraints rather than one universal image settings form.
- Organization verification may be required. A model appearing in a list does not establish that
  the user's credentials can generate with it.

## Video generation is a separate asynchronous API

The [video generation guide](https://developers.openai.com/api/docs/guides/video-generation)
documents Sora video generation with audio, including the following lifecycle:

1. Submit `POST /videos`; persist the returned provider ID and status.
2. Poll `GET /videos/{video_id}` or receive a `video.completed` / `video.failed` webhook.
3. Retrieve the MP4 from `GET /videos/{video_id}/content` and copy it to LibreChat storage.
4. Optionally retrieve thumbnail and spritesheet variants for gallery and playback previews.

The guide describes `queued`, `in_progress`, `completed` and `failed` states. Progress is optional
and model latency can be several minutes. This cannot be implemented reliably as a browser-held
request or a synthetic timer progressing toward 100%.

Image references can guide the first frame. The guide also describes reusable character assets,
video extensions and video edits, each with different input constraints. It now recommends
`/videos/edits` for new integrations and says the earlier remix endpoint is being deprecated.
Editing uploaded videos is restricted to eligible customers. Treat these as separately advertised
capabilities, not consequences of a single `supportsVideo: true` flag.

The ordinary download flow documents a maximum one-hour download URL lifetime; the Batch section
describes a different window for batch outputs. The portable rule is to ingest outputs promptly
and persist their actual expiry when available. A provider URL must not become the permanent asset.

`DELETE /videos/{video_id}` is documented as removing provider-stored videos. The fetched guide
does **not** establish that this cancels an in-flight render or refunds its cost. Until an exact
endpoint contract and a live test establish cancellation, offer an explicit hide/detach action,
retain the authoritative job state in history, and continue reconciliation of an already submitted
job. Do not label detachment as cancelled or imply that charging stopped.

## Validation needed before enabling an adapter

Confirm exact model access, supported input/output combinations, SDK types, webhook signature
verification, authenticated download behavior, result expiry, error shapes, provider cancellation
semantics and idempotency guarantees. Exercise both ordinary polling and webhook delivery; a
self-hosted LibreChat installation may have no publicly reachable webhook endpoint.

Cost estimates should use a configurable, dated pricing snapshot plus returned usage. No price
numbers or permanent model limits are proposed here. The API's content restrictions should yield
localized, actionable failure states and should not trigger automatic cross-provider retries.

## Sources

- [Image generation](https://developers.openai.com/api/docs/guides/image-generation), including
  multi-turn generation, streaming, masks, output customization, usage and earlier models.
- [Video generation](https://developers.openai.com/api/docs/guides/video-generation), including
  lifecycle, webhooks, supporting assets, references, extensions, edits and storage deletion.

Both pages were fetched directly; their official `.md` variants were also read. Search discovery
was limited by the available search response, so findings rely on the fetched guides themselves.
