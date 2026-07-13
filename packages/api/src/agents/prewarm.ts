import { logger } from '@librechat/data-schemas';
import { getCodeBaseURL } from '@librechat/agents';
import type { ServerRequest } from '~/types';
import { getCodeApiAuthHeaders } from '~/auth/codeapi';
import { anyAgentHasStatefulSessions } from './run';

type PrewarmAgents = Parameters<typeof anyAgentHasStatefulSessions>[0];

interface SandboxState {
  /** When the last prewarm request was fired; 0 when only real execs touched the entry. */
  firedAt: number;
  /** When the sandbox last confirmed a completed request (prewarm or real exec). */
  readyAt: number | null;
}

/**
 * Per-conversation sandbox lifecycle observations, keyed by conversationId
 * (= runtime_session_hint). Only conversations whose run resolved
 * `statefulCodeSessions` ever get an entry, so presence doubles as the
 * "stateful deployment" gate for {@link shouldSignalSandboxStart}.
 */
const sandboxStateByConversation = new Map<string, SandboxState>();

const MAX_TRACKED_CONVERSATIONS = 5000;
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

function pruneOldestEntries(): void {
  if (sandboxStateByConversation.size <= MAX_TRACKED_CONVERSATIONS) {
    return;
  }
  let oldestKey: string | null = null;
  let oldestTouchedAt = Infinity;
  for (const [key, state] of sandboxStateByConversation) {
    const touchedAt = Math.max(state.firedAt, state.readyAt ?? 0);
    if (touchedAt < oldestTouchedAt) {
      oldestTouchedAt = touchedAt;
      oldestKey = key;
    }
  }
  if (oldestKey != null) {
    sandboxStateByConversation.delete(oldestKey);
  }
}

/**
 * Record that the conversation's sandbox answered a request (prewarm or a
 * real execute_code/bash call). Refreshes the warm window used by both
 * {@link maybePrewarmCodeSandbox} and {@link shouldSignalSandboxStart}.
 */
export function markSandboxReady(conversationId: string): void {
  if (!conversationId) {
    return;
  }
  const now = Date.now();
  const state = sandboxStateByConversation.get(conversationId);
  if (state) {
    state.readyAt = now;
    return;
  }
  sandboxStateByConversation.set(conversationId, { firedAt: 0, readyAt: now });
  pruneOldestEntries();
}

/**
 * Whether the UI should be told the sandbox is cold-booting for this
 * conversation's code tool call. True only for conversations tracked as
 * stateful (an entry exists) whose sandbox has not confirmed ready within
 * the warm window — stateless deployments never get an entry and never
 * signal, preserving existing behavior. The `CODE_SANDBOX_PREWARM=false`
 * kill switch silences this too, reverting the full feature to baseline.
 */
export function shouldSignalSandboxStart(conversationId?: string | null): boolean {
  if (!conversationId || prewarmDisabled()) {
    return false;
  }
  const state = sandboxStateByConversation.get(conversationId);
  if (!state) {
    return false;
  }
  return state.readyAt == null || Date.now() - state.readyAt > coldAfterMs();
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
  markSandboxReady(conversationId);
  logger.debug(`[prewarmCodeSandbox] Sandbox warm for conversation ${conversationId}`);
}

/**
 * Fire-and-forget boot of the per-conversation stateful code sandbox so it
 * comes up in parallel with model generation instead of on the first
 * execute_code/bash call (~4s cold, worse on heavy first imports). No-op
 * unless a reachable agent resolved `statefulCodeSessions`, the sandbox is
 * outside its warm window, and no prewarm is already in flight. Failures
 * are logged at debug level and never affect the chat request; the first
 * real tool call simply pays the cold boot as before.
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
  const now = Date.now();
  const state = sandboxStateByConversation.get(conversationId);
  const withinWarmWindow = state?.readyAt != null && now - state.readyAt <= coldAfterMs();
  /* In-flight means a fired prewarm that no completion (readyAt) has caught
   * up with — real execs refreshing readyAt must not extend this, or a
   * cold-after window shorter than the cooldown could suppress needed
   * prewarms between the two thresholds. */
  const prewarmInFlight =
    state != null &&
    now - state.firedAt <= PREWARM_INFLIGHT_COOLDOWN_MS &&
    (state.readyAt == null || state.readyAt < state.firedAt);
  if (withinWarmWindow || prewarmInFlight) {
    return;
  }
  if (state) {
    state.firedAt = now;
  } else {
    sandboxStateByConversation.set(conversationId, { firedAt: now, readyAt: null });
    pruneOldestEntries();
  }
  void sendPrewarmRequest(req, conversationId).catch((error) => {
    logger.debug(
      `[prewarmCodeSandbox] Prewarm failed for conversation ${conversationId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  });
}

/** Test-only: clear tracked sandbox state between specs. */
export function resetSandboxStateForTests(): void {
  sandboxStateByConversation.clear();
}
