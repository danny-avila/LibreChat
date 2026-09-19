# Media recovery and account deletion

Operators with both `ACCESS_ADMIN` and `MANAGE_USERS` can open Media recovery from
Settings → General. The list is scoped to the authenticated tenant. It exposes job
identity, provider operation identity, status, and held credits; it does not return
prompts, provider credentials, generated content, or private continuation signatures.

`GET /api/admin/media/jobs` uses the configured page limits. Each command sent to
`POST /api/admin/media/jobs/:ownerId/:jobId/recovery` contains a stable
`clientRequestId`, the displayed `expectedVersion`, and nonempty evidence. A retry
with the same identity and body returns the current job even after settlement. A
changed body returns `request_conflict`; a competing decision returns
`version_conflict`. Reloaded pending commands preserve their original body so an
uncertain HTTP response cannot silently become a new financial decision.

Supported actions:

- `resume` continues a persisted provider operation, persisted terminal response,
  or an attempt proven not submitted. Provider work requires the original credential
  binding or a verified compatible alias. An unknown submission without an operation
  identity cannot be submitted again.
- `settle` records a confirmed failed/cancelled outcome and explicit final `costUSD`.
  Zero is a deliberate value. The normal worker and accounting ledger apply the
  amount; accepting a decision alone releases neither a financial hold nor a permit.
  Settlement can recover without provider credentials, including interruption after
  the debit committed but before its acknowledgement reached the worker.
- `acknowledge` closes an interrupted chat-owned native recording, preserving the
  parts already received. It does not invent a second accounting owner. The durable
  transition fences late native writes; background reconciliation completes a
  decision interrupted before materialization.

The existing audit log records a pending intent before a new command commits and a
success record afterwards. An unavailable audit store prevents the initial mutation.
The job retains the actor, evidence, fingerprint, and request for each accepted
decision; repeated HTTP acknowledgements may append another success audit entry but
cannot append another job decision or charge. No decision overwrites another.

`media.recovery.maxEvidenceChars` defaults to 2000 and
`media.recovery.maxDecisionsPerJob` defaults to 32. These limits bound future accepted
commands. Lowering a limit does not invalidate replay of an already accepted command.
The operator should use an invoice, support case, or other externally verified record
as evidence; the application cannot independently prove a manually entered cost.

Both account deletion entry points use the same media preparation, cancellation,
and completion protocol under the existing user-deletion fence. Unfinished provider
work, native attention states, held funds, and unacknowledged accounting effects block
the cascade. Failure before the user commit cancels the media fence. Failure after
the commit leaves deletion closed for background reconciliation. Existing auth cache
invalidation remains in the canonical user mutation methods. The repository's
currently disabled administrator delete route remains disabled.

Verification uses standalone MongoDB, the actual admin router, append-only audit
methods, canonical accounting, and worker. Provider calls are rejected by the test
transport. Coverage includes competing commands, tenant isolation, both capability
requirements, audit outages, exact-zero cost, lost responses, post-debit interruption,
native acknowledgement recovery, and admin account deletion ordering.
