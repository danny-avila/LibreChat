import { Tools, ContentTypes, ToolCallTypes } from 'librechat-data-provider';
import type {
  Agents,
  TAttachment,
  PartMetadata,
  FunctionToolCall,
  TMessageContentParts,
} from 'librechat-data-provider';
import { parseBackgroundHandle, splitBackgroundAttachments } from './Parts/handle';
import { resolveToolCallPhase } from '~/utils/toolCallPhase';
import { isMemoryFailureOutput } from './Parts/MemoryCall';
import { filterAttachmentsForPart } from '~/utils/map';
import { isBashProgrammaticToolCall } from './routing';
import { isError } from './ToolOutput';

/**
 * The one place a tool call's outcome is decided for anything that SUMMARIZES
 * calls — a group header, a live fold's line. Each signal below was added
 * because a summary disagreed with the card it stood for: the run step's
 * terminal verdict, memory tools' prose failures, a backgrounded task's status
 * attachment and its cancelled flag. A summary that derives its own verdict
 * re-learns those one review at a time, so it reads this instead.
 */
export interface ToolMeta {
  name: string;
  iconName: string;
  hasOutput: boolean;
  failed: boolean;
  cancelled: boolean;
}

function hasFailedOutput(output: unknown): boolean {
  return typeof output === 'string' && isError(output);
}

/**
 * Group metadata must agree with the individual card, which resolves its
 * outcome from the run step's terminal verdict through `resolveToolCallPhase`.
 * Reading output alone leaves a step the run closed as `failed` with empty or
 * benign output counted as neither failed nor finished, so the group sits on
 * "Running" until the response ends and then reports that it ran successfully
 * with no failures while the card beside it shows the failure. A closed step
 * is never running. Parts carrying no terminal status keep the legacy
 * output/progress signal, which is all the older endpoints emit.
 */
function resolveOutcome(
  runStepStatus: PartMetadata['runStepStatus'],
  completed: boolean,
  hasError: boolean,
): Pick<ToolMeta, 'hasOutput' | 'failed' | 'cancelled'> {
  if (runStepStatus == null) {
    return { hasOutput: completed, failed: hasError, cancelled: false };
  }
  const phase = resolveToolCallPhase({
    runStepStatus,
    displayProgress: 1,
    reportedProgress: 1,
    isSubmitting: false,
    hasError,
  });
  return {
    hasOutput: phase !== 'running',
    failed: phase === 'failed',
    /** Tracked separately from `failed`: a stopped step is settled and not an
     *  error, but the group still must not auto-collapse under a
     *  success-sounding header with the only cancellation notice hidden in the
     *  panel. */
    cancelled: phase === 'cancelled',
  };
}

export function getToolMeta(
  part: TMessageContentParts,
  attachmentsByToolCallId?: Record<string, TAttachment[] | undefined>,
): ToolMeta | null {
  if (part.type !== ContentTypes.TOOL_CALL) {
    return null;
  }
  const toolCall = part[ContentTypes.TOOL_CALL];
  if (!toolCall) {
    return null;
  }
  /** Terminal verdict lives on the outer `tool_call` object (`PartMetadata`),
   *  not on the per-variant payload, so it is read before any narrowing cast. */
  const runStepStatus = toolCall.runStepStatus;

  const isStandard =
    'args' in toolCall && (!toolCall.type || toolCall.type === ToolCallTypes.TOOL_CALL);
  if (isStandard) {
    /** `agentId` disambiguates attachments when a handoff response repeats a
     *  provider tool-call id across agents; `filterAttachmentsForPart` reads it
     *  the same way. */
    const tc = toolCall as Agents.ToolCall & { progress?: number; agentId?: string };
    /** Subagents can finish with `progress === 1` and no final output
     *  text (the parent saw "" / undefined back). Fall back to progress
     *  so the group header flips from "Running N agents" to "Ran N
     *  agents" on completion even when the child returned no text. */
    const completed = !!tc.output || tc.progress === 1;
    const name = tc.name ?? '';
    const iconName = isBashProgrammaticToolCall(name, tc.args) ? Tools.bash_tool : name;
    /** Memory tools report failure in prose ("Invalid key ...") that generic
     *  `isError` parsing does not recognize, so `MemoryCall` classifies it with
     *  its own predicate. Reuse that here or a persisted call with no terminal
     *  status shows a failed card inside a group claiming success. */
    const failedOutput =
      name === 'set_memory' || name === 'delete_memory'
        ? isMemoryFailureOutput(name, tc.output ?? '')
        : hasFailedOutput(tc.output);
    /** A backgrounded bash/code task reports its verdict through a
     *  `background_task_status` attachment, not its output: the dispatch step
     *  keeps a benign handle and usually closes as `completed`. The child card
     *  folds that marker in as `extraError`, so without it here the group
     *  reported no failed action beside a card showing failure. Correlated the
     *  same way the child is, since provider tool-call ids repeat across agents
     *  and execution steps in handoff responses. */
    const backgroundHandle = parseBackgroundHandle(tc.output);
    const backgroundStatus = splitBackgroundAttachments(
      filterAttachmentsForPart(attachmentsByToolCallId?.[tc.id ?? ''], tc.agentId, toolCall.stepId),
      tc.id,
    ).backgroundStatus;
    const backgroundFailed = backgroundHandle != null && backgroundStatus === 'error';
    const backgroundCancelled =
      tc.backgroundTask?.cancelled === true ||
      (backgroundHandle != null && backgroundStatus === 'cancelled');
    return {
      name,
      iconName,
      ...resolveOutcome(
        backgroundCancelled ? 'cancelled' : runStepStatus,
        completed,
        failedOutput || backgroundFailed,
      ),
    };
  }

  if (toolCall.type === ToolCallTypes.CODE_INTERPRETER) {
    const ci = (toolCall as { code_interpreter?: { outputs?: unknown[] } }).code_interpreter;
    return {
      name: 'code_interpreter',
      iconName: 'code_interpreter',
      ...resolveOutcome(runStepStatus, (ci?.outputs?.length ?? 0) > 0, false),
    };
  }

  if (toolCall.type === ToolCallTypes.RETRIEVAL || toolCall.type === ToolCallTypes.FILE_SEARCH) {
    const output = (toolCall as { output?: string }).output;
    return {
      name: 'file_search',
      iconName: 'file_search',
      ...resolveOutcome(runStepStatus, !!output, hasFailedOutput(output)),
    };
  }

  if (toolCall.type === ToolCallTypes.FUNCTION && ToolCallTypes.FUNCTION in toolCall) {
    const fn = (toolCall as FunctionToolCall).function;
    return {
      name: fn.name,
      iconName: fn.name,
      ...resolveOutcome(runStepStatus, !!fn.output, hasFailedOutput(fn.output)),
    };
  }

  return null;
}
