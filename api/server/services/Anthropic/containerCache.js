const { Keyv } = require('keyv');
const { Time } = require('librechat-data-provider');
const keyvRedis = require('~/cache/keyvRedis');
const { isEnabled } = require('~/server/utils');
const { logger } = require('~/config');

const NAMESPACE = 'anthropic-warm-container';
/* Anthropic returns expires_at ~1 hour after container creation. Match that
 * with a small safety margin so we proactively re-provision before the
 * container is gone, rather than relying on the stale-container retry path. */
const TTL_MS = Time.ONE_HOUR - Time.FIVE_MINUTES;

const ANTHROPIC_API_BASE = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';
/* Same headers we use for Skills/code execution requests, kept in sync with
 * helpers.js:getClaudeHeaders. */
const WARMUP_BETAS =
  'prompt-caching-2024-07-31,code-execution-2025-08-25,skills-2025-10-02,files-api-2025-04-14';

const isRedisEnabled = isEnabled(process.env.USE_REDIS);
const cache = isRedisEnabled
  ? new Keyv({ store: keyvRedis, namespace: NAMESPACE, ttl: TTL_MS })
  : new Keyv({ namespace: NAMESPACE, ttl: TTL_MS });

/** In-flight provisioning promises keyed by userId. Prevents two concurrent
 *  warmup triggers (e.g. Help Others button + sidebar load fired ms apart)
 *  from each provisioning their own container. The second waits on the same
 *  promise the first started. */
/** @type {Map<string, Promise<string | null>>} */
const inFlight = new Map();

/**
 * Provisions a fresh Anthropic container by sending a minimal Skills-enabled
 * message. Returns the container id from the response, or null on failure.
 * @param {string} apiKey
 * @param {string} model
 * @returns {Promise<string | null>}
 */
async function provisionContainer(apiKey, model) {
  try {
    /* Provision a container by getting Claude to invoke server-side code
     * execution. For server tools, Anthropic auto-executes when Claude calls
     * them (no tool_choice needed — that's for client-side tool patterns).
     * We give a clear directive prompt and enough max_tokens for the
     * tool_use + tool_result roundtrip. */
    const res = await fetch(`${ANTHROPIC_API_BASE}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-beta': WARMUP_BETAS,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content:
              'Please run a quick code execution that just prints "ready" and exits. ' +
              'This is to initialize the environment — no further work after that.',
          },
        ],
        tools: [{ type: 'code_execution_20250825', name: 'code_execution' }],
        container: {
          skills: [
            { type: 'anthropic', skill_id: 'docx', version: 'latest' },
            { type: 'anthropic', skill_id: 'pdf', version: 'latest' },
          ],
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.warn(`[containerCache] Warmup ${res.status}: ${body.slice(0, 600)}`);
      return null;
    }

    const data = await res.json();
    const containerId = data?.container?.id;
    if (typeof containerId !== 'string' || !containerId) {
      logger.warn(
        `[containerCache] Warmup response missing container.id; container=${JSON.stringify(data?.container)}`,
      );
      return null;
    }
    return containerId;
  } catch (error) {
    logger.warn('[containerCache] Warmup network error', error?.message ?? error);
    return null;
  }
}

/**
 * Returns the user's warm container id, provisioning one if none is cached.
 * Idempotent — concurrent calls dedupe to a single provisioning request.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.apiKey
 * @param {string} [params.model='claude-sonnet-4-6']
 * @returns {Promise<string | null>}
 */
async function getOrCreateWarmContainer({ userId, apiKey, model = 'claude-sonnet-4-6' }) {
  if (!userId || !apiKey) {
    return null;
  }

  const existing = await cache.get(userId);
  if (typeof existing === 'string' && existing) {
    logger.info(`[WARMUP] cache hit for user ${userId} -> ${existing}`);
    return existing;
  }

  const inflight = inFlight.get(userId);
  if (inflight) {
    logger.info(`[WARMUP] dedupe — joining in-flight provision for user ${userId}`);
    return inflight;
  }

  logger.info(`[WARMUP] provisioning new container for user ${userId}…`);
  const startedAt = Date.now();
  const provisionPromise = (async () => {
    const containerId = await provisionContainer(apiKey, model);
    if (containerId) {
      await cache.set(userId, containerId, TTL_MS);
      logger.info(
        `[WARMUP] provisioned container ${containerId} for user ${userId} in ${Date.now() - startedAt}ms`,
      );
    } else {
      logger.warn(
        `[WARMUP] provisioning failed for user ${userId} after ${Date.now() - startedAt}ms`,
      );
    }
    return containerId;
  })().finally(() => {
    inFlight.delete(userId);
  });

  inFlight.set(userId, provisionPromise);
  return provisionPromise;
}

/**
 * Returns the cached container id for a user, or undefined if none.
 * Used by AnthropicClient to opportunistically attach `container.id` to
 * outgoing Skills-enabled requests without triggering provisioning.
 * @param {string} userId
 * @returns {Promise<string | undefined>}
 */
async function peekWarmContainer(userId) {
  if (!userId) {
    return undefined;
  }
  const value = await cache.get(userId);
  return typeof value === 'string' && value ? value : undefined;
}

/**
 * Stores a container id for a user (e.g., from a response that created a new
 * container outside the warmup flow).
 * @param {string} userId
 * @param {string} containerId
 */
async function setWarmContainer(userId, containerId) {
  if (!userId || !containerId) {
    return;
  }
  await cache.set(userId, containerId, TTL_MS);
}

/**
 * Drops the cached container id for a user. Call on errors that indicate the
 * stored container is stale (e.g. Anthropic returned "container not found").
 * @param {string} userId
 */
async function invalidateWarmContainer(userId) {
  if (!userId) {
    return;
  }
  await cache.delete(userId);
}

module.exports = {
  getOrCreateWarmContainer,
  peekWarmContainer,
  setWarmContainer,
  invalidateWarmContainer,
};
