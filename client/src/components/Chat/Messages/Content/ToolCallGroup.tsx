import { useState, useMemo, useEffect, useCallback } from 'react';
import { ContentTypes, ToolCallTypes } from 'librechat-data-provider';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { TMessageContentParts, Agents, TAttachment } from 'librechat-data-provider';
import { useLocalize, useExpandCollapse } from '~/hooks';
import type { PartWithIndex } from './ParallelContent';
import { StackedToolIcons } from './ToolOutput';
import ToolCall from './ToolCall';

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

  const autoCollapse = count >= 3 && allCompleted;
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
    <div className="my-1">
      <button
        type="button"
        className="inline-flex w-full items-center gap-2 py-1 text-text-secondary"
        onClick={handleToggle}
        aria-expanded={isExpanded}
        aria-label={localize('com_ui_used_n_tools', { 0: String(count) })}
      >
        <StackedToolIcons toolNames={toolNames} isAnimating={!allCompleted && isSubmitting} />
        <span className="text-sm font-medium">
          {localize('com_ui_used_n_tools', { 0: String(count) })}
        </span>
        {isExpanded ? (
          <ChevronUp className="size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
        )}
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
