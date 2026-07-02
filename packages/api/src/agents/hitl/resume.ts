import type {
  ToolApprovalDecision,
  ToolApprovalDecisionMap,
  AskUserQuestionResolution,
} from '@librechat/agents';
import type { Agents } from 'librechat-data-provider';

/**
 * Translate the host-facing approval wire format into the SDK's resume value.
 *
 * The wire format ({@link Agents.ToolApprovalResolution}) is shaped for the UI —
 * a flat `decision` string plus optional `editedArguments` / `responseText`. The
 * SDK consumes a discriminated {@link ToolApprovalDecision} per tool call. This is
 * the single adapter between the two; the resume route maps once, here, instead of
 * branching on `decision` at the call site.
 *
 * Returns the map form (keyed by `tool_call_id`) so a batch that calls the same
 * tool twice resolves unambiguously — by-position ordering breaks with duplicates.
 */
export function mapToolApprovalResolutions(
  resolutions: readonly Agents.ToolApprovalResolution[],
): ToolApprovalDecisionMap {
  const decisions: ToolApprovalDecisionMap = {};
  for (const resolution of resolutions) {
    decisions[resolution.tool_call_id] = toSdkDecision(resolution);
  }
  return decisions;
}

function toSdkDecision(resolution: Agents.ToolApprovalResolution): ToolApprovalDecision {
  switch (resolution.decision) {
    case 'approve':
      return { type: 'approve' };
    case 'reject':
      return { type: 'reject', reason: resolution.reason };
    case 'edit':
      // `editedArguments` is required for edit on the wire; default to {} so a
      // malformed payload re-runs the tool with empty args rather than throwing.
      return { type: 'edit', updatedInput: resolution.editedArguments ?? {} };
    case 'respond':
      return { type: 'respond', responseText: resolution.responseText ?? '' };
    default:
      // Unknown decision (forward-compat / malformed): fail closed by rejecting,
      // never by silently approving a tool the user didn't sanction.
      return { type: 'reject', reason: 'Unrecognized approval decision' };
  }
}

/** Translate the ask-user wire answer into the SDK's resume value. */
export function mapAskUserAnswer(
  resolution: Agents.AskUserQuestionResolution,
): AskUserQuestionResolution {
  return { answer: resolution.answer };
}

/**
 * Validate that a set of resolutions covers exactly the tool calls a pending
 * `tool_approval` action is waiting on. Returns the list of `tool_call_id`s that
 * were requested but not decided (empty when the batch is fully resolved), so the
 * resume route can 400 a partial submission instead of driving a half-decided run.
 */
export function findUndecidedToolCalls(
  payload: Agents.ToolApprovalInterruptPayload,
  resolutions: readonly Agents.ToolApprovalResolution[],
): string[] {
  const decided = new Set(resolutions.map((r) => r.tool_call_id));
  return payload.action_requests.map((a) => a.tool_call_id).filter((id) => !decided.has(id));
}

/**
 * Enforce the policy's per-tool `allowed_decisions`. Returns the `tool_call_id`s
 * whose submitted decision is NOT one the interrupt's `review_configs` permits for
 * that tool — so the resume route can reject a crafted request that, e.g., approves
 * a tool the policy restricted to `reject`/`respond`. A resolution for a tool with
 * no matching review_config (shouldn't happen) is treated as disallowed (fail closed).
 */
export function findDisallowedDecisions(
  payload: Agents.ToolApprovalInterruptPayload,
  resolutions: readonly Agents.ToolApprovalResolution[],
): string[] {
  const allowedByToolCallId = new Map<string, Set<Agents.ToolApprovalDecisionType>>();
  for (const config of payload.review_configs) {
    allowedByToolCallId.set(config.tool_call_id, new Set(config.allowed_decisions));
  }
  return resolutions
    .filter((r) => !allowedByToolCallId.get(r.tool_call_id)?.has(r.decision))
    .map((r) => r.tool_call_id);
}

/**
 * Enforce that `edit` and `respond` decisions carry their required payload. Returns
 * the `tool_call_id`s whose decision is structurally incomplete:
 *   - `edit` without an object `editedArguments`, or
 *   - `respond` without a non-empty `responseText`.
 *
 * Without this, {@link toSdkDecision}'s defensive defaults (`{}` / `''`) would turn a
 * crafted or buggy submission into an empty tool input or an empty synthetic result —
 * resuming the run with behavior the user never actually approved. The route rejects
 * these (400) rather than mapping them.
 */
export function findIncompleteDecisions(
  resolutions: readonly Agents.ToolApprovalResolution[],
): string[] {
  return resolutions
    .filter((r) => {
      if (r.decision === 'edit') {
        return (
          r.editedArguments == null ||
          typeof r.editedArguments !== 'object' ||
          Array.isArray(r.editedArguments)
        );
      }
      if (r.decision === 'respond') {
        return typeof r.responseText !== 'string' || r.responseText.length === 0;
      }
      return false;
    })
    .map((r) => r.tool_call_id);
}
