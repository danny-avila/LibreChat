import { createHash } from 'node:crypto';
import { canonicalize } from '~/utils/canonicalize';

/**
 * Bumped when the hashed payload's shape changes, so an upgraded deployment
 * stops colliding with keys written by the previous shape instead of pointing
 * two different prefixes at one cache entry.
 */
export const PROMPT_CACHE_KEY_VERSION = 2;

/**
 * Models that accept the GPT-5.6 explicit cache controls the agents SDK emits
 * (`prompt_cache_options`, `prompt_cache_breakpoint`). OpenAI rejects unknown
 * body parameters outright, so a model outside this set must never receive
 * them. GPT-6 Astra shares GPT-5.6's managed-request surface.
 *
 * The dash form matches Azure deployment names, which cannot contain a dot.
 */
const explicitPromptCachePattern = /\bgpt-(?:5[.-]6|6)\b/i;

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
  /**
   * Every tool bound to the model, in the order it is sent: schema-only
   * definitions, graph tools, and provider-native specs alike. Order is part
   * of the prefix, so it is part of the key.
   */
  boundTools?: readonly unknown[];
  /**
   * Structured-output schema, which participates in the cached prefix. Chat
   * Completions carries it as `response_format`; the Responses API carries it
   * as `text.format`. Both are hashed under their own name rather than
   * collapsed, so neither API's schema can borrow the other's identity.
   */
  responseSchema?: unknown;
  responsesTextFormat?: unknown;
}

/**
 * Projects one bound tool onto the identity that reaches the wire.
 *
 * A schema-only definition carries JSON Schema in `parameters` and is hashed
 * whole. A runtime instance carries a Zod object instead, which is neither
 * stable JSON nor safe to walk — it is identified by name and description, so
 * a schema change to one of those ships with the code change that causes it
 * and is covered by {@link PROMPT_CACHE_KEY_VERSION}. A provider-native spec
 * such as `{ type: 'web_search' }` has no name and is already plain JSON.
 */
function toolCacheIdentity(tool: unknown): unknown {
  if (tool == null || typeof tool !== 'object') {
    return tool;
  }
  const candidate = tool as { name?: unknown; description?: unknown; parameters?: unknown };
  if (typeof candidate.name !== 'string') {
    return tool;
  }
  const parameters = candidate.parameters;
  const isJsonSchema =
    parameters != null &&
    typeof parameters === 'object' &&
    !Array.isArray(parameters) &&
    Object.getPrototypeOf(parameters) === Object.prototype;
  return {
    name: candidate.name,
    ...(typeof candidate.description === 'string' ? { description: candidate.description } : {}),
    ...(isJsonSchema ? { parameters } : {}),
  };
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
      boundTools: (input.boundTools ?? []).map(toolCacheIdentity),
      responseSchema: input.responseSchema,
      responsesTextFormat: input.responsesTextFormat,
    }),
  );
  const digest = createHash('sha256').update(canonical).digest('base64url');
  return `librechat:${PROMPT_CACHE_KEY_VERSION}:${digest}`;
}
