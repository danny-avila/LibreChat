import { Constants, ContentTypes, ToolCallTypes } from 'librechat-data-provider';
import type { TMessageContentParts, Agents } from 'librechat-data-provider';
import type { PartWithIndex } from '~/components/Chat/Messages/Content/ParallelContent';
import { getActivityLabelPart, getActivityLabelText } from '~/utils/activityLabels';

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
 * True when the label covers ANY `transfer_to_*` handoff call. Transfer
 * parts are never groupable, so the flush at the handoff card leaves such a
 * label with nothing to head — it can only orphan into a stray line after
 * cards that already show everything (the handoff card names the
 * destination; mixed batches keep their tool cards). Content persisted
 * before the server stopped claiming labels for handoff batches still
 * carries these; they are dropped at render.
 */
function coversTransferCall(labelPart: TMessageContentParts, allParts: PartWithIndex[]): boolean {
  const ids = (labelPart as { tool_call_ids?: unknown }).tool_call_ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return false;
  }
  return ids.some((id) =>
    allParts.some(({ part }) => {
      if (part?.type !== ContentTypes.TOOL_CALL) {
        return false;
      }
      const toolCall = part[ContentTypes.TOOL_CALL] as Agents.ToolCall | undefined;
      return toolCall?.id === id && toolCall?.name?.startsWith(Constants.LC_TRANSFER_TO_) === true;
    }),
  );
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
  /** Position in `currentBlock` just past the most recent BLANK label. A
   *  filled label may only claim parts after it (its own batch); everything
   *  before it belongs to earlier batches whose labels stayed empty. */
  let claimStart = 0;

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
    claimStart = 0;
  };

  for (const item of parts) {
    if (isGroupableToolCall(item.part) || item.part.type === ContentTypes.THINK) {
      currentBlock.push(item);
      continue;
    }
    if (item.part.type === ContentTypes.ACTIVITY_LABEL) {
      const hasText = getActivityLabelText(getActivityLabelPart(item.part)).length > 0;
      if (!hasText) {
        /** A reserved-but-unfilled slot (and a failed/blank fill) must be
         *  INVISIBLE. Every batch now publishes its reservation immediately,
         *  so forming a group here would wrap even a single tool call and pull
         *  THINK parts inside it while generation is still pending. It cannot
         *  flush either: two consecutive single-call batches would then render
         *  as two standalone cards where the feature-off path merges them into
         *  one legacy group. It only marks the claim boundary, so the block
         *  keeps accumulating for legacy merging while a later filled label
         *  still cannot reach back into this batch. */
        claimStart = currentBlock.length;
        continue;
      }
      const claimed = currentBlock.slice(claimStart);
      /** Earlier blank-labeled batches render legacy-style, in order, before
       *  this label's group. */
      currentBlock = currentBlock.slice(0, claimStart);
      flushWithoutLabel();
      if (claimed.length > 0) {
        result.push({ type: 'tool-group', parts: claimed, labelPart: item });
      } else if (!coversTransferCall(item.part, parts)) {
        /** Orphan label (block parts hidden/filtered): renders standalone —
         *  UNLESS its batch contained a handoff call, where the cards
         *  already say everything and the label would be a stray line. */
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
