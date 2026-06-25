import { randomUUID, createHash } from 'crypto';
import type { Agents, TToolApprovalPolicy } from 'librechat-data-provider';
import type { ToolPolicyConfig } from '@librechat/agents';

/**
 * Default decisions offered to the user for a paused tool call.
 *
 * `'respond'` is intentionally NOT in the default set: it represents the agent
 * substituting a synthetic tool result, which is rarely the right ergonomic for
 * a stock approval prompt. Hosts that want it can pass an override.
 */
const DEFAULT_REVIEW_DECISIONS: Agents.ToolApprovalDecisionType[] = ['approve', 'reject', 'edit'];

/**
 * Whether the HITL machinery should run for this policy.
 *
 * HITL remains default-off for the rollout; `enabled: true` is the explicit
 * opt-in. Users wanting "stop asking me" after opting in should use
 * `mode: 'bypass'` instead, which keeps the machinery in place but auto-approves.
 *
 * **Wiring caveat (Slice B):** when this returns `true` and the host passes
 * `humanInTheLoop: { enabled: true }` to `Run.create`, the host MUST also
 * supply `compileOptions.checkpointer` with a durable saver
 * (`LibreChatCheckpointSaver`). Otherwise the SDK installs a process-local
 * `MemorySaver` fallback, which silently breaks resume across worker hops in
 * any multi-process deployment. Pair this predicate with the checkpointer
 * assignment at the `Run.create` call site.
 */
export function isHITLEnabled(policy: TToolApprovalPolicy | undefined): boolean {
  return policy?.enabled === true;
}

/**
 * Map a LibreChat tool-approval policy to the SDK's `ToolPolicyConfig`.
 *
 * Returns `undefined` when there's nothing to configure (so the SDK's own
 * defaults apply). The `enabled` field is LibreChat-only and stripped here —
 * it's consumed separately via {@link isHITLEnabled} to gate the SDK opt-out.
 */
export function mapToolApprovalPolicy(
  policy: TToolApprovalPolicy | undefined,
): ToolPolicyConfig | undefined {
  if (!policy) {
    return undefined;
  }
  const config: ToolPolicyConfig = {};
  if (policy.mode) {
    config.mode = policy.mode;
  }
  if (policy.allow && policy.allow.length > 0) {
    config.allow = policy.allow;
  }
  if (policy.deny && policy.deny.length > 0) {
    config.deny = policy.deny;
  }
  if (policy.ask && policy.ask.length > 0) {
    config.ask = policy.ask;
  }
  if (policy.reason) {
    config.reason = policy.reason;
  }
  return Object.keys(config).length > 0 ? config : undefined;
}

/** Tool-call shape consumed by {@link buildToolApprovalPayload}. */
export interface ToolApprovalCallInput {
  name: string;
  arguments: string | Record<string, unknown>;
  tool_call_id: string;
  description?: string;
}

/**
 * Build a tool-approval interrupt payload from one or more paused tool calls.
 *
 * Mirrors the SDK's `ToolApprovalInterruptPayload` shape so this can be used
 * to synthesize payloads in tests, or by the host before the SDK upgrade ships.
 */
export function buildToolApprovalPayload(
  toolCalls: ToolApprovalCallInput[],
  decisionsByToolName?: Record<string, Agents.ToolApprovalDecisionType[]>,
): Agents.ToolApprovalInterruptPayload {
  return {
    type: 'tool_approval',
    action_requests: toolCalls.map((tc) => ({
      name: tc.name,
      arguments: tc.arguments,
      tool_call_id: tc.tool_call_id,
      description: tc.description,
    })),
    review_configs: toolCalls.map((tc) => ({
      action_name: tc.name,
      tool_call_id: tc.tool_call_id,
      allowed_decisions: decisionsByToolName?.[tc.name] ?? DEFAULT_REVIEW_DECISIONS,
    })),
  };
}

/** Build an ask-user-question interrupt payload. */
export function buildAskUserQuestionPayload(
  question: Agents.AskUserQuestionRequest,
): Agents.AskUserQuestionInterruptPayload {
  return {
    type: 'ask_user_question',
    question,
  };
}

/** Job-context fields wrapped around a {@link Agents.HumanInterruptPayload}. */
export interface PendingActionContext {
  streamId: string;
  conversationId?: string;
  /** Stable per-turn identifier (e.g. responseMessageId or LangGraph checkpoint_ns). */
  runId?: string;
  responseMessageId?: string;
  /** Optional TTL (ms). When set, `expiresAt = createdAt + ttlMs`. */
  ttlMs?: number;
  /** Override actionId; defaults to a fresh uuid. */
  actionId?: string;
  /** SDK interrupt id (`RunInterruptResult.interruptId`) for cross-process resume. */
  interruptId?: string;
  /** LangGraph `thread_id` (`RunInterruptResult.threadId`) for cross-process resume. */
  threadId?: string;
  /** Fingerprint of the graph-determining request fields; see {@link computeAgentRequestFingerprint}. */
  requestFingerprint?: string;
}

/** Request fields that decide which agent/graph + tool set a turn runs. */
export interface AgentRequestFingerprintFields {
  endpoint?: string | null;
  endpointType?: string | null;
  agent_id?: string | null;
  model?: string | null;
  spec?: string | null;
  ephemeralAgent?: Record<string, unknown> | null;
}

/** Stable, order-independent serialization of the ephemeral capability config. */
function normalizeEphemeralAgent(ephemeral: Record<string, unknown> | null | undefined): unknown {
  if (ephemeral == null || typeof ephemeral !== 'object') {
    return null;
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(ephemeral).sort()) {
    const value = ephemeral[key];
    out[key] = Array.isArray(value) ? [...value].sort() : value;
  }
  return out;
}

/**
 * Fingerprint the request fields that determine which agent/graph + tool set a turn
 * runs. Persisted on the pending action at pause time and recomputed on resume; a
 * mismatch means the resume would rebuild a DIFFERENT graph. This is the guard that
 * catches an ephemeral-agent config swap — those have an undefined `agent_id`, so the
 * id check alone can't tell two ephemeral configs apart.
 */
export function computeAgentRequestFingerprint(fields: AgentRequestFingerprintFields): string {
  const canonical = JSON.stringify({
    endpoint: fields.endpoint ?? null,
    endpointType: fields.endpointType ?? null,
    agent_id: fields.agent_id ?? null,
    model: fields.model ?? null,
    spec: fields.spec ?? null,
    ephemeralAgent: normalizeEphemeralAgent(fields.ephemeralAgent),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Wrap a HumanInterruptPayload (from the SDK or synthesized locally) as a
 * {@link Agents.PendingAction} record persisted with the job.
 *
 * Accepts both interrupt categories (`tool_approval` and `ask_user_question`)
 * via the discriminated union — the host doesn't need to branch.
 */
export function buildPendingAction(
  payload: Agents.HumanInterruptPayload,
  ctx: PendingActionContext,
): Agents.PendingAction {
  const createdAt = Date.now();
  return {
    actionId: ctx.actionId ?? randomUUID(),
    streamId: ctx.streamId,
    conversationId: ctx.conversationId,
    runId: ctx.runId,
    responseMessageId: ctx.responseMessageId,
    payload,
    createdAt,
    expiresAt: typeof ctx.ttlMs === 'number' ? createdAt + ctx.ttlMs : undefined,
    interruptId: ctx.interruptId,
    threadId: ctx.threadId,
    requestFingerprint: ctx.requestFingerprint,
  };
}
