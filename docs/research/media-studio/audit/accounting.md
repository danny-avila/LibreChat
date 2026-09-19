# Accounting invariant audit

Audited LibreChat `ba006f3877cd62225a0111bc7a8cb4fdd71e669e`, using `origin/dev...HEAD` (merge base `385c6f8a1a42b5facdea5a9de5d00dd5e428ce45`; `origin/dev` tip is not the merge base). Scope: durable media accounting, existing Balance/Transaction writers, automatic refill and debt collection, admission, provider terminal cost, and title usage. These findings supplement the initial integration audit; none merely repeats the missing attention-resolution workflow.

## A1 · P1 · Completion order can permanently erase a paid charge

**Reproduced on standalone MongoDB with current production methods.** With 1,000 credits, admit an ordinary chat reservation of 600 and a media hold of 400. The media provider reports actual cost of 800, an explicitly supported over-reservation case.

| Completion order | Credits after both charges | Durable debt | Spendable credits after a 400-credit top-up and reconciliation |
| --- | ---: | ---: | ---: |
| Media, then chat | 0 | 0 | 400 |
| Chat, then media | 0 | 400 | 0 |

[Media settlement](../../../../packages/data-schemas/src/methods/mediaAccounting.ts#L482) debits up to all remaining token credits, including credits reserved for the already-running chat. It sees no shortfall and records no debt. The subsequent existing [ordinary balance writer](../../../../packages/data-schemas/src/methods/transaction.ts#L248) clamps the chat debit to zero; its missing 400 credits never become debt. This is a current-version integration failure, independent of mixed-version deployment. Admission respected both reservations, and the two runs use identical usage and starting funds.

Preserve other requests' reservations while applying a media charge and account for the uncovered amount as durable debt. The [debt-collection branch](../../../../packages/data-schemas/src/methods/mediaAccounting.ts#L483) already excludes reserved credits when choosing its debit; reuse that ownership rule, excluding only the settling job's own hold. Keep the common currency and ledger. Regression coverage must execute both completion orders and verify the same outstanding liability after a refill, not merely assert nonnegative balances or one ledger row.

## A2 · P1 · Title calls bypass credit admission and submission idempotency

**Reproduced using real MongoDB, real `createMediaServices`, and an injected title-provider boundary.** A user with a stored balance of zero sends three concurrent requests carrying the same `clientRequestId`. The server creates exactly one durable media job and invokes titles three times. No credit admission is attempted before the title calls.

The [submit handler](../../../../packages/api/src/media/service.ts#L459) checks replay before staging; each concurrent request observes no receipt. Staging/publishing correctly converges on one job, but the [title side effect](../../../../packages/api/src/media/service.ts#L487) still runs for every original replay miss. Actual media [credit admission](../../../../packages/api/src/media/worker.ts#L199) occurs later in the worker. A configured title endpoint, including an inherited global title endpoint, therefore makes a paid model call available even when the user's generation will fail for insufficient funds. The conditional title write protects a user rename; it does not prevent duplicate provider calls.

Give title dispatch a durable claim tied to the accepted thread/job, and admit its paid work through the existing balance reservation mechanism or defer it until funded execution. Preserve best-effort naming while making paid side effects once-per-claim. Cover concurrent identical submissions, exhausted balances, worker rejection, and retry after process interruption. The generation itself remains idempotent; this finding concerns the extra paid title calls.

## A3 · P2 · A title-publication failure drops already-incurred usage

**Reproduced through the production title generator.** The injected model returns a successful title and usage. A failing `replaceMediaThreadTitle` call causes the generator to return after logging the database error, with zero usage/billing calls. The successful-publication control records one billing call for the same response.

The provider [invocation](../../../../packages/api/src/media/title.ts#L339) precedes [title publication](../../../../packages/api/src/media/title.ts#L353), and [usage recording](../../../../packages/api/src/media/title.ts#L361) follows publication within the same outer `try`. A transient title write failure therefore changes the financial result of an already-completed provider request.

Separate usage settlement from optional presentation publication. Record the provider usage independently of whether the title is valid, unchanged, renamed, or fails to persist; tie retries to an idempotent invocation receipt so recovering publication cannot double-charge. Reuse `recordCollectedUsage` rather than adding title-specific pricing arithmetic.

## A4 · P2 · Title usage discards metadata already understood by shared billing

**Reproduced through production title and shared usage functions.** A synthetic response has `provider: 'openAI'`, 100 input tokens (80 cached), 5 reported output tokens, and 125 total tokens. Passing that complete response to `recordCollectedUsage` yields 20 ordinary input, 80 cached input, and 25 repaired completion tokens. Passing the same usage through Studio title generation yields 100 ordinary input and 5 completion tokens.

[`MediaTitleUsage`](../../../../packages/api/src/media/title.ts#L187) retains only two counters, and [recordUsage](../../../../packages/api/src/media/title.ts#L314) reconstructs an object containing only those counters and model. Provider identity, cache details, and total-token evidence disappear before the existing provider-aware [shared billing normalization](../../../../packages/api/src/agents/usage.ts#L125) can use them. The title model resolver also drops the endpoint token-pricing configuration when returning its connection descriptor; title recording has no `endpointTokenConfig` argument. That second omission is static evidence, not part of the numeric probe.

Carry the existing full usage type and resolved endpoint pricing policy into shared recording. Do not reproduce the lossy legacy chat-title extraction: that existing debt is a reason to share a corrected typed title invocation/usage adapter. Keep thread-title publication ownership separate. Test cache read/write, repaired reasoning totals, additive-cache providers, custom endpoint rates, and no-usage responses.

## A5 · P2 · Failed provider results are billed using the successful-request estimate

**Reproduced through the production accounting service.** A terminal `failed` provider result with no monetary usage and `estimatedCostUSD: 0.5` produces a charge effect for 500,000 credits. No output or authoritative failed-operation cost is required. This establishes charging unknown failure cost; it does **not** establish that every provider failure is free.

The [cost fallback](../../../../packages/api/src/media/accounting.ts#L30) excludes `cancelled` but includes `failed`. The [worker's terminal failure path](../../../../packages/api/src/media/worker.ts#L335) passes the failed response into settlement. Adapters such as Runway can return a failed terminal result without a cost field. The configured estimate for a successfully generated request is then treated as its actual failed-operation charge. The ledger does not preserve a source marker distinguishing reported cost from the estimate.

Make terminal billing evidence explicit: authoritative zero, known charge, or unresolved liability. Apply a completion estimate only to the outcome for which that policy was reviewed; if estimates for failed work are intended, expose that separately through configuration and retain the estimate provenance. Keep unknown failed cost unresolved until evidence or the explicit operator policy resolves it; never infer a refund merely from `failed`. Cover failed/cancelled/completed results independently with zero, missing, and nonzero provider cost.

## Verification and limits

The retained [probe](probes/accounting.cjs) runs against current built workspace exports. It creates a disposable standalone MongoDB, uses synthetic users/requests and injected provider boundaries, disables Meilisearch for the process, disconnects Mongo, and stops its server in `finally`. It makes no real inference calls and performs no cloud uploads. Earlier probe development exposed Meilisearch initialization from the local environment; the retained script explicitly blanks those environment settings before loading models. Final invocation completed with exit code 0 and only the JSON results below.

```text
node docs/research/media-studio/audit/probes/accounting.cjs
cross-writer-settlement-order:
  mediaFirst = { credits: 0, debt: 0, reserved: 0, creditsAfter400Topup: 400 }
  chatFirst  = { credits: 0, debt: 400, reserved: 0, creditsAfter400Topup: 0 }
title-admission-and-idempotency:
  zeroBalance: true, requests: 3, distinctJobs: 1, titleInvocations: 3, creditAdmissions: 0
failed-terminal-estimate:
  kind: charge, credits: 500000, costUSD: 0.5
title-publication-gates-usage:
  successful publication: one provider invocation, one spend call
  failed publication: one provider invocation, zero spend calls
  Studio metadata: promptTokens 100, completionTokens 5
  full shared metadata: input 20, read 80, completionTokens 25
```

Existing focused tests remain green:

- In `packages/data-schemas`: `npx jest src/methods/mediaAccounting.spec.ts src/methods/transaction.spec.ts --runInBand --coverage=false` — 2 suites, 91 tests passed.
- In `packages/api`: `npx jest src/media/accounting.spec.ts src/media/title.spec.ts --runInBand --coverage=false` — 2 suites, 29 tests passed.

The 120 tests are existing regression suites; the probe demonstrates gaps those suites do not cover. No production source was edited. This specialist did not rerun workspace typechecks, Lighthouse, CI, or external review for documentation/probe-only changes.

## Hypotheses rejected or bounded

- `maxCostUSD` is not a provider spending cap. The implementation documentation explicitly defines it as a reservation and permits overage debt; A1 tests that supported case instead of declaring all overages invalid.
- Media does not create an independent wallet. It shares Balance/Transaction, reuses balance initialization, expired reservation cleanup, and auto-refill. Preserve those integrations.
- Media debt is included in ordinary current-version admission and public available-balance calculation. A1 is settlement-order loss after valid admission, not admission ignoring debt.
- Debt collection protects reserved credits and has durable settlement recovery. The ordinary charge branch is the integration gap.
- Debt alone deliberately does not block account deletion. Treating that documented lifecycle policy as an accidental stranded hold would be incorrect.
- Media's held/settled/replayed writes have extensive actual-Mongo crash-boundary tests. No independent duplicate media settlement was reproduced; the duplicate paid work in A2 belongs to titles.
- A successful title whose conditional publication loses a rename race still records usage. A3 requires a thrown publication error, not simply a false result.
- Missing monetary cost must not be inferred from token counts or model names. A5 requires an explicit failure policy or authoritative evidence, not a speculative price catalog.
