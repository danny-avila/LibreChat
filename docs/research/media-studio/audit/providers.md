# Media provider contract audit

Audited LibreChat `ba006f3877cd62225a0111bc7a8cb4fdd71e669e`, using merge-base `385c6f8a1a42b5facdea5a9de5d00dd5e428ce45` for branch attribution. `origin/dev` tip `c7665ab1aebb925921b5e51ed76a2ba6496ba3e1` is newer than that base. This is an audit, with no runtime changes or paid provider calls.

Two new findings are independently reproduced below. Two additional results broaden existing findings 01 and 19 rather than add duplicate findings. The probe runs the built `@librechat/api` artifact; the six existing adapter suites run source code.

## P1: Media omits configured model-parameter content inspection

**Trigger:** an administrator enables `filters.modelParameters.pii` for `request_fields`, and a user puts a blocked value in a media negative prompt. The example uses Alibaba Qwen, but the missing inspection is in shared media admission.

[Media preparation](../../../../packages/api/src/media/service.ts#L411) calls the existing content inspector with the primary prompt, previous prompt, and files only. It does not supply `request.parameters`. [Alibaba submission](../../../../packages/api/src/media/adapters/alibaba.ts#L217) then transmits `negativePrompt` as `negative_prompt`. Other adapters also accept text in provider options, including storyboard prompts and avatar motion instructions.

The deterministic probe configures a synthetic `PRIVATE-[A-Z]+` rule for both message text and model request fields. It verifies all three boundaries:

1. `MediaServices.prepare()` rejects `PRIVATE-DESIGN` in the primary prompt with `forbidden`.
2. The existing `assertModelBoundContent()` rejects the same media parameter value when supplied through its supported agent options projection.
3. Real `MediaServices.prepare()` accepts `negativePrompt: 'PRIVATE-DESIGN'`, and the actual Qwen adapter sends that exact value to the intercepted provider transport.

This is a confirmed bypass of the configured local content policy, distinct from initial finding 08's missing moderation/rate-limit wiring. It does not assert that all ordinary message filtering is absent.

**Integration:** expose an appropriate plain model-parameter projection at the shared content-inspection boundary and pass all user-supplied media parameters through it before admission and dispatch. Reuse its traversal budgets, configured sources/fields, audit behavior and fail-closed behavior. Do not add media-specific regex filtering, and do not invent fake agents as the production representation merely because the diagnostic uses the inspector's current supported input. Test nested `providerOptions`, negative prompts, tightened policy on queued work, audit-only rules and disabled rules.

## P2: Sourceful collapses owner-scoped request identities into one provider idempotency key

[Repository admission](../../../../packages/data-schemas/src/methods/media.ts#L313) scopes `clientRequestId` by owner and tenant. The request schema allows an arbitrary bounded nonempty identifier; it does not guarantee a global UUID. Two users are allowed to submit the same client identifier independently.

[Sourceful](../../../../packages/api/src/media/adapters/sourceful.ts#L211) sends `SHA256(clientRequestId)` as its upstream `Idempotency-Key`. The worker [constructs provider context](../../../../packages/api/src/media/worker.ts#L143) without the persisted server job identity, so the adapter cannot namespace the key by the actual submission. Two owners sharing one configured Sourceful account and brand send the same upstream key even when their instructions differ. Distinct integrations sharing that account have the same problem.

The probe invokes the real adapter twice with different instructions and the same valid owner-scoped request identifier. It asserts that the serialized instructions differ and the outgoing idempotency keys are identical. A provider that rejects changed payloads will make one valid user submission fail; a provider that replays the prior response can return the other job's operation. **The collision is proved; actual Sourceful replay versus payload-conflict behavior, and any resulting cross-user exposure, were not tested and are not claimed as demonstrated.** The first report's saved-credential binding findings concern a different identity boundary.

**Integration:** supply the durable server-generated job/operation identity through `MediaProviderContext`, and derive the provider key from that identity and any provider-required namespace. Preserve it across recovery, and allocate a new key for a new accepted retry. Keep the database's owner-scoped client request key as the public API replay contract. Test two owners, two integrations using one account, replay of the same job, and a new retry.

## Broaden finding 19: Catalog validation also disagrees with direct provider admission

The mismatch is present in the server as well as comparison UI validation. [Shared validation](../../../../packages/api/src/media/catalog.ts#L297) validates individual controls, roles and counts. Several constraints between those fields exist only in adapters, after [the worker reserves funds and begins submission](../../../../packages/api/src/media/worker.ts#L200).

All four rows below pass the real submission schema and `validateMediaOffering()`, then the real adapter rejects them before any HTTP call:

| Provider | Schema/catalog-accepted request | Constraint enforced only at adapter |
| --- | --- | --- |
| Runway Gen 4.5 | No reference image, `aspectRatio: '1:1'` | Text-to-video supports only 16:9 and 9:16 in [submit](../../../../packages/api/src/media/adapters/runway.ts#L218), while catalog advertises all six ratios |
| MiniMax Hailuo 2.3 | `durationSeconds: 10`, `resolution: '1080P'` | [Submit](../../../../packages/api/src/media/adapters/minimax.ts#L117) requires 6 seconds at 1080P |
| Vertex Veo 3.1 | A reference image, `durationSeconds: 4` (the catalog default) | [Submit](../../../../packages/api/src/media/adapters/vertexVideo.ts#L122) requires 8 seconds with reference images |
| HeyGen Avatar IV | Reference image without audio or a voice | [Submit](../../../../packages/api/src/media/adapters/heygen.ts#L106) requires either audio or `voice_id`; the primary frontend has a special guard, but server catalog validation does not |

This creates valid-looking combinations that can become accepted jobs, reserve funds, then fail locally. It does **not** demonstrate a paid provider call for these four cases. The primary Runway/MiniMax/Vertex UI uses generic advertised controls; HeyGen's frontend-only guard illustrates another duplicate constraint implementation.

**Integration:** give each provider a pure validation/capability contract that admission and dispatch both consume. Project conditional choices/requirements into the shared media capability schema for clients. Keep protocol serialization in the adapter. Add boundary tests that feed accepted combinations from the capability contract through provider validation, including defaults, rather than only asserting that adapters reject known bad requests.

## Broaden finding 01: Direct Google Studio also discards empty signed text

The defect is not limited to the consumed SDK patch. [The direct Google response parser](../../../../packages/api/src/media/adapters/google.ts#L159) uses `if (part.text)`, dropping `{ text: '', thoughtSignature: ... }`. The probe returns that part followed by an image, then invokes a continuation using the actual parsed result: only one of the two upstream parts survives, and the signature is absent from the next outbound model history. The fixture asserts serialization loss without making a live Google call or asserting a particular provider error.

Share a canonical Google part codec and add protocol fixtures across the direct Studio adapter and agents SDK. Preserve empty signed text and ordered parts where the protocol requires them. Keep durable Studio ownership and chat stream ownership distinct.

## Breadth and verification

Read the direct adapter implementations and their catalog, request, poll, cancellation, upload/download and response contracts. The registered factory exposes 22 adapters across 16 provider families. Its static catalogs contain 80 model profiles, four explicitly unavailable; OpenRouter discovery is dynamic. The branch currently produces images and videos. Audio is reference input; no audio/music/3D output adapter is advertised by its operation schema.

| Provider family | API adapters read | Static profiles | Areas checked |
| --- | --- | ---: | --- |
| Google Vertex | `google.vertex.videos` | 3 | Model-scoped operations, inline video bounds, input/resolution dependencies |
| Microsoft | `microsoft.images` | 4 | Deployment mapping, edit conversion, parameter options |
| Black Forest Labs | `bfl.images`, `bfl.videos` | 7 | Poll URL trust, model-bound handles, output format, frame/edit/upscale contracts |
| Recraft | `recraft.images` | 15 | Style versus edit semantics, vector MIME, originals and output controls |
| xAI | `xai.images`, `xai.videos` | 4 | Image cardinality, 202 polling, moderation, currency conversion, frame dependencies |
| Runway | `runway.videos` | 2 | Native dimensions, upload, cancellation, duration/input constraints |
| Krea | `krea.images` | 3 | Upload, job states, cancellation acknowledgment, zero-cost terminal semantics |
| Sourceful | `sourceful.images` | 4 (2 unavailable) | Brand-bound assets/operations, upload finalization, idempotency, required quality |
| Alibaba | `alibaba.images`, `alibaba.videos` | 6 | Image options, multimodal uploads, regional OSS policy validation, task identity |
| Atlas | `atlas.videos` | 5 | Native variants, storyboard constraints, uploaded references, polling |
| ByteDance Seed | `seed.images`, `seed.videos` | 8 (1 unavailable) | Combined input/output limits, hosted video, typed provider options, status |
| MiniMax | `minimax.videos` | 3 | Versioned API contracts, file retrieval, references, duration/resolution dependencies |
| HeyGen | `heygen.videos` | 1 | Voice/audio exclusivity, asset upload, avatar request options |
| OpenAI | `openai.images`, `openai.videos` | 9 (1 unavailable) | Responses wrappers, multipart edit, content download origin, operation checks |
| Google | `google.generateContent` | 6 | Ordered signed parts, continuation serialization, size/count limits |
| OpenRouter | `openrouter.images`, `openrouter.videos` | Dynamic | Routing constraints, hosted input references, status/content URL projection |

Commands run successfully:

```powershell
# Repository root; exit 0 confirms the audited defects.
node docs/research/media-studio/audit/probes/providers.cjs

# packages/api; source tests, 6 suites / 159 tests passed.
npx jest --runInBand --coverage=false src/media/adapters/direct.spec.ts src/media/adapters/native.spec.ts src/media/adapters/parity.spec.ts src/media/adapters/cancellation.spec.ts src/media/adapters/vertexVideo.spec.ts src/media/adapters/rest.spec.ts
```

The [runnable diagnostic](probes/providers.cjs) intercepts the actual adapter boundary and uses only synthetic credentials/content. It performs no external HTTP calls and no database writes. Tests verify many serialization/status details but use hand-authored provider fixtures. A passing suite is not independent confirmation that all current provider endpoints/models still match the fixture. Live endpoint conformance, cloud uploads, real billing and paid generation remain untested. No runtime workspace was changed, so this pass did not repeat typechecks or Lighthouse already run at the same head.

Rejected or bounded hypotheses:

- A mask-only OpenAI edit is rejected by the shared submission schema before adapter admission; it is not an additional catalog defect.
- Native operation envelopes bind account identity and API, and pollers generally check returned task identity. Cancellation correctly distinguishes best effort, terminal confirmation and refund semantics in the six passing suites.
- Sourceful unavailable Fast models, the retired Seedance profile and the unavailable OpenAI wrapper are explicitly marked unavailable; their missing implementation is not falsely presented as live support.
- Prompt, uploaded files and hosted reference validation are present. The policy finding concerns omitted model parameters, not the absence of content protection.
- The direct-Google signed-part and catalog/admission results extend existing findings instead of counting repeated causes as new issues.
- Stream response size enforcement during auxiliary provider uploads was handed to the storage/transport specialist to avoid duplicate ownership. No untested claim is included here.
