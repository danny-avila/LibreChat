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
  /**
   * Outgoing handoff edges, which the SDK turns into model-facing
   * `lc_transfer_to_*` tools. They arrive on the graph rather than in
   * `boundTools`, so adding, removing or retargeting one changes the wire tool
   * prefix without touching any of the tool arrays.
   */
  handoffEdges?: readonly unknown[];
  /**
   * Cache-accounting partition. Two requests sharing a prefix but carrying
   * different scopes get different keys, which is what keeps one user's cached
   * prefix from being probed by another. Omitted only when an administrator
   * opts into sharing a single entry across the whole organization.
   */
  scopeId?: string | null;
}

/**
 * Projects one bound tool onto the identity that reaches the wire.
 *
 * A schema-only definition is plain JSON and is hashed whole, because fields
 * beyond the schema decide how the tool is exposed: `defer_loading` withholds
 * it from the binding until tool search finds it, and `allowed_callers` can
 * keep it off the model's direct surface entirely. An allowlist of name,
 * description and parameters would let those flip without retiring the key.
 *
 * A runtime instance carries a Zod schema instead, which `canonicalize`
 * refuses to walk, so it is identified by name and description — a schema
 * change there ships with the code change that causes it and is covered by
 * {@link PROMPT_CACHE_KEY_VERSION}.
 */
function toolCacheIdentity(tool: unknown): unknown {
  if (tool == null || typeof tool !== 'object') {
    return tool;
  }
  try {
    return canonicalize(tool);
  } catch {
    const candidate = tool as { name?: unknown; description?: unknown };
    return {
      name: typeof candidate.name === 'string' ? candidate.name : null,
      ...(typeof candidate.description === 'string' ? { description: candidate.description } : {}),
    };
  }
}

/**
 * Deterministic `prompt_cache_key` for requests that share a stable prefix.
 *
 * Before GPT-5.6 this key is a routing hint: requests carrying it are steered
 * toward a machine already holding the matching prefix. From GPT-5.6 on OpenAI
 * routes automatically and the key instead partitions cache accounting, which
 * is also what prevents cache-hit probing between partitions.
 *
 * Either way the digest is derived, not registered: a real change to the
 * instructions, tool schemas or output schema produces a new identity with no
 * explicit invalidation step, so a stale prefix can never be reused under a key
 * that no longer describes it.
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
      handoffEdges: (input.handoffEdges ?? []).map(toolCacheIdentity),
      /**
       * Hashed with the prefix rather than appended to the key, so the user id
       * an operator sees in OpenAI's cache accounting stays opaque.
       */
      scopeId: input.scopeId ?? null,
    }),
  );
  const digest = createHash('sha256').update(canonical).digest('base64url');
  return `librechat:${PROMPT_CACHE_KEY_VERSION}:${digest}`;
}
