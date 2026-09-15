import { createHash } from 'node:crypto';
import { canonicalize } from '~/utils/canonicalize';

/**
 * Bumped when the hashed payload's shape changes, so an upgraded deployment
 * stops colliding with keys written by the previous shape instead of pointing
 * two different prefixes at one cache entry.
 */
export const PROMPT_CACHE_KEY_VERSION = 1;

/**
 * Models that accept the GPT-5.6 explicit cache controls the agents SDK emits
 * (`prompt_cache_options`, `prompt_cache_breakpoint`). OpenAI rejects unknown
 * body parameters outright, so a model outside this set must never receive
 * them. GPT-6 Astra shares GPT-5.6's managed-request surface.
 */
const explicitPromptCachePattern = /\bgpt-(?:5\.6|6)\b/i;

export function supportsExplicitPromptCache(model?: string | null): boolean {
  return typeof model === 'string' && explicitPromptCachePattern.test(model);
}

/**
 * The stable half of a request's prompt identity. Everything here is expected
 * to be byte-identical across conversations that share a prefix; anything that
 * turns over per turn or per user (the dynamic instruction tail, memory, file
 * context, the conversation itself) is deliberately absent, because including
 * it would partition the cache exactly where reuse is wanted.
 */
export interface PromptCacheKeyInput {
  /** Wire model. On Azure this is the deployment alias, which is what serves the request. */
  model?: string | null;
  /** Stable system instructions: static tool context plus the agent's own instructions. */
  instructions?: string | null;
  /** Tool schemas in the order they are sent; order is part of the prefix, so it is part of the key. */
  toolDefinitions?: readonly unknown[];
  /** Structured-output schema, which participates in the cached prefix. */
  responseSchema?: unknown;
}

/**
 * Deterministic `prompt_cache_key` for requests that share a stable prefix.
 *
 * OpenAI routes cache lookups by this key in place of `user`, so two users
 * running the same agent reach the same cached prefix instead of sitting in
 * per-user partitions. A real change to the instructions, tool schemas or
 * output schema produces a different digest and therefore a new cache
 * identity, with no explicit invalidation step.
 */
export function buildPromptCacheKey(input: PromptCacheKeyInput): string {
  const canonical = JSON.stringify(
    canonicalize({
      version: PROMPT_CACHE_KEY_VERSION,
      model: input.model ?? '',
      instructions: input.instructions ?? '',
      toolDefinitions: input.toolDefinitions ?? [],
      responseSchema: input.responseSchema,
    }),
  );
  const digest = createHash('sha256').update(canonical).digest('base64url');
  return `librechat:${PROMPT_CACHE_KEY_VERSION}:${digest}`;
}
