import { randomUUID } from 'crypto';
import type { Agents, TToolApprovalPolicy, ToolApprovalDecision } from 'librechat-data-provider';

/**
 * Default decision set offered to the user for a paused tool call.
 *
 * `approve` runs the tool as-is, `reject` blocks it with a rejection message,
 * `edit` re-runs it with user-supplied arguments. `respond` is reserved for
 * the future ask-user-question flow and intentionally NOT in the default set.
 */
const DEFAULT_REVIEW_DECISIONS: Agents.ToolApprovalDecision[] = ['approve', 'reject', 'edit'];

/**
 * Tool reference accepted by the policy resolver.
 * Loosened from `Agents.ToolCall` so callers can pass minimal shapes
 * (e.g. SDK hook payloads, MCP-derived names) without re-typing.
 */
export interface ToolRef {
  name?: string;
}

/**
 * Decide whether a tool call requires human approval, denial, or can run as-is.
 *
 * Resolution order:
 *   1. `excluded` (always allow) wins over everything else.
 *   2. `required` (always ask) wins over the default.
 *   3. Falls back to `policy.default`, which itself defaults to `'allow'`.
 *
 * Returns `'allow'` when no policy is configured or the tool name is missing.
 */
export function decideToolApproval(
  policy: TToolApprovalPolicy | undefined,
  tool: ToolRef,
): ToolApprovalDecision {
  if (!policy) {
    return 'allow';
  }
  const name = tool.name;
  const fallback = policy.default ?? 'allow';
  if (!name) {
    return fallback;
  }
  if (policy.excluded?.includes(name)) {
    return 'allow';
  }
  if (policy.required?.includes(name)) {
    return 'ask';
  }
  return fallback;
}

/** Convenience wrapper. True when the tool call should be paused for human review. */
export function requiresApproval(policy: TToolApprovalPolicy | undefined, tool: ToolRef): boolean {
  return decideToolApproval(policy, tool) === 'ask';
}

/** Input shape for {@link buildPendingAction}. */
export interface BuildPendingActionInput {
  streamId: string;
  conversationId?: string;
  /** Stable per-turn identifier (e.g. responseMessageId or LangGraph checkpoint_ns). */
  runId?: string;
  responseMessageId?: string;
  /** One entry per tool call awaiting review in this interrupt. */
  toolCalls: Array<{
    name: string;
    arguments: string | Record<string, unknown>;
    tool_call_id: string;
    description?: string;
  }>;
  /** Override decisions per tool name. Falls back to {@link DEFAULT_REVIEW_DECISIONS}. */
  decisionsByToolName?: Record<string, Agents.ToolApprovalDecision[]>;
  /** Optional TTL (ms). When set, `expiresAt = createdAt + ttlMs`. */
  ttlMs?: number;
  /** Override actionId; defaults to a fresh uuid. */
  actionId?: string;
}

/**
 * Build a {@link Agents.PendingAction} record from one or more paused tool calls.
 *
 * The resulting `payload` mirrors LangChain HITL middleware's `HumanInterrupt` shape
 * (`action_requests` + `review_configs`) so it can be forwarded directly when the
 * SDK adopts native HITL primitives.
 */
export function buildPendingAction(input: BuildPendingActionInput): Agents.PendingAction {
  const createdAt = Date.now();
  const action_requests: Agents.ToolApprovalRequest[] = input.toolCalls.map((tc) => ({
    name: tc.name,
    arguments: tc.arguments,
    tool_call_id: tc.tool_call_id,
    description: tc.description,
  }));
  const review_configs: Agents.ToolReviewConfig[] = input.toolCalls.map((tc) => ({
    action_name: tc.name,
    allowed_decisions: input.decisionsByToolName?.[tc.name] ?? DEFAULT_REVIEW_DECISIONS,
  }));
  return {
    actionId: input.actionId ?? randomUUID(),
    streamId: input.streamId,
    conversationId: input.conversationId,
    runId: input.runId,
    responseMessageId: input.responseMessageId,
    payload: {
      type: 'tool_approval',
      action_requests,
      review_configs,
    },
    createdAt,
    expiresAt: input.ttlMs ? createdAt + input.ttlMs : undefined,
  };
}
