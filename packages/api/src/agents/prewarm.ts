import { logger } from '@librechat/data-schemas';
import { getCodeBaseURL } from '@librechat/agents';
import { CacheKeys } from 'librechat-data-provider';
import type { Keyv } from 'keyv';
import type { ServerRequest } from '~/types';
import { getCodeApiAuthHeaders } from '~/auth/codeapi';
import { standardCache } from '~/cache/cacheFactory';
import { anyAgentHasStatefulSessions } from './run';

type PrewarmAgents = Parameters<typeof anyAgentHasStatefulSessions>[0];

const PREWARM_INFLIGHT_COOLDOWN_MS = 120_000;
const PREWARM_REQUEST_TIMEOUT_MS = 120_000;

/**
 * How long a sandbox is assumed to survive without a touch before a fresh
 * boot is required. Mirrors the Code API's idle + suspend windows
 * (`LAMBDA_MICROVM_IDLE_SECONDS` + `LAMBDA_MICROVM_SUSPEND_SECONDS`,
 * 300s + 1800s by default): within the window the VM is warm or resumes
 * in ~1s, past it the next exec pays a full relaunch + checkpoint restore.
 */
function coldAfterMs(): number {
  const parsed = Number(process.env.CODE_SANDBOX_COLD_AFTER_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2_100_000;
}

function prewarmDisabled(): boolean {
  return process.env.CODE_SANDBOX_PREWARM === 'false';
}

/**
 * Per-conversation sandbox state, shared across replicas when Redis is
 * configured and falling back to a process-local store otherwise. Two keys
 * per conversation (= runtime_session_hint):
 * - `inflight:<id>` — a prewarm was fired and no completion has landed yet;
 *   the TTL doubles as the retry backoff when a prewarm fails or hangs.
 * - `ready:<id>` — the sandbox completed a request (prewarm or real exec)
 *   within the warm window.
 */
let cacheInstance: Keyv | undefined;

function sandboxCache(): Keyv {
  if (!cacheInstance) {
    cacheInstance = standardCache(CacheKeys.SANDBOX_PREWARM);
  }
  return cacheInstance;
}

function readyKey(conversationId: string): string {
  return `ready:${conversationId}`;
}

function inflightKey(conversationId: string): string {
  return `inflight:${conversationId}`;
}

/**
 * Record that the conversation's sandbox answered a request (prewarm or a
 * real execute_code/bash call), refreshing the warm window and releasing
 * any in-flight prewarm marker. Callers on hot paths should not await this;
 * `void markSandboxReady(...)` is the expected usage.
 */
export async function markSandboxReady(conversationId: string): Promise<void> {
  if (!conversationId) {
    return;
  }
  const cache = sandboxCache();
  await Promise.all([
    cache.set(readyKey(conversationId), true, coldAfterMs()),
    cache.delete(inflightKey(conversationId)),
  ]);
}

/**
 * Whether the UI should be told the sandbox is cold-booting for this
 * conversation's code tool call: a prewarm is in flight and no completion
 * (prewarm or real exec) has landed. Deployments that never prewarm —
 * stateless setups or the `CODE_SANDBOX_PREWARM=false` kill switch — never
 * have an in-flight marker and never signal, preserving existing behavior.
 */
export async function shouldSignalSandboxStart(conversationId?: string | null): Promise<boolean> {
  if (!conversationId || prewarmDisabled()) {
    return false;
  }
  const cache = sandboxCache();
  const [ready, inflight] = await Promise.all([
    cache.get(readyKey(conversationId)),
    cache.get(inflightKey(conversationId)),
  ]);
  return inflight != null && ready == null;
}

async function sendPrewarmRequest(req: ServerRequest, conversationId: string): Promise<void> {
  const authHeaders = await getCodeApiAuthHeaders(req);
  const response = await fetch(`${getCodeBaseURL()}/exec`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'LibreChat/1.0',
      ...authHeaders,
    },
    body: JSON.stringify({ lang: 'bash', code: 'true', runtime_session_hint: conversationId }),
    signal: AbortSignal.timeout(PREWARM_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    await response.arrayBuffer().catch(() => undefined);
    throw new Error(`prewarm exec returned ${response.status}`);
  }
  /* fetch resolves at headers, but the sandbox is only warm once the exec's
   * body has fully arrived — a failed drain means the exec did not complete,
   * so it must propagate as a prewarm failure instead of marking ready.
   * Draining also releases the socket instead of leaving the body for
   * undici to reap. */
  await response.arrayBuffer();
  await markSandboxReady(conversationId);
  logger.debug(`[prewarmCodeSandbox] Sandbox warm for conversation ${conversationId}`);
}

/**
 * Fire-and-forget boot of the per-conversation stateful code sandbox so it
 * comes up in parallel with model generation instead of on the first
 * execute_code/bash call (~4s cold, worse on heavy first imports). No-op
 * unless a reachable agent resolved `statefulCodeSessions` and neither a
 * warm marker nor an in-flight prewarm exists. The existence check and
 * marker write are not atomic, so concurrent turns (or replicas) can rarely
 * double-fire — harmless, since the prewarm exec is a trivial idempotent
 * `true` and the Code API serializes per-session work behind its own lock.
 * Failures are logged at debug level and never affect the chat request; the
 * in-flight marker's TTL then acts as the retry backoff.
 */
export function maybePrewarmCodeSandbox(params: {
  req: ServerRequest;
  conversationId?: string | null;
  agents: PrewarmAgents;
}): void {
  const { req, conversationId, agents } = params;
  if (prewarmDisabled() || !conversationId || !anyAgentHasStatefulSessions(agents)) {
    return;
  }
  void (async () => {
    const cache = sandboxCache();
    const [ready, inflight] = await Promise.all([
      cache.get(readyKey(conversationId)),
      cache.get(inflightKey(conversationId)),
    ]);
    if (ready != null || inflight != null) {
      return;
    }
    await cache.set(inflightKey(conversationId), true, PREWARM_INFLIGHT_COOLDOWN_MS);
    await sendPrewarmRequest(req, conversationId);
  })().catch((error) => {
    logger.debug(
      `[prewarmCodeSandbox] Prewarm failed for conversation ${conversationId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  });
}

/** Test-only: clear tracked sandbox state between specs. */
export async function resetSandboxStateForTests(): Promise<void> {
  await sandboxCache().clear();
}
