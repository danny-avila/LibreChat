import { randomUUID } from 'crypto';
import type { Agents, TToolApprovalPolicy } from 'librechat-data-provider';

/**
 * Default decisions offered to the user for a paused tool call.
 *
 * `'respond'` is intentionally NOT in the default set: it represents the agent
 * substituting a synthetic tool result, which is rarely the right ergonomic for
 * a stock approval prompt. Hosts that want it can pass an override.
 */
const DEFAULT_REVIEW_DECISIONS: Agents.ToolApprovalDecisionType[] = ['approve', 'reject', 'edit'];

/**
 * Structural mirror of `@librechat/agents`'s `ToolPolicyConfig`.
 *
 * Defined here (rather than imported) so this module compiles before the SDK
 * version that ships `createToolPolicyHook` is published. When the SDK is
 * pinned, callers in Slice B can `import type { ToolPolicyConfig }` and
 * the structural identity holds.
 */
export interface ToolPolicyConfig {
  mode?: 'default' | 'dontAsk' | 'bypass';
  allow?: string[];
  deny?: string[];
  ask?: string[];
  reason?: string;
}

/**
 * Whether the HITL machinery should run for this policy.
 *
 * `false` is the LibreChat-only admin kill switch — it disables the SDK
 * checkpointer fallback and skips installing the policy hook entirely.
 * Users wanting "stop asking me" should use `mode: 'bypass'` instead, which
 * keeps the machinery in place but auto-approves.
 */
export function isHITLEnabled(policy: TToolApprovalPolicy | undefined): boolean {
  return policy?.enabled !== false;
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
    expiresAt: ctx.ttlMs ? createdAt + ctx.ttlMs : undefined,
  };
}
