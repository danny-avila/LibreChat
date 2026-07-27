# LibreChat Billing

Vocabulary for how LibreChat prices and charges token usage. Scoped to the billing/credits path; the rest of the monorepo (chat, agents, auth, etc.) has no glossary yet.

## Language

**Credit**:
The unit stored on a user's Balance document (`tokenCredits`). 1 credit = $0.000001 USD; 1,000,000 credits = $1.00.
_Avoid_: token (a credit is a priced unit, not a count of model tokens), dollar amount (credits are the stored unit; USD is only ever a display conversion).

**Rate** (also: **Multiplier**):
Credits charged per model token, resolved by `getMultiplier`. Numerically equal to the model's USD-per-1M-tokens list price.
_Avoid_: price, cost — reserve those for the resulting charged amount, not the per-token figure.

**Token Config**:
A per-endpoint map of model id → `{ prompt, completion, context, read?, write? }` rates. Two sources, mutually exclusive per endpoint:
- **Static Override**: hand-written in the endpoint's `tokenConfig` yaml block. Authoritative — its presence disables Fetched Pricing entirely for that endpoint, not just for the models it lists.
- **Fetched Pricing**: pulled automatically from the provider (OpenRouter, Helicone, LiteLLM), cached in the token-config cache, refreshed on the same cycle as the model list.
_Avoid_: pricing config, rate table (reserve "table" for the built-in vendor tables below).

**Built-in Tables**:
The hard-coded `tokenValues`/`bedrockValues`/`cacheTokenValues` maps in `tx.ts`, keyed by vendor model name substrings. The resolution path of last resort for any endpoint without a Token Config entry for a given model.

**Fall-Through Pricing**:
A charge resolved by guessing — substring-matching the Built-in Tables, or `defaultRate` — rather than an explicit Token Config entry. Expected and silent for built-in endpoints (OpenAI, Anthropic, Bedrock...), where the guess is usually correct. Warned on on custom endpoints, where model ids are admin/proxy-defined and a coincidental match is likely wrong.
_Avoid_: fallback pricing (used inconsistently in code comments for both this and legitimate defaulting; this term is the precise one going forward).

**Pre-Flight Check**:
The `checkBalance` estimate made before a request reaches the model, using the same Rate resolution as Settlement. Blocks the request if the estimate exceeds the user's balance.

**Settlement**:
The actual charge recorded after a response completes — `spendTokens`/`createTransaction`, writing a `Transaction` and decrementing the Balance. Must resolve the same Rate as the Pre-Flight Check for the same request; historically it didn't (see [ADR-0002](docs/adr/0002-transient-endpoint-in-settlement.md)).
