# Media architecture and configuration integration audit

Audited LibreChat `ba006f3877cd62225a0111bc7a8cb4fdd71e669e`, attributed against merge-base `385c6f8a1a42b5facdea5a9de5d00dd5e428ce45`. This final pass follows effective configuration through host construction, request context, provider credentials, catalog discovery and network policy. It also reviews extraction boundaries against the [initial audit](../integration-audit.md), [accounting audit](accounting.md) and [provider audit](providers.md), without counting their findings again.

## AR1 · P1 · Media network requests use base SSRF exemptions after effective endpoint policy changes

An administrator can override `endpoints.allowedAddresses` for a principal. Media loads that effective configuration and resolves its provider endpoint, but makes the network request using the base process configuration's exemption list.

The [host factory](../../../../packages/api/src/media/host.ts#L102) constructs one transport with `appConfig.endpoints.allowedAddresses`. Later, [actorContext](../../../../packages/api/src/media/runtime.ts#L110) loads the effective user/role/tenant configuration with `failClosed: true`. That effective value reaches credential resolution and provider URL selection, but no effective address policy reaches the already-constructed transport. Its [SSRF agent construction](../../../../packages/api/src/media/transport.ts#L80) continues to use the captured base exemptions.

The retained [probe](probes/architecture-policy.cjs) uses the actual `mergeConfigOverrides`, `createMediaRuntimeFromApp`, runtime HTTP router, Axios transport and SSRF agents against a disposable loopback HTTP server. The only data-model boundary is an unused empty repository; the test requests a deployment-key catalog, which requires no database writes or stored credentials. It runs both configuration directions:

| Base configuration | Effective principal configuration | Existing shared endpoint validator | Media result |
| --- | --- | --- | --- |
| Allows the private host and port | Removes that exemption | Rejects the destination | Sends two HTTP requests to it and exposes an available offering |
| Does not allow the private host and port | Adds that exemption | Allows the destination | Sends no HTTP requests and exposes an unavailable offering |

This demonstrates both a stricter principal policy being bypassed and an explicitly permitted internal endpoint failing to work. It does not claim that ordinary Media SSRF protection is absent, nor that hosted public references accept private destinations. Those references use their separate public-only policy.

Ordinary custom endpoint [initialization](../../../../packages/api/src/endpoints/custom/initialize.ts#L247) passes effective `appConfig.endpoints.allowedAddresses` to `validateEndpointURL`; the probe invokes that same exported validator as its positive/negative control. The configured override is supported: unlike the YAML-only `media` section, `endpoints` participates in the existing [override merge](../../../../packages/data-schemas/src/app/resolution.ts#L284).

Resolve the network policy alongside the effective connection, then supply it to a scoped transport or request boundary for discovery, submission, polling and authenticated downloads. Reuse the existing endpoint validator and SSRF-safe agent helpers. Keep the exemption policy out of unrelated process globals, and keep public-only hosted references restricted. If transport or catalog clients are cached, key them by the policy that affects authorization, or enforce the effective policy before a cached result is eligible. Cover both override directions, host/port specificity, cache reuse across principals, redirects and worker dispatch after a policy change.

## Extraction map grounded in demonstrated drift

These are implementation seams for the findings already reported, not additional counted findings.

| Policy with competing consumers | Concrete drift | Reuse boundary |
| --- | --- | --- |
| Provider connection and request policy | AR1 freezes base address exemptions; initial findings 11–12 demonstrate header/proxy and native credential-policy mismatch. | A typed effective connection descriptor supplying authentication, endpoint URL, network policy and supported routing. Adapt ordinary endpoint and media callers at this boundary while retaining protocol-specific codecs. |
| Capability and request validation | Provider audit demonstrates four requests accepted by shared validation then rejected locally by adapters; initial finding 19 has the corresponding comparison gap. | One pure capability validator in data-provider with explicit cross-field constraints, consumed by the primary form, comparison intent, presets and server admission. Protocol serialization stays with adapters. |
| Command intent and recovery | Client transition audit demonstrates fresh IDs on ordinary Queue after uncertain acceptance and loss of an unsubmitted comparison member. | The existing feature-owned pending command store should own validated intent and stable identities. Form initiates a command; receipt recovery advances that command. Avoid a second submission path embedded in Form's async continuation. |
| Balance ownership and title usage | Accounting audit reproduces completion-order liability loss and lossy title usage projection. | Preserve shared Balance/Transaction admission and recording. Apply one reservation-ownership rule to all debits; carry the complete shared usage contract through optional title presentation. |
| File and content lifecycle | Initial findings 05–07 and 13–15 trace retention/deletion/cache failures through existing entry points. | Retain the media storage lifecycle as the owner of original/rendition publication and deletion; route ordinary Files and account deletion through it. Reuse shared file-cache ingress rather than maintaining an isolated attachment inventory. |
| Execution observation and analytics | Initial findings 21–22 describe missing durable lifecycle observations and Studio's absence from Insights. | Inject a lifecycle observer through `MediaRuntimeDependencies`; adapt it to existing bounded metrics/tracing contracts. Aggregate authorized activity from the existing job and financial receipts, keeping the durable worker lifecycle separate from chat streaming. |

Most of the backend is already shaped usefully for this work: `createMediaServices`, worker, storage, credential resolver and transport take explicit dependencies; persistence methods expose plain media contracts; the UI uses host-supplied capabilities and feature Jotai state. Preserve those boundaries. The concrete exception in initial finding 24 remains the CJS native factory helper, which interprets behavior instead of only wiring the typed module.

## Hypotheses bounded or rejected

- **No new cancellation-cache runtime finding.** The catalog key includes integration, binding, routing, limits and catalog settings but omits `cancellation.enabled`, although Runway/Krea catalog generation consumes it. However, `media` is explicitly in [`BASE_ONLY_CONFIG_SECTIONS`](../../../../packages/data-provider/src/config.ts#L61), and the [documented setup](../implementation.md#L85) requires restarting after a media configuration change. No supported no-restart media-toggle transition was established here. Including all capability-affecting policy in the key is reasonable hardening, but this is not counted as a confirmed production defect.
- **No claim that principal-specific media execution limits should work.** The same YAML-only boundary intentionally keeps deployment integrations and limits out of user/role overrides. AR1 concerns the independently supported `endpoints.allowedAddresses` policy.
- **No duplicate global storage configuration is required.** `resolveMediaStorageSource` already inherits `fileStrategies.image`, then `fileStrategies.default`, then `fileStrategy`, with the explicit media override first. Physical storage failures belong to the storage specialist's report.
- **No blanket request-size or provider-policy omission.** Media has schema limits, transfer limits, bounded provider option traversal, credential reuse, OpenRouter routing policy and shared content inspection. The provider audit identifies precisely which model-parameter projection is missing.
- **No new observability or Insights count.** The absence of a job observer and separate activity aggregation remains initial findings 21–22. This pass identifies where they can enter without another global registry or independent financial ledger.
- **No unsupported capability inferred from frontend absence alone.** Native recording deliberately leaves provider execution and billing with chat; its persistence code explicitly avoids acquiring another generation authority. A per-port map is not sufficient evidence that the application lacks chat-wide concurrency controls.

## Verification and limits

From the repository root:

```powershell
node docs/research/media-studio/audit/probes/architecture-policy.cjs
```

The probe passed with the two results above. It creates and closes one ephemeral loopback server, uses synthetic configuration/key values, starts no worker, writes no files or database records, and makes no external request. It exercises built workspace exports at the audited head; the parent independently reproduced the same output.

From `packages/api`:

```powershell
npx jest src/media/host.spec.ts src/media/config.spec.ts src/media/catalog.spec.ts src/media/transport.spec.ts --runInBand --coverage=false
```

All **4 existing suites / 59 tests passed**. They establish the existing baseline and do not cover AR1. No runtime source was edited, and this documentation/probe pass did not rerun full typechecks, Lighthouse or external review.

The client audit's retained Jest configuration was also made independent of the shell's current directory by explicitly setting its Babel alias root. The parent-requested repository-root command now passes both client diagnostics:

```powershell
npx jest --config docs/research/media-studio/audit/probes/client-probe.config.cjs --runInBand --coverage=false
```
