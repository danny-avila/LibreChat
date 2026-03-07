import { Tools, Constants, ContentTypes, ToolCallTypes } from 'librechat-data-provider';
import type { TMessageContentParts, Agents } from 'librechat-data-provider';
import type { PartWithIndex } from '~/components/Chat/Messages/Content/ParallelContent';

export type GroupedPart =
  | { type: 'single'; part: PartWithIndex }
  | { type: 'tool-group'; parts: PartWithIndex[] };

const SPECIAL_TOOL_NAMES = new Set([
  Tools.execute_code,
  Constants.PROGRAMMATIC_TOOL_CALLING,
  Tools.web_search,
  'image_gen_oai',
  'image_edit_oai',
  'gemini_image_gen',
]);

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
  if (!isStandardToolCall) {
    return false;
  }
  if (SPECIAL_TOOL_NAMES.has(toolCall.name ?? '')) {
    return false;
  }
  if (toolCall.name?.startsWith(Constants.LC_TRANSFER_TO_)) {
    return false;
  }
  return true;
}

export function groupSequentialToolCalls(parts: PartWithIndex[]): GroupedPart[] {
  const result: GroupedPart[] = [];
  let currentGroup: PartWithIndex[] = [];

  const flushGroup = () => {
    if (currentGroup.length >= 2) {
      result.push({ type: 'tool-group', parts: [...currentGroup] });
    } else {
      for (const p of currentGroup) {
        result.push({ type: 'single', part: p });
      }
    }
    currentGroup = [];
  };

  for (const item of parts) {
    if (isGroupableToolCall(item.part)) {
      currentGroup.push(item);
    } else {
      flushGroup();
      result.push({ type: 'single', part: item });
    }
  }
  flushGroup();

  return result;
}
