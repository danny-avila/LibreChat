import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { ChevronDown, Users } from 'lucide-react';
import { Constants, ContentTypes, ToolCallTypes } from 'librechat-data-provider';
import type { TMessageContentParts, Agents, FunctionToolCall } from 'librechat-data-provider';
import type { PartWithIndex } from './ParallelContent';
import { StackedToolIcons } from './ToolOutput';
import { useLocalize, useExpandCollapse } from '~/hooks';
import { useMCPIconMap } from '~/hooks/MCP';
import { cn, getToolDisplayLabel } from '~/utils';
import store from '~/store';

interface ToolMeta {
  name: string;
  hasOutput: boolean;
}

function getToolMeta(part: TMessageContentParts): ToolMeta | null {
  if (part.type !== ContentTypes.TOOL_CALL) {
    return null;
  }
  const toolCall = part[ContentTypes.TOOL_CALL];
  if (!toolCall) {
    return null;
  }

  const isStandard =
    'args' in toolCall && (!toolCall.type || toolCall.type === ToolCallTypes.TOOL_CALL);
  if (isStandard) {
    const tc = toolCall as Agents.ToolCall & { progress?: number };
    /** Subagents can finish with `progress === 1` and no final output
     *  text (the parent saw "" / undefined back). Fall back to progress
     *  so the group header flips from "Running N agents" to "Ran N
     *  agents" on completion even when the child returned no text. */
    const completed = !!tc.output || tc.progress === 1;
    return { name: tc.name ?? '', hasOutput: completed };
  }

  if (toolCall.type === ToolCallTypes.CODE_INTERPRETER) {
    const ci = (toolCall as { code_interpreter?: { outputs?: unknown[] } }).code_interpreter;
    return { name: 'code_interpreter', hasOutput: (ci?.outputs?.length ?? 0) > 0 };
  }

  if (toolCall.type === ToolCallTypes.RETRIEVAL || toolCall.type === ToolCallTypes.FILE_SEARCH) {
    return { name: 'file_search', hasOutput: !!(toolCall as { output?: string }).output };
  }

  if (toolCall.type === ToolCallTypes.FUNCTION && ToolCallTypes.FUNCTION in toolCall) {
    const fn = (toolCall as FunctionToolCall).function;
    return { name: fn.name, hasOutput: !!fn.output };
  }

  return null;
}

interface ToolCallGroupProps {
  parts: PartWithIndex[];
  isSubmitting: boolean;
  isLast: boolean;
  renderPart: (part: TMessageContentParts, idx: number, isLastPart: boolean) => React.ReactNode;
  lastContentIdx: number;
}

export default function ToolCallGroup({
  parts,
  isSubmitting,
  isLast,
  renderPart,
  lastContentIdx,
}: ToolCallGroupProps) {
  const localize = useLocalize();
  const mcpIconMap = useMCPIconMap();
  const count = parts.length;

  const toolMetadata = useMemo(() => parts.map((p) => getToolMeta(p.part)), [parts]);
  const allCompleted = useMemo(
    () => toolMetadata.every((m) => m?.hasOutput === true),
    [toolMetadata],
  );
  const toolNames = useMemo(() => toolMetadata.map((m) => m?.name ?? ''), [toolMetadata]);

  /** Subagent tool calls get their own label verb ("Running/Ran N agents")
   *  since "Used N tools" reads oddly when the "tools" are actually child
   *  agents. `subagentCount === count` ⇒ the group is 100% subagents. */
  const subagentCount = useMemo(
    () => toolNames.filter((n) => n === Constants.SUBAGENT).length,
    [toolNames],
  );
  const allSubagents = subagentCount > 0 && subagentCount === count;

  const toolNameSummary = useMemo(() => {
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const rawName of toolNames) {
      if (!rawName) continue;
      const label = getToolDisplayLabel(rawName, localize);
      if (!seen.has(label)) {
        seen.add(label);
        labels.push(label);
      }
    }
    if (labels.length <= 3) {
      return labels.join(', ');
    }
    return `${labels.slice(0, 3).join(', ')}, +${labels.length - 3}`;
  }, [toolNames, localize]);

  const autoExpand = useRecoilValue(store.autoExpandTools);
  const autoCollapse = !autoExpand && count >= 2 && allCompleted;
  const [isExpanded, setIsExpanded] = useState(autoExpand || !autoCollapse);
  const [userOverride, setUserOverride] = useState(false);
  const { style: expandStyle, ref: expandRef } = useExpandCollapse(isExpanded);

  useEffect(() => {
    if (autoCollapse && !userOverride) {
      setIsExpanded(false);
    }
  }, [autoCollapse, userOverride]);

  const handleToggle = useCallback(() => {
    setUserOverride(true);
    setIsExpanded((prev) => !prev);
  }, []);

  const hasActiveToolCall = useMemo(
    () => isSubmitting && toolMetadata.some((m) => m && !m.hasOutput),
    [toolMetadata, isSubmitting],
  );

  useEffect(() => {
    if (hasActiveToolCall) {
      setIsExpanded(true);
    }
  }, [hasActiveToolCall]);

  return (
    <div className="mb-2 mt-1">
      <button
        type="button"
        className="inline-flex w-full items-center gap-2 py-1 text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy"
        onClick={handleToggle}
        aria-expanded={isExpanded}
        aria-label={
          allSubagents
            ? allCompleted
              ? localize('com_ui_ran_n_agents', { 0: String(count) })
              : localize('com_ui_running_n_agents', { 0: String(count) })
            : localize('com_ui_used_n_tools', { 0: String(count) })
        }
      >
        {allSubagents ? (
          /** Subagent groups don't have per-tool icons — StackedToolIcons
           *  falls back to a generic wrench that reads as "tools" rather
           *  than "agents". A single Users glyph matches the individual
           *  subagent card header and keeps the visual language consistent. */
          <div
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center text-text-secondary',
              !allCompleted && isSubmitting && 'animate-pulse text-primary',
            )}
            aria-hidden="true"
          >
            <Users size={14} />
          </div>
        ) : (
          <StackedToolIcons
            toolNames={toolNames}
            mcpIconMap={mcpIconMap}
            maxIcons={4}
            isAnimating={!allCompleted && isSubmitting}
          />
        )}
        <span className="tool-status-text font-medium">
          {allSubagents
            ? allCompleted
              ? localize('com_ui_ran_n_agents', { 0: String(count) })
              : localize('com_ui_running_n_agents', { 0: String(count) })
            : localize('com_ui_used_n_tools', { 0: String(count) })}
        </span>
        {/** Hide the tool-name summary for pure-subagent groups — every
         *   entry deduplicates to the same "subagent" token, which adds
         *   noise without info. Mixed groups keep the summary. */}
        {toolNameSummary && !allSubagents && (
          <span className="text-xs font-normal text-text-secondary">— {toolNameSummary}</span>
        )}
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-text-secondary transition-transform duration-200 ease-out',
            isExpanded && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>
      <div style={expandStyle}>
        <div className="overflow-hidden" ref={expandRef}>
          <div className="py-0.5 pl-4">
            {parts.map(({ part, idx }) => renderPart(part, idx, isLast && idx === lastContentIdx))}
          </div>
        </div>
      </div>
    </div>
  );
}
