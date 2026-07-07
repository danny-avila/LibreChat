import { GraphEvents } from '@librechat/agents';
import type {
  ToolApprovalDecision,
  ToolApprovalDecisionMap,
  AskUserQuestionResolution,
  EventHandler,
} from '@librechat/agents';
import type { Agents } from 'librechat-data-provider';
import { ASK_USER_QUESTION_TOOL_NAME } from './askUserQuestionTool';

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

/**
 * Wrap a resume run's event handlers so every content index the rebuilt graph
 * emits is shifted past the pre-pause content.
 *
 * WHY: a resumed run rebuilds the graph from the checkpoint, and the fresh
 * graph assigns content indices from its own empty `contentData` — starting at
 * 0. The host, meanwhile, seeds the (also fresh) content aggregator with the
 * pre-pause parts, which occupy exactly those low indices. Without an offset
 * the resumed model turn collides with the seed: when the types match at an
 * index the new text silently MERGES into a pre-pause part, and when they
 * don't (e.g. a reasoning/`think` part at index 0 with Anthropic models) every
 * delta is dropped with `Content type mismatch` — the entire post-resume
 * output vanishes from both the live stream and the saved message.
 *
 * The index enters the pipeline at exactly one point: `ON_RUN_STEP`'s payload
 * (the `RunStep`, whose `index` every subsequent delta resolves through the
 * aggregator's `stepMap`). `ON_AGENT_UPDATE` carries its own inline index and
 * is offset likewise. All other handlers pass through untouched — same object
 * references, so stateful handler instances keep working.
 */
export function createContentIndexOffsetHandlers(
  handlers: Record<string, EventHandler> | undefined,
  offset: number,
): Record<string, EventHandler> | undefined {
  if (handlers == null || !(offset > 0)) {
    return handlers;
  }

  const wrapped: Record<string, EventHandler> = { ...handlers };

  const runStepHandler = handlers[GraphEvents.ON_RUN_STEP];
  if (runStepHandler) {
    wrapped[GraphEvents.ON_RUN_STEP] = {
      handle: (event, data, metadata, graph) => {
        const runStep = data as { index?: number } | undefined;
        const shifted =
          runStep != null && typeof runStep.index === 'number'
            ? { ...runStep, index: runStep.index + offset }
            : data;
        return runStepHandler.handle(event, shifted as typeof data, metadata, graph);
      },
    };
  }

  const agentUpdateHandler = handlers[GraphEvents.ON_AGENT_UPDATE];
  if (agentUpdateHandler) {
    wrapped[GraphEvents.ON_AGENT_UPDATE] = {
      handle: (event, data, metadata, graph) => {
        const update = data as { agent_update?: { index?: number } } | undefined;
        const shifted =
          update?.agent_update != null && typeof update.agent_update.index === 'number'
            ? {
                ...update,
                agent_update: { ...update.agent_update, index: update.agent_update.index + offset },
              }
            : data;
        return agentUpdateHandler.handle(event, shifted as typeof data, metadata, graph);
      },
    };
  }

  return wrapped;
}

/**
 * Stamp the answered question onto the paused `ask_user_question` tool-call part
 * before the resume run seeds it back into the content pipeline.
 *
 * WHY the part is otherwise empty: the streamed arg CHUNKS carry no tool name, and
 * the aggregator only accepts name-less arg updates on the completion event — which
 * never fires for this tool (the first pass interrupts mid-execution, and the
 * rebuilt resume run has no step id to complete against). Saved messages therefore
 * showed `args: ""` and no `output`, and the client rendered a "cancelled" tool.
 * The authoritative data exists anyway: the pendingAction payload carries the full
 * question, and the resume request carries the user's answer.
 *
 * Patches the LAST unanswered ask part (a re-pause targets the newest question;
 * earlier ones already carry their answers). Pure — returns the input array when
 * nothing matched.
 */
export function attachAskUserQuestionAnswer<
  TPart extends { type?: string; tool_call?: { name?: string; output?: unknown } },
>(content: TPart[], question: Agents.AskUserQuestionRequest, answer: string): TPart[] {
  for (let i = content.length - 1; i >= 0; i--) {
    const part = content[i];
    const toolCall = part?.tool_call;
    if (
      part?.type !== 'tool_call' ||
      toolCall?.name !== ASK_USER_QUESTION_TOOL_NAME ||
      (typeof toolCall.output === 'string' && toolCall.output.length > 0)
    ) {
      continue;
    }
    const next = [...content];
    next[i] = {
      ...part,
      tool_call: {
        ...toolCall,
        args: JSON.stringify(question),
        output: answer,
        progress: 1,
      },
    };
    return next;
  }
  return content;
}
