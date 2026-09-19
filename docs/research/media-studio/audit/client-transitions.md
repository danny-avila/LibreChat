# Media Studio client transitions audit

Audited LibreChat `ba006f3877cd62225a0111bc7a8cb4fdd71e669e` against the actual `origin/dev...HEAD` merge-base `385c6f8a1a42b5facdea5a9de5d00dd5e428ce45`. This pass concentrates on command intent, interrupted responses, restored drafts, session boundaries and asynchronous editor ownership. It supplements the [first report](../integration-audit.md); findings 09 and 15–20 there remain separate.

## New findings

### C1 · P2 · Retrying an unchanged draft with Queue bypasses the retained request identity

Trigger: the server accepts a submission, its POST response is interrupted, and the receipt lookup is temporarily unavailable. The user sees their original prompt still in the composer and presses the normal Queue action again, interpreting it as a retry.

The real Form and command hook issue a different `clientRequestId` with otherwise identical request data. A synthetic accepting server recorded two independent accepted jobs. This does not challenge the explicit “Recover same request” action: that path correctly reuses the first ID. The problem is that the primary action becomes available for the unchanged draft while that draft's result remains uncertain.

The [command hook](../../../../client/src/components/Media/commands.ts#L122) retains the command on a transport failure, then removes it from `sending` in `finally`. [Workspace](../../../../client/src/components/Media/Workspace.tsx#L486) defines composer busy state solely from `sending`, while [Form](../../../../client/src/components/Media/Form.tsx#L499) creates a new UUID each time Queue runs. The server's [replay lookup](../../../../packages/data-schemas/src/methods/media.ts#L317) is keyed by owner scope and `clientRequestId`, so identical prompts under different IDs are independent requests. That is correct server behavior for an intentional new generation.

Bind the primary action to unresolved intent for the same `draftKey` and `draftRevision`: recover its existing command or make the uncertain state explicit before offering a distinct new generation. Continue allowing a revised draft to create new work. Reuse the existing pending command representation and recovery path; do not introduce a second idempotency implementation or deduplicate arbitrary equal prompts on the server.

The diagnostic in [client-transitions.spec.tsx](probes/client-transitions.spec.tsx) records:

```json
{"scenario":"ordinary queue after uncertain acceptance","unchangedDraft":true,"uniqueAcceptedJobs":2,"expectedWhenRecovering":1}
```

### C2 · P2 · Comparison intent is lost when the first model's response is interrupted

Trigger: select two valid models, queue a comparison, lose the first POST response after acceptance, then use the supported “Recover same request” action. The first job is recovered correctly, but the second model is never submitted. The original draft clears after acceptance, with only one result available for an operation advertised as a comparison.

[Form](../../../../client/src/components/Media/Form.tsx#L530) awaits model A before constructing model B. On the interrupted response the command hook returns `undefined`; Form returns at line 536. Only model A exists in the [persisted pending union](../../../../client/src/components/Media/state.ts#L47). Recovery invokes the command hook directly and cannot resume the exited Form function. The [accepted-receipt effect](../../../../client/src/components/Media/commands.ts#L156) then clears the unchanged draft. A `comparisonId` labels jobs after they exist; it does not preserve the unsubmitted member's identity or request.

Persist the complete comparison intent, including stable IDs and both validated requests, before dispatching either member. Let the same command owner advance and recover its members as their receipts settle. Resolve the first receipt's thread ID into the persisted second request. Preserve partial failure visibly and make recovery submit only the missing member. Keep this coordinated with finding 19's shared validation work; merely making both requests valid does not repair this failure transition.

The integrated diagnostic uses the real Form, `useMediaCommands`, command mutation hooks, React Query and Jotai. After recovery it observed two calls for A's same ID and one unique accepted job:

```json
{"scenario":"recover comparison after lost first response","uniqueAcceptedJobs":1,"requestedModels":["model-a","model-a"],"expectedModels":["model-a","model-b"]}
```

## Boundaries checked without a new finding

| Surface | Evidence and result |
| --- | --- |
| Owner and tenant isolation | `mediaSessionScope` includes tenant and user; media read and receipt keys include that scope. Reads reject late results through the host's session guard. No cross-owner data exposure was demonstrated. |
| Logout and login | AuthContext's session exit invokes registered media cleanup, clears prefixed sessionStorage entries and removes atom-family entries. Login/logout/refresh mutations remove React Query reads. Existing command tests confirm late receipts do not navigate or populate the next session. |
| Draft revision ownership | Accepted receipt handling clears only the submitted revision. Existing recovery tests preserve intervening edits. Both new diagnostics deliberately leave the revision unchanged. |
| Editor upload ownership | `referenceOwner` includes draft, connection, model, route and operation. Upload hooks abort on owner change/unmount and discard late results; Reference owns dialog attempts and cancellation. Focused existing tests pass. |
| Chat handoff | The hook claims an attachment attempt before awaiting it, gates by scope/destination/readiness, and retains failed handoff for supported retry. Focused existing tests pass. The surface-disabled issue remains finding 17. |
| Multi-tab state | Draft, library and pending state use sessionStorage rather than shared localStorage. Replaying a copied tab's pending ID follows server idempotency. No new duplicate caused solely by a second tab was established. |
| Error and accessibility structure | Workspace uses labeled recovery controls, localized status/alert messages, retry actions and focus restoration. Asset previews expose fallback/retry controls. This source review did not establish a new keyboard or theme regression. It is not a screen-reader or real-browser accessibility certification. |

The read-through also revisited query reconciliation, mutable thread history, composer parameters, presets, imports, attachment handoff and retained local drafts. It did not elevate speculative issues when the existing first report already describes the concrete defect, or when the behavior has explicit safeguards.

## Reproduction and verification

Run from `client` with the repository's installed dependencies:

```powershell
npx jest --config ../docs/research/media-studio/audit/probes/client-probe.config.cjs --runInBand
npx jest --config jest.config.cjs --runInBand --coverage=false --runTestsByPath src/components/Media/__tests__/commands.spec.tsx src/components/Chat/__tests__/useMediaChatHandoff.spec.tsx src/components/Media/__tests__/Reference.spec.tsx
```

The [diagnostic configuration](probes/client-probe.config.cjs) reuses the client Jest environment, aliases, setup and Babel transform, overriding test discovery, coverage and the result processor so the audit fixture can live under `docs`. It supplies an explicit Babel alias root so the equivalent command from the repository root (`npx jest --config docs/research/media-studio/audit/probes/client-probe.config.cjs --runInBand --coverage=false`) also works; that invocation passed after correcting the diagnostic configuration. Both diagnostics passed, and the three existing suites passed **22 tests**. These diagnostic assertions intentionally confirm the present defects; they must be inverted/rewritten as regression expectations when implementing fixes.

The only substituted behavior is at the API boundary: synthetic acceptance keyed by `clientRequestId`, a dropped initial response, and unavailable receipt reads. No provider call, cloud write or charge was made. The tests prove the emitted commands, persistence and React state transitions; they do not independently execute MongoDB admission or financial settlement. The server's actual idempotency lookup is cited above to connect those emitted identities to production behavior.

No runtime source changed. This pass added only the report and diagnostic fixture/configuration. It did not rerun browser/Lighthouse checks or typechecks already run against this same implementation head in the first audit.
