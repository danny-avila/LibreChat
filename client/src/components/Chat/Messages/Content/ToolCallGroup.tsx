import { useState, useMemo, useEffect, useCallback } from 'react';
import { Constants, ContentTypes, ToolCallTypes } from 'librechat-data-provider';
import { ChevronDown } from 'lucide-react';
import type { TMessageContentParts, Agents, TAttachment } from 'librechat-data-provider';
import { useLocalize, useExpandCollapse } from '~/hooks';
import { useMCPIconMap } from '~/hooks/MCP';
import type { PartWithIndex } from './ParallelContent';
import { StackedToolIcons } from './ToolOutput';
import ToolCall from './ToolCall';
import { cn } from '~/utils';

type AgentToolCallWithMeta = Agents.ToolCall & { progress?: number; id?: string };

function getToolCallData(part: TMessageContentParts): AgentToolCallWithMeta | null {
  if (part.type !== ContentTypes.TOOL_CALL) {
    return null;
  }
  const toolCall = part[ContentTypes.TOOL_CALL];
  if (!toolCall) {
    return null;
  }
  const isStandard =
    'args' in toolCall && (!toolCall.type || toolCall.type === ToolCallTypes.TOOL_CALL);
  if (!isStandard) {
    return null;
  }
  return toolCall as AgentToolCallWithMeta;
}

interface ToolCallGroupProps {
  parts: PartWithIndex[];
  isSubmitting: boolean;
  isLast: boolean;
  attachmentMap: Record<string, TAttachment[] | undefined>;
}

export default function ToolCallGroup({
  parts,
  isSubmitting,
  isLast,
  attachmentMap,
}: ToolCallGroupProps) {
  const localize = useLocalize();
  const mcpIconMap = useMCPIconMap();
  const count = parts.length;

  const allCompleted = useMemo(() => {
    return parts.every((p) => {
      const tc = getToolCallData(p.part);
      return tc?.output != null && tc.output.length > 0;
    });
  }, [parts]);

  const toolNames = useMemo(() => {
    return parts.map((p) => {
      const tc = getToolCallData(p.part);
      return tc?.name ?? '';
    });
  }, [parts]);

  const toolNameSummary = useMemo(() => {
    const names = toolNames
      .map((n) => {
        if (!n) {
          return '';
        }
        const idx = n.indexOf(Constants.mcp_delimiter);
        return idx >= 0 ? n.slice(0, idx) : n;
      })
      .filter(Boolean);
    if (names.length <= 2) {
      return names.join(', ');
    }
    return `${names.slice(0, 2).join(', ')}, ...`;
  }, [toolNames]);

  const autoCollapse = count >= 2 && allCompleted;
  const [isExpanded, setIsExpanded] = useState(!autoCollapse);
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
      const tc = getToolCallData(p.part);
      return tc && (!tc.output || tc.output.length === 0);
    });
  }, [parts, isSubmitting]);

  useEffect(() => {
    if (hasActiveToolCall) {
      setIsExpanded(true);
    }
  }, [hasActiveToolCall]);

  return (
    <div className="mb-2">
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
          <div className="pl-4">
            {parts.map(({ part, idx }) => {
              const toolCall = getToolCallData(part);
              if (!toolCall) {
                return null;
              }
              const toolCallId = toolCall.id ?? '';
              const partAttachments = attachmentMap[toolCallId];

              return (
                <ToolCall
                  key={`group-tool-${idx}`}
                  args={toolCall.args ?? ''}
                  name={toolCall.name || ''}
                  output={toolCall.output ?? ''}
                  initialProgress={toolCall.progress ?? 0.1}
                  isSubmitting={isSubmitting}
                  attachments={partAttachments}
                  auth={toolCall.auth}
                  expires_at={toolCall.expires_at}
                  isLast={isLast && idx === parts[parts.length - 1].idx}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
