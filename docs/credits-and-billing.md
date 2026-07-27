# LibreChat Credits & Billing — Technical Report

**Scope:** How the credits system values, charges, and enforces token usage, with specific attention to custom (LiteLLM proxy) endpoints.  
**Date:** 2026-07-27 · **Commit:** `tags/0.8.7`
**Update (2026-07-27):** §5–§7 revised — LiteLLM auto-pricing and the fall-through warning described below as gaps have since been implemented on the `feat/litellm-pricing-parser` branch, closing recommendations #2, #3, and #5.

---

## 1. The credit unit

**1 credit = $0.000001 USD** (one millionth of a dollar); 1,000,000 credits = $1.00.

Defined by the `tokenCredits` field on the Balance document — `packages/data-schemas/src/schema/balance.ts:12`:

```
// 1000 tokenCredits = 1 mill ($0.001 USD)
```

Reference points at default configuration:

| Setting | Credits | USD |
|---|---|---|
| `startBalance` | 20,000 | $0.020 |
| `refillAmount` | 10,000 | $0.010 |

There is **no fixed credits-per-token rate**. Credits are USD-denominated; consumption per token is determined per model and per token type.

## 2. Conversion formula

Pricing tables in `packages/data-schemas/src/methods/tx.ts` express rates as **USD per 1M tokens**. Because of the credit unit above, that figure is numerically identical to **credits per token**.

```
rate       = |getMultiplier({ model, tokenType, endpointTokenConfig, inputTokenCount })|
tokenValue = rawAmount × rate        // rawAmount is a negative token count
```

Example: `gpt-4o: { prompt: 2.5, completion: 10 }` → 2.5 credits per input token, 10 per output token, matching the vendor's $2.50 / $10.00 per 1M list price.

`getMultiplier` (`tx.ts:516-548`) resolves in strict precedence:

1. `endpointTokenConfig[model]` — admin override, **exact key match only**
2. Premium/tiered rate if input tokens exceed a threshold (`premiumTokenValues`)
3. Longest case-insensitive substring match against `tokenValues` / `bedrockValues`
4. `defaultRate = 6` (`tx.ts:29`) — $6/1M in both directions

Cache tokens are priced separately via `cacheTokenValues` and `getCacheMultiplier`. **A model priced without `cacheRead`/`cacheWrite` bills cache reads at the full input rate** (`getCacheMultiplier` returns `null`; callers fall back to `prompt` — `transaction.ts:143-149`).

Cancelled generations carry a **15% surcharge** (`cancelRate = 1.15`, `transaction.ts:6`, applied at `:118` and `:191`).

## 3. Charge lifecycle

| Stage | Location | Behaviour |
|---|---|---|
| Pre-flight | `packages/api/src/middleware/checkBalance.ts` | Estimates `promptTokens × multiplier`; lazily creates the Balance doc at `startBalance`; runs auto-refill if due; rejects with a `TOKEN_BALANCE` violation when credits are insufficient |
| Metering | `packages/data-schemas/src/methods/spendTokens.ts` | Writes two Transaction rows (`prompt`, `completion`) with negative `rawAmount`; structured variant for cache-aware providers |
| Settlement | `packages/data-schemas/src/methods/transaction.ts:205-292` | Computes `tokenValue`, atomically decrements `tokenCredits` under optimistic-concurrency retries, floors at 0 |
| Refill | `transaction.ts:297-329` | `tokenType: 'credits'`, positive `rawAmount`, `context: 'autoRefill'` |

Balance is read by the client via `GET /api/balance` (`api/server/controllers/Balance.js`), which also syncs each user's refill settings to current admin config (`packages/api/src/middleware/balance.ts`).

## 4. Configuration

Disabled by default. `librechat.example.yaml:244-256`:

```yaml
balance:
  enabled: false
  startBalance: 20000
  autoRefillEnabled: false
  refillIntervalValue: 30
  refillIntervalUnit: 'days'
  refillAmount: 10000
```

Legacy `CHECK_BALANCE` / `START_BALANCE` env vars remain supported; YAML takes precedence (`packages/api/src/app/config.ts:14-26`). Enabling `balance` force-enables `transactions`.

Defaults and validation: `packages/data-provider/src/config.ts:1594-1601`.

## 5. Custom endpoints (LiteLLM)

**Automatic pricing discovery now exists for LiteLLM.** `KnownEndpoints`/`FetchTokenConfig` (`packages/data-provider/src/config.ts`) gained a `litellm` member, following the same name-based convention as OpenRouter/Helicone: naming a custom endpoint `LiteLLM` (case-insensitive) triggers a call to the proxy's `/model/info` route, using the endpoint's existing configured (virtual) key — no admin/master key required. The parser (`processLiteLLMModelData`, `packages/api/src/utils/tokens.ts`) converts LiteLLM's per-token `input_cost_per_token`/`output_cost_per_token`/cache-cost fields into the internal per-1M-token convention, populating `cacheRead`/`cacheWrite` when the proxy reports them (closing risk #2 for auto-fetched models). The fetch rides the same cache/refresh cycle as the existing model-list fetch (`tokenConfigCache`) — no separate schedule.

Both the auth model and every field name here are confirmed against LiteLLM's own source (tags `v1.87.0` and `v1.93.0`, not just a hosted Swagger instance, which turned out to only be loosely typed for this route): `/model/info` and `/v1/model/info` are declared `dependencies=[Depends(user_api_key_auth)]` in `litellm/proxy/proxy_server.py` — the same dependency ordinary completion routes use, no admin-only gate — and its `model_info` object is populated by `litellm.get_model_info()`, whose return type (`ModelInfo` in `litellm/types/utils.py`) declares `input_cost_per_token`, `output_cost_per_token`, `cache_creation_input_token_cost`, `cache_read_input_token_cost`, `max_tokens`, `max_input_tokens`, and `max_output_tokens` identically in both tags.

Any failure — the route missing on older LiteLLM versions, the key lacking permission, a network error, or an unexpected shape — is treated as "no LiteLLM pricing available," logged once, and falls back to the pre-existing behavior below. Models the proxy doesn't report (no `input_cost_per_token`) are skipped rather than priced at 0, and are caught by the fall-through warning described next.

**Fall-through pricing is no longer silent.** `getMultiplier` now logs a warning (deduped per `(endpoint, model)`, reset every 30 minutes) whenever a **custom endpoint** model has no explicit rate and resolves via substring-match against the built-in tables or `defaultRate`. Built-in endpoints (OpenAI, Anthropic, Bedrock...) resolving the same way is expected behavior and is never warned on (closes risk 1's visibility gap and recommendation #3).

**Pre-flight and settlement now agree on `endpoint`.** `checkBalance` already passed `endpoint` into `getMultiplier`; the settlement path (`transaction.ts`, `packages/api/src/agents/transactions.ts`) now does too — threaded as a transient parameter, never persisted on the `Transaction` document (closes risk #3 / recommendation #5).

The static per-endpoint `tokenConfig` override (schema: `config.ts:871-881`; consumed at `packages/api/src/endpoints/custom/initialize.ts:251-272`) is unchanged and still takes **all-or-nothing precedence**: any `tokenConfig` present on an endpoint disables the automatic LiteLLM fetch entirely, for every model on that endpoint — not just the ones listed.

```yaml
endpoints:
  custom:
    - name: 'LiteLLM'
      apiKey: '${LITELLM_KEY}'
      baseURL: 'http://litellm:4000/v1'
      models:
        default: ['gpt-4o-mini']
        fetch: true
      # tokenConfig:            # optional — disables the automatic fetch above entirely
      #   gpt-4o-mini:          # must exactly match the id LiteLLM returns
      #     prompt: 0.15        # credits/token == USD per 1M tokens
      #     completion: 0.6
      #     context: 128000
      #     cacheRead: 0.075    # optional
      #     cacheWrite: 0.1875
```

An example is now in `librechat.example.yaml` (previously absent); the field shapes are also covered in tests (`packages/api/src/endpoints/tokenConfig.spec.ts:33`, `packages/api/src/utils/tokens.spec.ts`).

## 6. Risks identified

| # | Risk | Impact | Status |
|---|---|---|---|
| 1 | **Silent mispricing on alias mismatch.** `endpointTokenConfig[model]` is exact-match; `model` at spend time is whatever the proxy echoes back. A LiteLLM alias (`prod-gpt-4o-mini`, `fast-tier-1`) that doesn't match the YAML key falls through to substring matching or `defaultRate = 6`. | High — an opaque alias on a cheap model can be overcharged by an order of magnitude or more | **Mitigated.** Auto-fetch (§5) now covers most aliases automatically; a warning fires for any that still fall through. Manually enumerating aliases in `tokenConfig` remains the fallback for proxies where `/model/info` is unavailable. |
| 2 | **Uncosted cache reads.** A `tokenConfig` entry omitting `cacheRead`/`cacheWrite` bills cached input at full prompt price. | Medium — systematic overcharge on cache-heavy workloads | **Closed for auto-fetched models** — the parser populates both when LiteLLM reports them. Still applies to hand-written `tokenConfig` entries that omit them. |
| 3 | **Estimate/charge divergence.** `checkBalance` passes `endpoint` into `getMultiplier`; the spend path does not. The pre-flight estimate and the actual charge can resolve to different rates. | Medium — reconciliation drift | **Closed.** `endpoint` now threaded into the settlement path as a transient parameter. |
| 4 | **No markup layer.** Built-in tables mirror vendor list prices exactly. Reselling access requires per-model `tokenConfig` overrides. | Low — design constraint, not a defect | Open — out of scope for this change. |
| 5 | **Scope change from static config.** Presence of `tokenConfig` makes the config cache key the bare endpoint name (`custom/initialize.ts:42-52`), bypassing per-tenant/per-user scoping. | Low — blocks per-tenant pricing | Open — unchanged; the all-or-nothing precedence in §5 preserves this behavior deliberately. |
| 6 | **UI/billing divergence.** Advertised pricing (`GET /endpoints/token-config`) is gated by `interface.contextCost` and omits premium tiers; billing is not gated. | Low — user-facing inconsistency | Open — out of scope for this change. |

## 7. Recommendations

1. **Enumerate every LiteLLM alias** exposed by `/v1/models` and give each an explicit `tokenConfig` entry keyed on the exact returned id. **Superseded for most deployments** by the automatic `/model/info` fetch (§5); still the right fallback when that route is unavailable.
2. ~~Populate `cacheRead`/`cacheWrite` for every model that supports prompt caching.~~ **Done** — the LiteLLM parser populates both automatically when reported.
3. ~~Add observability for fall-through pricing.~~ **Done** — `getMultiplier` now warns once per `(endpoint, model)` for custom endpoints.
4. ~~Consider a LiteLLM-shaped pricing parser.~~ **Done** — `processLiteLLMModelData` (`packages/api/src/utils/tokens.ts`).
5. ~~Align the pre-flight and settlement multiplier inputs.~~ **Done** — `endpoint` now flows through both paths.

## Appendix — key files

| Concern | Path |
|---|---|
| Balance schema | `packages/data-schemas/src/schema/balance.ts` |
| Transaction schema | `packages/data-schemas/src/schema/transaction.ts` |
| Pricing tables, `getMultiplier` | `packages/data-schemas/src/methods/tx.ts` |
| Settlement, `updateBalance` | `packages/data-schemas/src/methods/transaction.ts` |
| `spendTokens` | `packages/data-schemas/src/methods/spendTokens.ts` |
| Pre-flight check | `packages/api/src/middleware/checkBalance.ts` |
| Config resolution | `packages/api/src/app/config.ts` |
| Custom endpoint init / `tokenConfig` | `packages/api/src/endpoints/custom/initialize.ts` |
| Fetch-pricing parsers (OpenRouter, LiteLLM) | `packages/api/src/utils/tokens.ts` (`processModelData`, `processLiteLLMModelData`) |
| LiteLLM `/model/info` fetch | `packages/api/src/endpoints/models.ts` (`fetchLiteLLMTokenConfig`) |
| Fall-through pricing warning | `packages/data-schemas/src/methods/tx.ts` (`warnFallThroughPricing`) |
| Zod schema, defaults | `packages/data-provider/src/config.ts` |
| REST surface | `api/server/routes/balance.js`, `api/server/controllers/Balance.js` |

**Verification note:** Items cited in §1, §2 (precedence and `defaultRate`), §4 (YAML keys), §5 (`FetchTokenConfig`, absence of LiteLLM cost fields), and `cancelRate` were confirmed by direct file reads and repo-wide grep. Remaining call-site line references were gathered by code-exploration agents and are accurate as of this branch but were not each independently re-read.

**LiteLLM `/model/info` verification (2026-07-27):** The auth model and field names in §5 were checked against a live hosted Swagger instance first, which turned out to be an older LiteLLM release (`v1.82.6`) with an untyped response schema for this route — it couldn't confirm the cost-field names at the schema level. Cloned LiteLLM's actual source at tags `v1.87.0` and `v1.93.0` instead: `litellm/proxy/proxy_server.py` for the route's auth dependency, `litellm/types/utils.py` for the `ModelInfo` TypedDict. Both tags agree exactly with what's implemented here. See [ADR-0001](adr/0001-litellm-pricing-discovery.md) for how this changed the ADR's framing of the virtual-key decision.

**End-to-end test against a real LiteLLM proxy (2026-07-27):** Ran the actual fetch against a live gateway. First result: the configured virtual key was scoped to `llm_api_routes` only and got a real 403 on `/model/info` — confirmed by reading LiteLLM's `_types.py` that `/model/info` belongs to a separate `info_routes` group, not gated to the master key. After a properly-scoped key was issued, the real response surfaced a bug our unit tests had missed: LiteLLM sends unpriced cost fields as explicit **`null`**, not an omitted key (matching its `Optional[float]` typing) — `z.number().optional()` rejects `null` and the entire payload failed validation, silently degrading every real deployment to no auto-pricing. Fixed by switching those six fields to `.nullish()` in `processLiteLLMModelData` (`packages/api/src/utils/tokens.ts`), with a regression test added for the explicit-null case. Confirmed against the real captured response afterward: priced models converted correctly (e.g. a `$0.25`/`$2.00` per-1M-token model, cache-read included), and unpriced models (several local/free-tier aliases) were correctly omitted rather than defaulting to a `0` rate.
