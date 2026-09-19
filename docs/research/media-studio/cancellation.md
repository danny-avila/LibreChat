# Media cancellation contracts

Queued Media Studio jobs cancel atomically before provider submission. Accepted jobs expose
**Request cancellation** only when their saved execution snapshot contains a verified provider
capability. Runway video and Krea image jobs currently have that capability. Other adapters and
older saved jobs remain queued-only; native chat jobs retain the chat cancellation protocol.

`media.cancellation.enabled` defaults to `true` inside the opt-in media configuration. Setting it
to `false` disables the capability for new jobs. Existing jobs keep their saved policy so a pending
cancellation can recover after a restart or configuration change. Cancellation requests use the
existing `media.timeouts.pollRequestMs` timeout.

## Published contracts

Checked against the published provider documentation on 2026-09-18. No paid provider requests
were made to establish these contracts.

| Provider         | Contract and evidence                                                                                                                                                                                                                                                                                                                                                                                          | Implementation                                                                                                                                                                                                                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runway           | [OpenAPI](https://docs.dev.runwayml.com/openapi.json), `DELETE /v1/tasks/{id}`: pending, throttled, and running tasks can be cancelled; other tasks are deleted. Success is **204**. Repeated deletion may return **404**, explicitly documented as safe to ignore for idempotency. Cancelled or deleted tasks may no longer be fetched.                                                                       | Poll first and retain any already-completed output. Persist the mutation attempt, then DELETE. A lost acknowledgement can be recovered with another DELETE, including the documented 404 outcome. Deletion does not establish a refund or final cost.                                                                                           |
| Krea             | [Job lifecycle](https://www.krea.ai/docs/developers/job-lifecycle) permits `DELETE /jobs/{id}` only for **queued** or **processing** jobs and states failed/cancelled jobs are not billed. [Delete endpoint](https://www.krea.ai/docs/api-reference/general/delete-a-job-by-id) returns **200** on success; **404** can mean missing job **or unauthorized client**. No mutation retry guarantee is published. | Poll first and defer cancellation in other active states. Persist the mutation attempt before DELETE. After an acknowledgement or uncertain request, resume polling without repeating DELETE. Only a polled `cancelled` or `failed` terminal state establishes the documented zero charge. A 404 establishes neither cancellation nor a refund. |
| OpenRouter video | [Published OpenAPI](https://openrouter.ai/docs/openapi/openapi.yaml) exposes video creation, status and content retrieval, but no video cancellation operation.                                                                                                                                                                                                                                                | Cancellation remains unsupported after submission. A `cancelled` status alone does not establish an API for requesting cancellation.                                                                                                                                                                                                            |

Runway's terminal task response may include `cost.credits`. The adapter converts that explicit
amount using the published [price of $0.01 per credit](https://docs.dev.runwayml.com/guides/pricing).
A cancellation DELETE does not return that amount. If billing is enabled and no authoritative
terminal cost is available, the provider outcome is shown as confirmed while the job requires
billing reconciliation and its liability remains reserved. The configured estimate for successful
generation is never reused as the cost of cancellation.

Runway also deletes tasks that finish between the preliminary poll and DELETE. Its contract
cannot preserve the result of that race. The capability is therefore advertised as best effort;
the application does not promise a refund or successful output recovery after a cancellation
request. The preliminary poll preserves results that are already observable before deletion.

## Persistence and recovery

An accepted cancellation sets durable intent without releasing the worker lease, execution
permits, owner fence, or accounting hold. It increments the job version so an older writer cannot
erase that intent. Request replay returns the existing state. The worker records a mutation
attempt before calling the provider and resumes according to the provider's verified retry
contract. An uncertain Krea attempt may complete normally if the request never reached Krea;
the application continues to observe the actual outcome.

Provider confirmation and billing completion are separate. The public job exposes
`cancellation: requested | confirmed`; `phase` still records whether reconciliation is complete.
For Runway, `confirmed` means the provider closed the task through cancellation or deletion;
it does not prove that generation stopped before completion. The UI says the provider closed
the job and separately identifies pending charge reconciliation.
Polling continues after an accepted cancellation request. If generation completes first, its
outputs and actual/configured completion accounting follow the existing success path. No new
generation is submitted by cancellation or recovery.

## Verification

- `packages/api/src/media/adapters/cancellation.spec.ts` exercises the real HTTP transport through
  an injected Axios adapter: exact success codes, empty responses, Runway's idempotent 404,
  Krea's ambiguous 404, timeout and headers, terminal billing evidence, binding validation,
  completed-result preservation, and the configuration toggle.
- `packages/api/src/media/worker.spec.ts` uses standalone MongoDB with the real runtime,
  persistence and accounting: durable request/acknowledgement, process restart, lost
  acknowledgements, deferred lifecycle states, completion races, hold retention, terminal zero
  settlement, and existing queued cancellation versus dispatch.
- `packages/data-schemas/src/methods/media.spec.ts` covers atomic ownership and version fences,
  intent replay, retained leases/capacity, legacy snapshots and native chat ownership.
- `client/src/components/Media/__tests__/Thread.spec.tsx` covers the request control, restored
  pending cancellation, stale status refresh and confirmed cancellation with unresolved billing.

These tests exercise published contracts through injected boundaries. Live account permissions,
provider incidents, and any future undocumented contract changes require operational monitoring.
