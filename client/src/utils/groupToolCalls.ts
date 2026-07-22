import { Constants, ContentTypes, ToolCallTypes } from 'librechat-data-provider';
import type { TMessageContentParts, Agents } from 'librechat-data-provider';
import type { PartWithIndex } from '~/components/Chat/Messages/Content/ParallelContent';

export type GroupedPart =
  | { type: 'single'; part: PartWithIndex }
  | { type: 'tool-group'; parts: PartWithIndex[]; labelPart?: PartWithIndex };

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

/**
 * Groups message content for rendering.
 *
 * Activity blocks: reasoning (THINK) parts are absorbed tentatively; when an
 * ACTIVITY_LABEL part terminates the run, the whole block (thinking + tool
 * calls) becomes one labeled group — the claude.ai-style hierarchy. Any
 * other part type breaks the block.
 *
 * Legacy behavior is preserved exactly when no ACTIVITY_LABEL part arrives
 * (feature off, older conversations): the tentative block is re-split so
 * THINK parts render standalone in their original positions and only runs
 * of >= 2 tool calls group.
 */
export function groupSequentialToolCalls(parts: PartWithIndex[]): GroupedPart[] {
  const result: GroupedPart[] = [];
  let currentBlock: PartWithIndex[] = [];

  const flushWithoutLabel = () => {
    let toolRun: PartWithIndex[] = [];
    const flushToolRun = () => {
      if (toolRun.length >= 2) {
        result.push({ type: 'tool-group', parts: [...toolRun] });
      } else {
        for (const p of toolRun) {
          result.push({ type: 'single', part: p });
        }
      }
      toolRun = [];
    };
    for (const p of currentBlock) {
      if (isGroupableToolCall(p.part)) {
        toolRun.push(p);
      } else {
        flushToolRun();
        result.push({ type: 'single', part: p });
      }
    }
    flushToolRun();
    currentBlock = [];
  };

  for (const item of parts) {
    if (isGroupableToolCall(item.part) || item.part.type === ContentTypes.THINK) {
      currentBlock.push(item);
      continue;
    }
    if (item.part.type === ContentTypes.ACTIVITY_LABEL) {
      if (currentBlock.length > 0) {
        result.push({ type: 'tool-group', parts: [...currentBlock], labelPart: item });
        currentBlock = [];
      } else {
        /** Orphan label (block parts hidden/filtered): renders standalone. */
        result.push({ type: 'single', part: item });
      }
      continue;
    }
    flushWithoutLabel();
    result.push({ type: 'single', part: item });
  }
  flushWithoutLabel();

  return result;
}
