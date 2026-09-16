# Media Studio client implementation blueprint

Design research, 2026-09-15; no application changes are implemented here. This translates the
[thread-tile experience](studio.md) and [frontend audit](frontend.md) into frontend boundaries.
`MediaJob` is the canonical execution entity. One `MediaThread` owns turns, jobs, and assets and
appears as one tile; jobs within a tile can be queued or running independently.

The first client slice includes `/studio`, `/studio/threads/:threadId`, image creation, uploaded-reference editing, multiple accepted jobs, thread refinement, native chat output, and chat handoff. The following video slice extends the same controls, tiles and history. Controls appear only for verified operation/model/connection capabilities.
The API proposal uses catalog/thread/turn reads, `POST submissions`, submission-receipt recovery, job detail/cancel/retry, versioned thread edits, and `POST imports` through existing file boundaries. Names below are proposed implementation names; shared DTO fields are finalized with the service contract.

## Files and exports

| Change/add                                                                                                                                                                                                                                                                                  | Responsibility and current evidence                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change [client/src/routes/index.tsx](../../../client/src/routes/index.tsx)                                                                                                                                                                                                                  | Register `/studio` and `/studio/threads/:threadId` under authenticated Root, preserving router `basename` and error boundaries.                                                                                                   |
| Add `client/src/routes/Studio.tsx`                                                                                                                                                                                                                                                          | Resolve host auth, access, config, session scope, navigation, and shell preferences; render the media feature through its host provider.                                                                                          |
| Change [useUnifiedSidebarLinks.ts](../../../client/src/hooks/Nav/useUnifiedSidebarLinks.ts)                                                                                                                                                                                                 | Add the localized Media Studio destination. Its existing Insights `onClick` link is the route-action precedent; [useSideNavLinks.ts](../../../client/src/hooks/Nav/useSideNavLinks.ts) supplies the adjacent agent-builder entry. |
| Change [UnifiedSidebar.tsx](../../../client/src/components/UnifiedSidebar/UnifiedSidebar.tsx), [ExpandedPanel.tsx](../../../client/src/components/UnifiedSidebar/ExpandedPanel.tsx)                                                                                                         | Replace Insights-only route-active/width/leave assumptions with a small host-owned route descriptor that includes Studio. Preserve stored sidebar width/expanded preferences.                                                     |
| Change mobile [Header.tsx](../../../client/src/components/UnifiedSidebar/mobile/Header.tsx), [Switcher.tsx](../../../client/src/components/UnifiedSidebar/mobile/Switcher.tsx), [ShortcutTargets.tsx](../../../client/src/components/UnifiedSidebar/mobile/ShortcutTargets.tsx) as required | Supply the shared route-active ID and route-exit behavior; keep drawer dismissal, focus, and keyboard targets working. Route navigation must not leave a nonexistent panel selected.                                              |
| Add `client/src/components/Media/{index.ts,host.tsx,state.ts}`                                                                                                                                                                                                                              | Feature exports, narrow host ports, feature-owned Jotai drafts. No direct app-store or conversation-store access.                                                                                                                 |
| Add `client/src/components/Media/studio/{Grid.tsx,Tile.tsx,Thread.tsx}`                                                                                                                                                                                                                     | Cursor-paginated thread summaries, stable tiles, and selected-thread turns/refinement. A separate queue panel is optional.                                                                                                        |
| Add `client/src/components/Media/controls/{Create.tsx,Model.tsx,Inputs.tsx}` and `display/{Job.tsx,Results.tsx,Player.tsx}`                                                                                                                                                                 | Common creation/refinement form, capability controls, authorized inputs, job status, ordered results, and video playback used by both entry points.                                                                               |
| Add `client/src/components/Chat/Media.tsx`; change selected chat composer/message integration points                                                                                                                                                                                        | Adapt chat state and callbacks into Media ports; explicit media submit uses the same service, while native output only renders/links an existing invocation.                                                                      |
| Add `client/src/data-provider/Media/{queries.ts,mutations.ts,reconcile.ts,index.ts}`; change [client data-provider index](../../../client/src/data-provider/index.ts)                                                                                                                       | React Query reads/mutations and version-aware cache publication. Mirror the feature export chain in [Projects/index.ts](../../../client/src/data-provider/Projects/index.ts).                                                     |
| Change shared [api-endpoints.ts](../../../packages/data-provider/src/api-endpoints.ts), [data-service.ts](../../../packages/data-provider/src/data-service.ts), [keys.ts](../../../packages/data-provider/src/keys.ts), [index.ts](../../../packages/data-provider/src/index.ts)            | Typed media endpoints/services, centralized query/mutation keys, and public exports for agreed shared media DTOs/schemas. Encode dynamic URL segments; keep base-path support.                                                    |
| Coordinate shared [permissions.ts](../../../packages/data-provider/src/permissions.ts) and config contract                                                                                                                                                                                  | Add media access through the existing role/config system. The role-to-interface mapping requires deliberate integration; do not assume adding an enum member alone creates effective permissions.                                 |
| Change [English translation.json](../../../client/src/locales/en/translation.json); extend [shared primitives](../../../packages/client/src/components/index.ts) only when justified                                                                                                        | Localize all visible/status/accessibility text. Keep reusable appearance in the shared system and feature layout in Media.                                                                                                        |

[SidePanel/Nav.tsx](../../../client/src/components/SidePanel/Nav.tsx) only renders links with a matching `Component`; Studio's route link should not masquerade as an empty side-panel component. This feature does not require migrating the chat store or modifying the general-purpose Files dashboard.

## Host boundary and access

Follow [Chat/Surface.tsx](../../../client/src/components/Chat/Surface.tsx) and [Subagents/surface.tsx](../../../client/src/components/Chat/Subagents/surface.tsx): the application reads Recoil/preferences and passes values/actions; feature code consumes a small context.

An illustrative local port uses existing shared types rather than copying file or composer types:

```ts
import type { ComposerProps } from '@librechat/client';
import type { TFile } from 'librechat-data-provider';

type MediaLocation = {
  threadId: string;
  turnId?: string;
  jobId?: string;
  fileId?: TFile['file_id'];
};
type MediaHostPorts = {
  cacheScope: string;
  isCurrentSession: () => boolean;
  enabled: boolean;
  enterToSend: boolean;
  resolveKeyVerdict: ComposerProps['resolveKeyVerdict'];
  openThread: (location: MediaLocation) => void;
  openCredentialSettings: (connectionId: string) => void;
  useInChat: (files: readonly Pick<TFile, 'file_id'>[]) => Promise<void>;
};
```

The actual capability/access DTO comes from shared schemas, alongside these ports; avoid a second
hard-coded permissions model in Media. `enabled` gates data access after auth/config/roles resolve,
not an authorization guarantee. Reuse [useHasAccess](../../../client/src/hooks/Roles/useHasAccess.ts)
in the host, and the unresolved-role behavior in [SkillsView](../../../client/src/components/Skills/layouts/SkillsView.tsx).
Require server action availability for each job/asset. Disabled deployment, denied access, pending
roles, missing credentials, unavailable models, and empty history are distinct UI states.

Use a non-secret, principal/tenant/session-scoped `cacheScope` and a synchronous session guard.
[getSessionPrincipal](../../../client/src/utils/session.ts) can return an opaque bearer token as a
comparison identity: do **not** put that return value into query keys, storage, telemetry, or DOM.
The host can use it privately to detect credential/session turnover. Guard before dispatch, after
awaits, and before cache publication, as [project assignment](../../../client/src/data-provider/Projects/mutations.ts)
already does. Account change disposes media observers and clears drafts/old-scope caches.

## Draft ownership and component props

Proposed shared DTO imports below stand for the agreed Media contracts, not duplicate definitions.
Compose UI props from those types; keep draft state explicitly distinct from accepted work:

```ts
import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import type { MediaJob, MediaSubmission, MediaThreadSummary } from 'librechat-data-provider';

type MediaDraft = {
  editing: Omit<MediaSubmission, 'clientRequestId'> | null;
  dirty: boolean;
  localUploadIds: readonly string[];
};
export const draftByIdentity = atomFamily((_identity: string) =>
  atom<MediaDraft>({ editing: null, dirty: false, localUploadIds: [] }),
);
type ThreadTileProps = {
  thread: MediaThreadSummary;
  onOpen: () => void;
};
type JobCardProps = {
  job: MediaJob;
  onCancel: () => Promise<void>;
  onRetry: () => Promise<void>;
};
```

`editing` is an editable copy/prefill, never job truth; local form field validity can be incomplete
until shared validation constructs a submission. A fresh idempotency identity is minted only for
an intentional submission and retained unchanged through recovery. Independent new drafts use
different draft IDs; thread drafts include thread and selected parent revision identity.

Existing [Thread/state.ts](../../../client/src/components/Chat/Messages/Thread/state.ts) demonstrates
feature-owned atom families; [Subagents/state.ts](../../../client/src/components/Chat/Subagents/state.ts)
documents why family entries need lifecycle cleanup and cannot be removed under active readers.
Retain dirty drafts while moving among tiles; release discarded/clean unused drafts safely and
clear all session-owned entries on logout. Do not retain provider credentials or continuation.
Persisting unsent creative text is an explicit product/privacy choice, particularly for temporary
chat; [jotai-utils](../../../client/src/store/jotai-utils.ts) is available but its tab-isolated helper
still uses localStorage. Never persist `File`, `Blob`, controllers, or object URLs as recovery data.

## React Query contract and bounded polling

Use React Query v4 conventions from [Projects/queries.ts](../../../client/src/data-provider/Projects/queries.ts)
and keyed mutation composition from [Schedules/mutations.ts](../../../client/src/data-provider/Schedules/mutations.ts).
Add proposed `QueryKeys.mediaCatalog`, `mediaThreads`, `mediaThread`, `mediaJob`, and `mediaReceipt`; add mutation
keys for submission, job cancellation/retry, and thread update. Keep factories in shared `keys.ts`:

| Cache entry            | Key shape after centralizing enum members                          | Fetch rule                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authorized catalog     | `[mediaCatalog, scope]`                                            | On studio/media-control demand; cache configured descriptors and revalidate after credential/config changes.                                              |
| Thread grid            | `[mediaThreads, scope, normalizedFilters]`                         | Infinite cursor query. Summaries already contain cover, counts, attention, and version. No detail query per tile.                                         |
| Thread metadata/detail | `[mediaThread, scope, threadId]`                                   | `GET threads/:id` supplies versioned cover/title and bounded initial turns/job summaries; seed the matching first-turn page without a duplicate request.  |
| Thread turn pages      | `[mediaThread, scope, threadId, 'turns', normalizedTurnFilters]`   | `GET threads/:id/turns` includes bounded job summaries with status/actions and output summaries; visible rows require no per-job detail fetch.            |
| More jobs/outputs      | Keys include owner thread/turn/job identity and collection kind    | Separate job/output continuation cursors page long turn histories or result sets on demand; turn pagination must not truncate either collection silently. |
| Job detail             | `[mediaJob, scope, jobId]`                                         | Only when explicitly expanded for additional detail; sibling viewers share this key.                                                                      |
| Acceptance recovery    | `[mediaReceipt, scope, 'submission' or 'import', clientRequestId]` | Read the matching command's recovery endpoint while unresolved. Generation and import request IDs occupy distinct command namespaces.                     |

V1 uses durable snapshots and polling, not a new mandatory SSE service. Poll according to thread activity, unresolved preparing receipts, and reconciliation state, even when the selected job is terminal. Only loaded bounded pages participate; do not enumerate all history to find active jobs.
Use server/configured active and infrequent foreground catch-up cadences with error backoff, plus focus/reconnect refetches. A zero pending count may reflect projection lag: it can reduce polling frequency but must not stop foreground observation forever. Truly inactive views stop observation without stopping work.
If extensive scrolling would refetch many pages, bound retained pages or use server cursor-page
refresh semantics defined by the API. Do not launch one poller per tile, turn, or generated file.

Request functions return typed data through existing `dataService`; read requests can pass the
React Query `AbortSignal` through [request.get](../../../packages/data-provider/src/request.ts).
Aborting observation does not cancel a server job. Poll intervals, concurrency, and spend limits
come from server configuration; do not duplicate them as feature constants or a browser job queue.

Submission uses `POST submissions` with `clientRequestId`, optional `threadId`/`parentTurnId`,
selection `{ connectionId, modelId, catalogVersion }`, `image.generate`/`image.edit`/`video.generate`,
prompt, typed input file IDs/roles, and typed parameters. Catalog freshness is not authorization.
The receipt has phase `preparing | accepted | rejected`, stable identities, and available versioned snapshots. A preparing `202` acknowledges durable preparation, not executable queued work. Recover through `GET submissions/:clientRequestId` until accepted/published or rejected; retain non-secret unresolved receipt metadata through reload without persisting provider credentials.
While preparing, pin a provisional receipt-backed tile in the grid projection without inventing a second thread ID. A stale list omitting that thread, or a temporary detail `404` while the receipt still confirms preparing, must not erase the tile. Explicit revocation/deletion still wins. Merge the tile by thread ID when the authoritative list catches up; label preparation distinctly from queue admission.
Retain the recoverable submitted draft/input references while preparing. On accepted, publish returned snapshots before local callbacks and clear only the matching submitted draft version; later edits remain. On rejected, preserve the draft, show the typed reason, and let server receipt policy determine any subsequent action. Do not reinterpret a preparing response or rejected receipt as permission to mint an automatic new submission.
Invalidate affected list filters after publication. Mutations use `retry: false`; ambiguous command recovery reuses its request identity. The shared HTTP auth interceptor can replay after refresh, so identity travels in the original payload rather than being generated on each send.

Explicit `POST jobs/:id/retry` uses a fresh `clientRequestId` and returns a **new MediaJob** under
the same immutable turn, with `retryOfJobId`. Keep the original card terminal, append the new job,
and update the turn/tile counts; do not reset the old job to running. Internal polling/download
retries remain within a job. A changed prompt/settings or intentional variant creates a new turn.

All snapshot and mutation publication goes through one reducer in `Media/reconcile.ts`: compare
server versions per entity, upsert stable IDs, preserve unrelated newer fields, and ignore older
responses. Completed siblings append to their accepted turns without changing another job's frozen
input or the selected/pinned cover. Refetch thread cover/title after version conflicts. Never use
arrival order as accepted turn order, or a page-local array index as thread/job identity.

Cancellation/retry errors may follow a durable server transition, so refresh affected records on
settled outcomes when specified by the API. Keep deletion/revocation state authoritative over an
older in-flight snapshot; active detail settles to unavailable and inactive cached detail is
removed. Paginated list membership can change on job completion: invalidate affected filters
rather than guessing that a thread matches only one of Pending or Completed.

If events are later justified, reuse the same reducer and snapshot queries. Require authorized
scope, stable entity identity/version, deletion markers, and replay/gap behavior. Fetch/reconcile
on reconnect or gaps; do not add an event-specific Jotai mirror. Native chat stream events can
invalidate/link media records in v1 without becoming a second studio job transport.

## Uploads, references, and chat ingress

`POST uploads` supplies new source files through the shared files service. Reuse [file upload transport](../../../client/src/data-provider/Files/mutations.ts), shared MIME/size validation, and the existing File contract with explicit media ownership/operation policy.
[useFileHandling](../../../client/src/hooks/Files/useFileHandling.ts) still touches chat/temporary
Recoil state even in its no-chat-context entry; extract the independent upload controller or add
injected callbacks instead of creating a dummy conversation. Preserve source bytes for editing.

One draft owns upload IDs, pending controllers, preview URLs, and success/error callbacks. Queue
validation is scoped to that draft; a late completion cannot attach to whichever tile is now open.
Removing an input detaches the local reference, aborts pending upload where supported, and revokes
its preview URL. It does not delete a persisted file referenced by another turn/chat. Server orphan
retention cleans abandoned uploads; a browser unload handler is not a reliable cleanup service.
Refresh restores authorized uploaded IDs and reports missing local-only inputs; it never fabricates an upload from a stale `blob:` URL. An uncertain submission retains inputs until reconciled so cleanup cannot destroy files already accepted by a job.
`POST imports` idempotently links authorized file IDs into a new/existing thread import-turn without a provider call or MediaJob. The import-turn owns its durable import receipt; recover it through `GET imports/:clientRequestId` in the distinct import command namespace. Use the same preparing/accepted/rejected tile/draft rules, returned identities, and fingerprint-conflict handling; never create another tile just because upload/import acknowledgement was lost. File attachment/import authorization remains server-owned.

Explicit chat media actions submit through the same mutation and show the same `MediaJob` card.
For native Gemini/OpenAI output, extend [Content/Part.tsx](../../../client/src/components/Chat/Messages/Content/Part.tsx)
and the agreed shared content contract to render ordered native text/assets with thread/turn/job
links. [useAttachmentHandler](../../../client/src/hooks/SSE/useAttachmentHandler.ts) must reconcile
existing invocation output, not call `POST submissions` when an image arrives. Historical tools
remain renderable; unrelated text-only chat creates no tile. “Open in studio” selects the exact
source revision. “Use in chat” reauthorizes files/destination, preserves its draft and retained
references, and never auto-sends. Each message stays pinned to its output when the studio iterates.

## Observable states and shared UI

| Situation              | Required behavior in grid/detail/chat                                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Loading/empty          | Stable skeletons; distinct no-threads/no-filter-matches; keep prompt editable during catalog load and disable only invalid submission.                                                                                                                             |
| Preparing receipt      | Keep the provisional thread tile and submitted draft across stale lists/projection `404`; poll receipt until accepted or rejected and show preparation separately from queued execution.                                                                           |
| Multiple accepted jobs | Immediately show/update one tile per thread; retain ready cover and separate queued/running counts. Another valid draft can submit.                                                                                                                                |
| Failed/partial result  | Show per-job/per-output errors and ready originals; preserve uploaded source and draft. Thumbnail failure is independent of generation success.                                                                                                                    |
| Stop/retry             | Cancel targets a job, not the thread. Unsupported remote cancellation offers truthful hide/detach behavior and keeps work inspectable. Unknown outcome reconciles before any paid resubmission.                                                                    |
| Restore/offline        | Show last known state with stale/offline indication; snapshot refetch repairs it. Durable work resumes display, while drafts never auto-submit.                                                                                                                    |
| Mixed versions         | Feature absence disables new entry points; preserve legacy cards/files. Unknown phases render a safe status and refresh path, not invented success/failure. Unsupported schema/capability versions block new submission while known saved output remains readable. |

Compose shared [Composer](../../../packages/client/src/components/Composer.tsx), ControlCombobox, Field/FieldMessage, Button, Dialog, EmptyState, Skeleton, and existing semantic variants. Composer accepts host keyboard policy and handles IME; preserve those rules.
Use `useLocalize()`, English `com_ui_media_*` keys, locale-aware counts/duration/cost, and localized error mappings. Do not show provider traces or credentials in failure details.

Render the tile layout as a semantic list or a fully implemented keyboard grid. Keep tile-open
and cancel/download controls separate, restore focus after detail/dialog closure, and announce
phase changes without every progress tick. Use posters/native labeled video controls, no forced
autoplay/audio, reduced motion, and reserved aspect ratios. Fetch thumbnails first and originals
on demand; authenticated range playback must not require a whole-video Blob. Optional mask/crop
work requires keyboard-accessible alternatives. Use semantic colors, not feature palette classes.

## Implementation acceptance

Verify three independent queued threads; preparing and rejected receipts across stale lists/detail `404`; lost import acknowledgements without duplicate tiles/jobs; uploaded-image edits in one thread; concurrent variants
finishing backwards; multiple outputs; job cancellation versus thread deletion; account switches
during upload/submit/refetch; lost acknowledgements; stale list/detail races; cover conflicts;
native ordered output and legacy rendering; temporary retention; and both directions of chat
handoff without draft loss or duplicate provider calls. Cover active siblings while the selected job is terminal, projection-lag catch-up, and bounded job/output paging. Test desktop/mobile sidebar active state,
subpath/deep-link auth restoration, keyboard/IME, localized statuses, and bounded query counts.
Run focused tests, `npx tsc --noEmit` in changed workspaces, and `npm run lighthouse` for the
startup/config/file/message changes. Studio discovery must stay off ordinary chat's critical path.

This document was checked by source inspection and local-link validation only; it does not claim browser, provider, performance, typecheck, or production verification.
