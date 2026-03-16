import { useState, useMemo, useEffect, useCallback } from 'react';
import { ContentTypes, ToolCallTypes } from 'librechat-data-provider';
import { useRecoilValue } from 'recoil';
import { ChevronDown } from 'lucide-react';
import type { TMessageContentParts, Agents, FunctionToolCall } from 'librechat-data-provider';
import { useLocalize, useExpandCollapse } from '~/hooks';
import { useMCPIconMap } from '~/hooks/MCP';
import type { PartWithIndex } from './ParallelContent';
import { StackedToolIcons, getMCPServerName } from './ToolOutput';
import { cn } from '~/utils';
import store from '~/store';

const FRIENDLY_NAMES: Record<string, string> = {
  execute_code: 'Code',
  run_tools_with_code: 'Code',
  web_search: 'Web Search',
  image_gen_oai: 'Image Generation',
  image_edit_oai: 'Image Edit',
  gemini_image_gen: 'Image Generation',
  file_search: 'File Search',
  code_interpreter: 'Code Analysis',
  retrieval: 'File Search',
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
    return { name: 'code_interpreter', hasOutput: true };
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

  const allCompleted = useMemo(() => {
    return parts.every((p) => {
      const meta = getToolMeta(p.part);
      return meta?.hasOutput === true;
    });
  }, [parts]);

  const toolNames = useMemo(() => {
    return parts.map((p) => {
      const meta = getToolMeta(p.part);
      return meta?.name ?? '';
    });
  }, [parts]);

  const toolNameSummary = useMemo(() => {
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const rawName of toolNames) {
      if (!rawName) {
        continue;
      }
      const serverName = getMCPServerName(rawName);
      const label = serverName || FRIENDLY_NAMES[rawName] || rawName;
      if (!seen.has(label)) {
        seen.add(label);
        labels.push(label);
      }
    }
    if (labels.length <= 3) {
      return labels.join(', ');
    }
    return `${labels.slice(0, 3).join(', ')}, +${labels.length - 3}`;
  }, [toolNames]);

  const autoExpand = useRecoilValue(store.autoExpandTools);
  const autoCollapse = !autoExpand && count >= 2 && allCompleted;
  const [isExpanded, setIsExpanded] = useState(autoExpand || !autoCollapse);
  const expandStyle = useExpandCollapse(isExpanded);

  useEffect(() => {
    if (autoCollapse) {
      setIsExpanded(false);
    }
  }, [autoCollapse]);

  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const hasActiveToolCall = useMemo(() => {
    if (!isSubmitting) {
      return false;
    }
    return parts.some((p) => {
      const meta = getToolMeta(p.part);
      return meta && !meta.hasOutput;
    });
  }, [parts, isSubmitting]);

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
        <div className="overflow-hidden">
          <div className="py-0.5 pl-4">
            {parts.map(({ part, idx }) => renderPart(part, idx, isLast && idx === lastContentIdx))}
          </div>
        </div>
      </div>
    </div>
  );
}
