import { Constants, ContentTypes, ToolCallTypes } from 'librechat-data-provider';
import type { TMessageContentParts, Agents } from 'librechat-data-provider';
import type { PartWithIndex } from '~/components/Chat/Messages/Content/ParallelContent';

export type GroupedPart =
  | { type: 'single'; part: PartWithIndex }
  | { type: 'tool-group'; parts: PartWithIndex[] };

function isGroupableToolCall(part: TMessageContentParts): boolean {
  if (part.type !== ContentTypes.TOOL_CALL) {
    return false;
  }
  const toolCall = part[ContentTypes.TOOL_CALL] as Agents.ToolCall | undefined;
  if (!toolCall) {
    return false;
  }
  const isStandardToolCall =
    'args' in toolCall && (!toolCall.type || toolCall.type === ToolCallTypes.TOOL_CALL);
  if (isStandardToolCall && toolCall.name?.startsWith(Constants.LC_TRANSFER_TO_)) {
    return false;
  }
  return true;
}

/** Reasoning ("Thoughts") parts are transparent to grouping: a thought
 *  interleaved between tool calls joins the run instead of splitting it, so
 *  reasoning models that think between every call still collapse into a single
 *  tool group. A run becomes a group once it holds ≥2 tool calls, OR a single
 *  tool call accompanied by reasoning — so a lone tool wrapped in thinking
 *  (e.g. a skill invocation) still gets the grouped chrome with its thoughts
 *  folded in. A run of pure reasoning (no tool call) keeps rendering as its own
 *  standalone card. */
function isReasoningPart(part: TMessageContentParts): boolean {
  return part.type === ContentTypes.THINK;
}

function countToolCalls(parts: PartWithIndex[]): number {
  let count = 0;
  for (const { part } of parts) {
    if (isGroupableToolCall(part)) {
      count += 1;
    }
  }
  return count;
}

export function groupSequentialToolCalls(parts: PartWithIndex[]): GroupedPart[] {
  const result: GroupedPart[] = [];
  let currentRun: PartWithIndex[] = [];

  const flushRun = () => {
    const toolCallCount = countToolCalls(currentRun);
    const hasReasoning = currentRun.some((p) => isReasoningPart(p.part));
    if (toolCallCount >= 2 || (toolCallCount >= 1 && hasReasoning)) {
      result.push({ type: 'tool-group', parts: [...currentRun] });
    } else {
      for (const p of currentRun) {
        result.push({ type: 'single', part: p });
      }
    }
    currentRun = [];
  };

  for (const item of parts) {
    if (isGroupableToolCall(item.part) || isReasoningPart(item.part)) {
      currentRun.push(item);
    } else {
      flushRun();
      result.push({ type: 'single', part: item });
    }
  }
  flushRun();

  return result;
}
