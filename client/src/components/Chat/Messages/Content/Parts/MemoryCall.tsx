import { useMemo } from 'react';
import { Brain } from 'lucide-react';
import type { TAttachment } from 'librechat-data-provider';
import ProgressText from '~/components/Chat/Messages/Content/ProgressText';
import { toolPanelSpacingClassName } from '../disclosure';
import useToolCallState from './useToolCallState';
import { AttachmentGroup } from './Attachment';
import parseJsonField from './parseJsonField';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type MemoryToolName = 'set_memory' | 'delete_memory';

export default function MemoryCall({
  toolName,
  isSubmitting,
  initialProgress = 0.1,
  args,
  output = '',
  attachments,
  hideAttachments = false,
  onExpand,
}: {
  toolName: MemoryToolName;
  initialProgress: number;
  isSubmitting: boolean;
  args?: string | Record<string, unknown>;
  output?: string;
  attachments?: TAttachment[];
  hideAttachments?: boolean;
  onExpand?: () => void;
}) {
  const localize = useLocalize();
  const isSave = toolName === 'set_memory';
  const memoryKey = useMemo(() => parseJsonField(args, 'key'), [args]);
  const memoryValue = useMemo(() => parseJsonField(args, 'value'), [args]);
  const hasPanel = !!memoryKey || !!memoryValue;

  const { showCode, toggleCode, expandStyle, expandRef, progress, cancelled, hasError } =
    useToolCallState(initialProgress, isSubmitting, output, hasPanel, onExpand);

  return (
    <>
      <div className="relative my-1 flex h-5 shrink-0 items-center gap-2.5">
        <ProgressText
          progress={progress}
          onClick={toggleCode}
          inProgressText={localize(isSave ? 'com_ui_memory_saving' : 'com_ui_memory_deleting')}
          finishedText={
            cancelled
              ? localize('com_ui_cancelled')
              : localize(isSave ? 'com_ui_memory_saved' : 'com_ui_memory_removed')
          }
          subtitle={memoryKey || undefined}
          errorSuffix={hasError && !cancelled ? localize('com_ui_tool_failed') : undefined}
          icon={
            <Brain
              className={cn(
                'size-4 shrink-0 text-text-secondary',
                progress < 1 && !cancelled && !hasError && 'animate-pulse',
              )}
              aria-hidden="true"
            />
          }
          hasInput={hasPanel || hasError}
          isExpanded={showCode}
          error={cancelled}
        />
      </div>
      <div style={expandStyle}>
        <div className="overflow-hidden" ref={expandRef}>
          {(hasPanel || hasError) && (
            <div
              className={cn(
                toolPanelSpacingClassName,
                'overflow-hidden rounded-lg border border-border-light bg-surface-secondary p-3',
              )}
            >
              {memoryKey && (
                <div className="mb-1 text-xs font-bold uppercase tracking-wide text-text-secondary">
                  {memoryKey}
                </div>
              )}
              {isSave && memoryValue && (
                <div className="whitespace-pre-wrap text-sm text-text-primary">{memoryValue}</div>
              )}
              {!isSave && (
                <div className="text-sm italic text-text-secondary">
                  {localize('com_ui_memory_deleted')}
                </div>
              )}
              {hasError && (
                <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs text-red-600 dark:text-red-400">
                  {output}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
      {!hideAttachments && attachments && attachments.length > 0 && (
        <AttachmentGroup attachments={attachments} />
      )}
    </>
  );
}
