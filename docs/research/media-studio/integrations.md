# Media configuration and integration contracts

Proposed design, **2026-09-15**; no runtime changes. `MediaJob` is the execution record. This
complements [design.md](./design.md), the [backend audit](./backend.md), and dated [OpenRouter](./openrouter.md)/[native-provider](./providers.md) findings. Names and numeric defaults below require implementation validation.

## Repository constraints that affect the design

| Existing seam                                                                                                                               | Reuse and required change                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [configSchema / getSchemaDefaults](../../../packages/data-provider/src/config.ts)                                                           | Own new fields here. `getSchemaDefaults` reads immediate `ZodDefault` nodes; it does not recursively materialize nested defaults.                                                                           |
| [AppService](../../../packages/data-schemas/src/app/service.ts) and [override service](../../../packages/api/src/app/service.ts)            | Carry the section through effective-config assembly and parse it after overrides. An initially validated YAML object does not validate later DB patches.                                                    |
| [Provider runtime context](../../../packages/api/src/types/endpoints.ts)                                                                    | Request-free initialization and injected DB methods exist, but Google/OpenAI initializers still read `process.env`; reuse extracted resolution rules, not those global reads.                               |
| [Key methods](../../../packages/data-schemas/src/methods/key.ts)                                                                            | Existing key storage encrypts values and `getUserKey` decrypts them. Expiry is a separate read; its result is not returned or enforced by that getter. Workers need one authoritative record/expiry lookup. |
| [Provider identities](../../../packages/data-provider/src/schemas.ts) and [FileSources](../../../packages/data-provider/src/types/files.ts) | Reuse endpoint/provider identity and storage source enums. Media API protocol, upstream serving endpoint, and producer model are separate fields.                                                           |

## Configuration shape and compatibility

Add `media: mediaConfigSchema.optional()` to `configSchema`; the nested schema is strict and
versioned. Absence resolves disabled with empty integrations and no fresh-install discovery/work.
Disabling/removing config stops paid admissions; accepted jobs still reconcile where bindings permit.
Before first admission, persist an activation marker; on restart, inspect it outside chat startup's
critical path and initialize reconciliation when obligations may remain. This is an implementation
gate: marker clearing needs a drained-state protocol covering media Files/retainers, unpublished
writes, provider/credential cleanup and settlement receipts, not an empty queue observation. A fresh
disabled deployment performs only that lightweight readiness check, without discovery or a worker.
Explicit `enabled: true` without a usable integration is a configuration error.
The following is an enabled example; the existing named endpoints supply credentials/base URLs:

```yaml
media:
  schemaVersion: 1
  enabled: true
  surfaces:
    studio: true
    chat: true
  integrations:
    - id: router-images
      api: openrouter.images
      endpointRef: { kind: custom, name: OpenRouter }
      catalog:
        kind: discovered
        allowModels: [google/gemini-3.1-flash-image, openai/gpt-image-2]
      operations: [image.generate, image.edit]
    - id: router-video
      api: openrouter.videos
      endpointRef: { kind: custom, name: OpenRouter }
      catalog:
        kind: discovered
        allowModels: [google/veo-3.1]
      operations: [video.generate]
    - id: google-native
      api: google.interactions
      endpointRef: { kind: builtin, endpoint: google }
      catalog:
        kind: configured
        models: [gemini-3.1-flash-image]
      operations: [image.generate, image.edit]
interface:
  media: { use: true, create: true }
```

Model IDs are illustrative; choose enabled IDs from a validated deployment catalog. `api` is a discriminated union, initially `openrouter.images`, `openrouter.videos`,
`openai.images`, `openai.videos`, `google.interactions`, and `google.generateContent`.
Add Cloud/other API families only with an implemented adapter. Do not turn `EModelEndpoint` into
a list of media APIs or infer an API contract from branding/hostname alone.

`endpointRef` reuses a built-in `EModelEndpoint` or a normalized named custom endpoint. It is not
an arbitrary URL or key name supplied by the browser. Resolve references against effective config
with existing precedence rules. Keep API roots explicit in the resolved server connection;
blindly appending `/images` to a chat-completions URL is not a supported conversion.
The public `selection.connectionId` maps to `integrations[].id`; it is not the upstream provider ID.

Model arrays are an allowlist, not proof of capability; discovery starts with an empty allowlist and enabling a connection does not automatically admit every new paid model.
Integration IDs must be unique; operations/API pairs and model-specific defaults must validate.
Future provider-specific config uses strict tagged schemas, never a free-form `addParams` bag.

Suggested enabled-runtime defaults, all fields owned by `mediaConfigSchema`:

| Section       | Fields and proposed defaults                                                                                |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| `surfaces`    | `studio: true`, `chat: true`; subordinate to `enabled: false` by default                                    |
| `catalog`     | `refreshMs: 900000`, `maxStaleMs: 86400000`, `requestTimeoutMs: 10000`                                      |
| `queue`       | `maxPendingPerUser: 20`, `maxPendingTotal: 200`, `maxQueueAgeMs: 3600000`                                   |
| `execution`   | `maxActivePerUser: 2`, `maxActivePerIntegration: 4`, `maxActiveTotal: 8`                                    |
| `worker`      | `tickMs: 1000`, `leaseMs: 60000`, `renewEveryMs: 20000`, `readinessCheckIntervalMs: 60000`                  |
| `polling`     | `providerIntervalMs: 30000`, `clientIntervalMs: 5000`; honor provider retry hints                           |
| `timeouts`    | `submitMs: 300000`, `pollRequestMs: 10000`, `downloadMs: 120000`                                            |
| `recovery`    | `attentionAfterMs: 86400000`; prompts operator/user action, never declares remote cancellation              |
| `credentials` | `minValidityAtDispatchMs: 60000`                                                                            |
| `transfers`   | `maxImageBytes: 20971520`, `maxVideoBytes: 536870912`, `downloadAttempts: 3`, `retryDelaysMs: [1000, 5000]` |
| `assets`      | `source: null` inherits existing storage selection; `retention: "inherit"`; originals preserved             |

Numeric values are finite bounded integers; validate relationships such as `renewEveryMs < leaseMs`
and per-user concurrency no greater than total concurrency. Provider maximums further constrain
operator limits. Request timeouts stop waiting; they do not settle an ambiguous submission.
`assets.source`, when supplied, uses the existing writable `fileStorageSchema`/`FileSources`
subset and verifies download/delete capabilities. Reuse file size and retention policy where it is
already authoritative; media transfer caps are additional bounds, not a bypass.

Provide one pure `resolveMediaConfig` using the nested schema's parse/defaults, invoked after base
and override assembly. Preserve absence separately when seeding permissions. An invalid enabled
section must fail closed with a useful config diagnostic; do not silently accept stripped keys.
Do not scatter fallback constants or special-case missing nested values throughout consumers.

Adding this optional section requires no rewrite of old YAML, existing endpoints, image tools,
`imageOutputType`, resizing preferences, or saved keys. The audited [YAML loader](../../../api/server/services/Config/loadCustomConfig.js)
calls `configSchema.strict().safeParse(customConfig)`: an unknown `media` section fails validation;
validation bypass falls back to defaults. Deploy compatible readers before adding the new section.
Test absent/empty/disabled/partial sections and saved config-version transitions.

## Role gates, overrides, and startup projection

Add `PermissionTypes.MEDIA` with `Permissions.USE` (studio/catalog/read existing owned media) and
`Permissions.CREATE` (new generation/edit/variant). Initial USER/ADMIN defaults are false until
explicit permission configuration; resource ownership and tenant checks remain independent.
`interface.media` only seeds these permission bits. `media.enabled` is the runtime gate and must
not rewrite stored role permissions when disabled or restored.

Update [permissions/roles](../../../packages/data-provider/src/permissions.ts),
[role defaults](../../../packages/data-provider/src/roles.ts), `PERMISSION_TYPE_INTERFACE_FIELDS`,
[loadDefaultInterface](../../../packages/data-schemas/src/app/interface.ts), and
[updateInterfacePermissions](../../../packages/api/src/app/permissions.ts). Preserve explicit
stored denials when no YAML permission intent exists; add missing permission bits through the
existing migration path. Use the role editor and existing invalidation hooks; invalidate affected
auth-user cache entries whenever a migration/mutation also changes user documents.

For v1, place `media` in `BASE_ONLY_CONFIG_SECTIONS`: configure policy/integrations in YAML and
access in the role editor. `BASE_PRINCIPAL_CONFIG_SECTIONS` permits tenant-base overrides, which
must not raise process-wide budgets. Register safe admin inspection/diagnostics, protect
`interface.media` permission keys from DB override, and defer tenant media-policy overrides until
ownership and quota boundaries are explicit. Bind resolved endpoint destinations to job revisions.

The authenticated startup payload should expose only an explicit `media` projection such as
`{ enabled, studio, chat, canCreate, clientPollIntervalMs }`; unauthenticated startup exposes none.
Put the projection helper in TypeScript and leave [config.js](../../../api/server/routes/config.js)
as a call site. Do not serialize integration definitions, credential references, API keys, headers,
provider continuation, or entire config. Fetch model catalogs on media use, cache them server-side,
and reuse loaded request user/config/permissions. Startup must not await provider discovery.

## Factory and adapter contracts

Construct `createMediaServices(deps)` in the host, returning `commands`, `queries`, `worker`, and
`nativeRecording`. Inject resolved config snapshots, plain repository interfaces, credential
resolver, provider-client factories, storage/importer, clock, IDs, accounting, and logging.
Commands accept an authenticated plain principal/config context; queries return safe snapshots.
The worker owns provider polling; browser polling reads those snapshots. No new broker or SSE
transport is required. `/api` keeps registration and calls into these TypeScript services.

Keep semantic operations separate from execution protocols. The following abbreviated interfaces
refer to proposed shared request/result types; they are design sketches, not compiled code:

```ts
type MediaAction =
  | {
      operation: 'image.generate';
      prompt: string;
      inputs: ImageReferenceInput[];
      parameters: ImageParameters;
    }
  | {
      operation: 'image.edit';
      prompt: string;
      inputs: ImageEditInputs;
      parameters: ImageParameters;
    }
  | {
      operation: 'video.generate';
      prompt: string;
      inputs: VideoInputs;
      parameters: VideoParameters;
    };

type MediaCapability =
  | {
      operation: 'image.generate';
      inputs: ImageInputs;
      controls: ImageControls;
      execution: Execution;
    }
  | {
      operation: 'image.edit';
      modes: ImageEditMode[];
      controls: ImageControls;
      execution: Execution;
    }
  | {
      operation: 'video.generate';
      inputs: VideoInputRoles;
      controls: VideoControls;
      execution: Execution;
    };

type Execution =
  | { kind: 'direct'; previews: boolean }
  | { kind: 'remote-job'; cancellation: 'unsupported' | 'best-effort' | 'confirmed' }
  | { kind: 'conversation'; continuation: 'replay' | 'remote-id'; outputs: OutputModality[] };

interface DirectMediaAdapter<TAction extends MediaAction> {
  execute(input: Prepared<TAction>, context: CallContext): Promise<DirectOutcome>;
}
interface RemoteMediaAdapter<TAction extends MediaAction> {
  submit(input: Prepared<TAction>, context: CallContext): Promise<SubmissionOutcome>;
  poll(reference: ProviderJobRef, context: CallContext): Promise<ProviderJobSnapshot>;
  openOutput(reference: ProviderOutputRef, context: CallContext): Promise<MediaByteStream>;
  cancellation: CancellationCapability;
}
interface ConversationalMediaAdapter {
  executeTurn(input: PreparedMediaTurn, context: CallContext): Promise<ConversationOutcome>;
}
interface NativeRecording {
  attach(context: ExistingChatInvocation): Promise<NativeMediaSink>;
}
```

Define `ImageParameters`, `VideoParameters`, input roles, masks and control domains in shared strict
schemas; generate their TS types with `z.infer`. `Prepared<T>` contains authorized immutable asset
revisions, selected integration/model/API, effective parameters and credential-bound client access.
`CallContext` carries signal, bounded transfer policy and preview sink, not Express request objects.
Provider clients, Mongoose types and raw secrets never become shared/public contract types.

`SubmissionOutcome` is `accepted`, `rejected`, or `uncertain`; direct/conversation outcomes are
`completed`, `rejected`, or `uncertain`. Uncertainty never enters blind retry. Accepted remote work
carries durable provider identity; remote status remains separate from local import state.
Completed results preserve ordinal text/assets, typed usage, revised prompt and private continuation;
bodies stream through importer handles, not job JSON. A tagged cancellation capability has a method
only when implemented; aborting a signal is not proof of remote cancellation.

## Capability resolution and gateway parameters

Resolve eligibility as the intersection of deployment allowlist, implemented adapter/operation,
model API capabilities, selected endpoint capabilities, role policy and authorized credentials.
For each control, intersect enum values/ranges and permitted input roles; then enforce cross-field
rules such as image format/transparency or video duration/resolution/audio combinations.

OpenRouter's image-model parameters are endpoint **unions**. Pin one compatible endpoint or expose
the intersection of allowed fallback endpoints. Pin that eligible set for dispatch; a model union
must never justify forwarding an unsupported control.
Treat absent capability as unsupported/unverified and empty intersections as unavailable. The
catalog token (`selection.catalogVersion`) binds subject scope and effective config/capability
versions; revalidate its opaque server-issued value at submission and again before dispatch.

Provider-specific settings use strict discriminated schemas, for example a local typed Google
image-options schema or an OpenRouter routing schema
with typed `only`, `allowFallbacks`, and specifically modeled adapter options. The remote
`allowed_passthrough_parameters` list can restrict implemented options; it cannot create new
unvalidated request fields. Do not copy chat `addParams`/`dropParams` or arbitrary JSON into media.
Discovery schema expansion therefore cannot silently change what LibreChat submits.

## Credentials across queued work and restarts

Store an opaque server-issued authorization binding on the job: integration/config revision,
credential owner kind, tenant/principal reference, and account/destination binding. No key, token,
authorization header, service-account JSON, browser session, or decrypted SDK client is durable.
Existing endpoint names and custom endpoint secret handling are reused; legacy tool credentials
are not silently preferred over an endpoint credential. New secret fields require registration in
[the encryption/redaction registry](../../../packages/api/src/admin/secrets.ts).

Add a plain data-schemas method returning the scoped encrypted key record plus expiry and binding
revision in **one read**. The injected credential resolver decrypts through existing crypto;
it may reuse/refactor current key helpers without creating a second encryption scheme. Validate
tenant/user/name and authoritative `expiresAt` before handing a client to an adapter. Mongo TTL
deletion is asynchronous, and client-supplied `requestBody.key` is not worker authorization.

Reject request-only credentials for durable queued work in v1; offer the existing encrypted saved
key flow instead. Expiring saved keys are allowed but rechecked on admission, dispatch and every
reconciliation session. Apply `minValidityAtDispatchMs`, never extend storage lifetime silently.
Expiry/revocation during remote work moves the local job to `requires_attention` with a credential
reason, releasing the worker lease without declaring the remote job cancelled or free.

After reauthentication, resume lookup/download of the same provider job only with a compatible
account/destination binding; never resubmit generation or silently switch to a deployment key.
Credential rotation may retain account identity, while switching accounts may not. If identity
cannot be established, require a deliberate authorized rebind and verify access to the existing
job. Record output expiry independently so renewed credentials do not imply recoverable output.

## Native output recording and accounting ownership

Native multimodality is a protocol; execution ownership is a separate discriminant:
`executionOwner: 'media' | 'chat'`. Studio Gemini refinement executes once with thread continuation
through the media adapter, without a hidden chat conversation. Existing chat instead attaches
`nativeRecording` and emits ordered parts; the worker **cannot submit** jobs owned by chat.

Allocate observation identity before the chat call, then correlate SDK run/message/part IDs with
the same `MediaJob`. Deduplicate final assets by job/attempt/part identity; previews are transient.
The locked SDK needs the mixed-output/host-ingestion work identified in [backend.md](./backend.md).
Preserve provider continuation privately and project asset references into chat after ingestion.

Select one accounting owner per provider invocation. Chat-native records reference the chat
usage/settlement receipt; media-owned calls reserve and settle through the media path. Split
image/tool usage only when the provider reports distinct billable work, with unique component
identities, and exclude any component already charged by chat. Recording a result, importing it,
opening it in Studio, or reattaching it must never make another provider call or charge.

Verification covers config/defaults and disabled startup, role denial preservation, endpoint
intersections, credential lifecycle, uncertain submissions, ownership fencing, duplicate events,
one settlement, and native replay. Implementation requires workspace typechecks, focused tests,
and Lighthouse for config/startup/files/message loading; this change is documentation only.
