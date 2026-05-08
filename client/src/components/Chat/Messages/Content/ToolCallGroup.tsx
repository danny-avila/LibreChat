import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { ChevronDown } from 'lucide-react';
import { ContentTypes, ToolCallTypes } from 'librechat-data-provider';
import type { TMessageContentParts, Agents, FunctionToolCall } from 'librechat-data-provider';
import type { PartWithIndex } from './ParallelContent';
import type { TranslationKeys } from '~/hooks';
import { StackedToolIcons, getMCPServerName } from './ToolOutput';
import { useLocalize, useExpandCollapse } from '~/hooks';
import { useMCPIconMap } from '~/hooks/MCP';
import { cn } from '~/utils';
import store from '~/store';

/** Maps tool names to translation keys — resolved via localize() at render time. */
const FRIENDLY_NAME_KEYS: Record<string, TranslationKeys> = {
  execute_code: 'com_ui_tool_name_code',
  run_tools_with_code: 'com_ui_tool_name_code',
  web_search: 'com_ui_tool_name_web_search',
  image_gen_oai: 'com_ui_tool_name_image_gen',
  image_edit_oai: 'com_ui_tool_name_image_edit',
  gemini_image_gen: 'com_ui_tool_name_image_gen',
  file_search: 'com_ui_tool_name_file_search',
  code_interpreter: 'com_ui_tool_name_code_analysis',
  retrieval: 'com_ui_tool_name_file_search',
};

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
    const tc = toolCall as Agents.ToolCall;
    return { name: tc.name ?? '', hasOutput: !!tc.output };
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

  const toolNameSummary = useMemo(() => {
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const rawName of toolNames) {
      if (!rawName) {
        continue;
      }
      const serverName = getMCPServerName(rawName);
      const nameKey = FRIENDLY_NAME_KEYS[rawName];
      const label = serverName || (nameKey ? localize(nameKey) : rawName);
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
        aria-label={localize('com_ui_used_n_tools', { 0: String(count) })}
      >
        <StackedToolIcons
          toolNames={toolNames}
          mcpIconMap={mcpIconMap}
          maxIcons={4}
          isAnimating={!allCompleted && isSubmitting}
        />
        <span className="tool-status-text font-medium">
          {localize('com_ui_used_n_tools', { 0: String(count) })}
        </span>
        {toolNameSummary && (
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
