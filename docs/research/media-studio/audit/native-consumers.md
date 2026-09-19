# Native content consumer audit

Audited LibreChat `ba006f3877cd62225a0111bc7a8cb4fdd71e669e`, introduced changes against merge-base `385c6f8a1a42b5facdea5a9de5d00dd5e428ce45`; associated SDK `554e38f21e483e014c78a022fa7c9c13728dcfac`. The executable probe uses the **installed, patched SDK**, because that is the artifact LibreChat consumes. The associated SDK has the same restoration behavior described here. Existing consumers need to understand the new `native_media` reference: preserving an unknown property is insufficient when it changes which text the model receives and which resource owns its lifetime.

## Findings

### NC1 · P2 · Editing a native assistant caption silently replays its original text

The ordinary assistant editor accepts native text as editable. The [PUT message route](../../../../api/server/routes/messages.js#L660) spreads the existing part, writes its new text, and therefore preserves `native_media.continuationRef`. The edited message is returned successfully and stored. The next [native replay](../../../../../agents-media-studio-sdk/src/llm/google/native.ts#L222) ignores that edited text and replaces the entire part with the original text restored from the native record.

The probe uses the actual Express edit route, actual message methods and MongoDB, the host's actual `formatAgentMessages`, and the installed SDK `NativeMediaSession`. It obtains HTTP 200, then observes:

```text
Visible stored text: Corrected caption visible to the user
Provider replay text: Original caption before correction
Ordinary text control: Corrected caption visible to the user
```

The provider never sees the accepted correction. This affects text produced alongside an image, even if the text part itself has no signature: all such recorded text receives a native reference. [Artifact edits](../../../../api/server/routes/messages.js#L425) also change text in place without detaching the reference. Their code path was inspected, not separately invoked in the probe. Editing into a new branch, cloning, and JSON round trips retain the same property.

Define a typed mutation policy for native content and use it in normal edits, artifact edits, user-authored message writes and imports. A correction cannot retain an identity that tells replay to restore different immutable content. The policy must preserve whatever Google requires for the remaining signed image sequence: either build a valid detached visible transcript, create a supported new continuation, or explicitly make incompatible edits unavailable with localized feedback. Simply overwriting the private signed original would undermine its immutable identity. Test displayed text against actual serialized next-request text, including edits before and after image parts.

### NC2 · P1 · Deleting a Studio projection breaks a still-saved chat and its forks

Native recording [creates its own linked media thread](../../../../packages/data-schemas/src/methods/mediaNative.ts#L84). [Continuation lookup](../../../../packages/data-schemas/src/methods/mediaNative.ts#L538) requires that media thread to remain `active`. [Studio deletion](../../../../packages/api/src/media/service.ts#L611) retires that thread immediately. Neither the original saved chat nor forks are accounted for as continuation retainers.

The current delete confirmation explicitly promises: [“Files used in chats or other creations stay available.”](../../../../client/src/locales/en/translation.json#L2996) Nevertheless, deleting the linked creation makes the next chat continuation fail before any provider request, even while the original Message remains saved. Forking or duplicating the conversation does not help: [cloneMessagesWithTimestamps](../../../../api/server/utils/import/fork.js#L21) preserves the original continuation reference while assigning a new message ID, with no additional lifetime registration.

The probe starts and completes an actual native recording, clones its message using the actual clone function, stores the clone, confirms both can replay, then calls the actual `retireMediaThread`. Afterwards the source Message and cloned Message still exist, but restoration returns no native part because the linked thread is no longer active. The probe uses a text native part so this proves **immediate continuation failure independently of later image cleanup**. It does not claim that deleting the original conversation causes the failure; ordinary chat deletion currently has the opposite integration problem of leaving media records behind, covered by the retention/lifecycle audit.

Model durable consumers explicitly. Chat messages, ordinary chat clones, Studio threads, and other creations need consistent retention ownership for native parts and underlying Files. Deleting a library presentation should release its ownership without making still-retained chat content unusable. Native restoration should require an authorized, live consumer and resource, not the unrelated continued visibility of its original library card. Integrate clone/import/delete/expiry at the data-schemas boundary so every writer cannot invent a different retention rule. Test source chat, fork, duplicate, source Studio retirement and final-consumer removal in both orders.

### NC3 · P2 · JSON imports preserve foreign native references that prevent follow-up chat

[JSON export](../../../../client/src/hooks/Conversations/useExportConversation.ts#L260) serializes the saved message content. [LibreChat import sanitization](../../../../api/server/utils/import/importers.js#L62) removes existing private runtime fields and executable UI markers but leaves `native_media`; [importing](../../../../api/server/utils/import/importers.js#L365) then clones that content into the destination account as user-submitted content. There is no ownership/availability conversion for native continuation references.

The probe passes a JSON-serialized native message through the actual LibreChat importer and sanitizer for another owner. The resulting imported caption still carries the original continuation reference. The native repository correctly refuses to restore it for that owner, so the next native replay throws instead of continuing from the visible imported caption. This also applies to imports onto another deployment where the opaque reference does not exist. The scope check is correct and must remain; the incomplete integration is treating an unavailable server-bound reference as portable conversation content.

Provide an import/export representation that distinguishes portable visible content from private continuation identity. At minimum, imports with unavailable identity need a valid ordinary-text fallback and explicit handling of unavailable images, rather than a latent failure of the entire next turn. Same-owner local clones that intentionally preserve native fidelity need durable ownership transfer/registration as in NC2. Test same owner, different owner, absent source deployment, missing asset, and disabled native media. Do not include private thought signatures or underlying credentials in the export.

## Executable evidence

Run from the repository root after the current workspace builds:

```powershell
node docs/research/media-studio/audit/probes/native-consumers.cjs
```

The [probe](probes/native-consumers.cjs) passed in 4.6 seconds. It creates and tears down a disposable standalone MongoDB, invokes current implementations, and makes no provider calls. Exit 0 asserts the **current defects**, not corrected behavior. Its three observations are `assistant-edit-replays-old-native-text`, `import-retains-unrestorable-owner-bound-native-text`, and `studio-retirement-invalidates-live-chat-and-fork`.

Boundary substitutions are explicit: synthetic authenticated owner/middleware, an inactive subagent runtime, import endpoint discovery, and an in-memory import batch collector. Message edits and native persistence/lookup/retirement use real MongoDB methods. The clone is persisted directly after the actual clone function to verify its independent Message survives retirement. Import persistence itself is not exercised; its actual sanitizer and cloned output are. The SDK's injected restore port calls the real native repository, and missing continuation is translated into an error as the host factory does.

Positive controls: ordinary text edits survive replay; same-owner native restoration succeeds before retirement; another owner cannot retrieve a reference; the public stored message and JSON export contain no synthetic private thought signature. These are compatibility defects, not demonstrated authorization bypasses.

## Surfaces inspected and limits

| Consumer | Result |
| --- | --- |
| Assistant text edit, artifact update, edited branch | NC1; actual normal edit exercised, other writers inspected |
| Fork, duplicate, split/lineage cloning | All use the reference-preserving clone path; NC2. Timestamp/parent remapping itself is preserved |
| JSON sequential/recursive import and export | NC3; sanitizer and sequential import exercised; recursive path calls the same sanitizer |
| Markdown/text exports | Existing formatter handles `IMAGE_FILE` explicitly and preserves visible text order. It exports image metadata, not a portable embedded asset. No claim of a new text-export omission |
| Copy answer / image download | Copy intentionally collects text. Image renderer has the existing image/download surface and uses canonical media URL. No new defect established in this pass |
| Anonymous share / fork from shared content | Known finding 10 already covers file inclusion/anonymization; not counted again |
| Regenerate/retry / model switching | Regeneration before the native answer avoids replaying that answer. Continuing through it invokes the reference path. Repository intentionally binds restoration to owner, model and credential binding. A model switch may therefore reject continuation; a compatible conversion/feedback policy needs product treatment, but this is not reported as an authorization bug |
| Temporary native generation | Host explicitly rejects new native images for temporary chats. Saved-chat retention omission remains initial finding 05 |
| Search, message reads and saved projection | Ordinary content is projected without private signatures; media Files get canonical public URLs. Search consumes visible message content, which can differ from replay after NC1. No independent search regression proved |
| Source chat/message deletion and expiry | No media-native consumer cleanup found in ordinary message/conversation methods. Existing retention/deletion findings cover this opposite direction; NC2 is specifically library deletion while chat survives |
| Provider text/image ordering | Host collapse helper preserves arrays containing native references; actual formatter used in NC1 retained the reference. SDK issues belong to initial finding 01: legacy v2 events enter the port but lose modalities/signed empty text; the newer default typed event stream bypasses the port, confirmed with actual consumption |

This pass does not run paid providers, browser edits, external exports, full agent orchestration or every deletion HTTP entry point. It establishes three missing consumer contracts at current runtime boundaries, with source coverage for their alternate writers.
