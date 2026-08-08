import { useMemo } from 'react';
import { ScrollText } from 'lucide-react';
import type { TAttachment } from 'librechat-data-provider';
import ProgressText from '~/components/Chat/Messages/Content/ProgressText';
import { toolPanelSpacingClassName } from '../disclosure';
import useToolCallState from './useToolCallState';
import { AttachmentGroup } from './Attachment';
import parseJsonField from './parseJsonField';
import { useToolCallIntent } from './intent';
import { useLocalize } from '~/hooks';
import Stdout from './Stdout';
import { cn } from '~/utils';

export default function SkillCall({
  isSubmitting,
  initialProgress = 0.1,
  args,
  output = '',
  attachments,
  hideAttachments = false,
  onExpand,
}: {
  initialProgress: number;
  isSubmitting: boolean;
  args?: string | Record<string, unknown>;
  output?: string;
  attachments?: TAttachment[];
  hideAttachments?: boolean;
  onExpand?: () => void;
}) {
  const localize = useLocalize();
  const parsedSkillName = useMemo(() => parseJsonField(args, 'skillName'), [args]);
  const skillName = parsedSkillName || localize('com_ui_skill').toLowerCase();
  const intent = useToolCallIntent(args);

  const { showCode, toggleCode, expandStyle, expandRef, progress, cancelled, hasError, hasOutput } =
    useToolCallState(initialProgress, isSubmitting, output, !!parsedSkillName, onExpand);

  return (
    <>
      <div className="relative my-1 flex h-5 shrink-0 items-center gap-2.5">
        <ProgressText
          progress={progress}
          onClick={toggleCode}
          inProgressText={intent ?? localize('com_ui_skill_running', { 0: skillName })}
          finishedText={
            cancelled
              ? localize('com_ui_cancelled')
              : (intent ?? localize('com_ui_skill_finished', { 0: skillName }))
          }
          errorSuffix={hasError && !cancelled ? localize('com_ui_tool_failed') : undefined}
          icon={
            <ScrollText
              className={cn(
                'size-4 shrink-0 text-text-secondary',
                progress < 1 && !cancelled && !hasError && 'animate-pulse',
              )}
              aria-hidden="true"
            />
          }
          hasInput={!!parsedSkillName || hasOutput}
          isExpanded={showCode}
          error={cancelled}
        />
      </div>
      <div style={expandStyle}>
        <div className="overflow-hidden" ref={expandRef}>
          {hasOutput && (
            <div
              className={cn(
                toolPanelSpacingClassName,
                'overflow-hidden rounded-lg border border-border-light bg-surface-secondary',
              )}
            >
              <div className="bg-surface-primary-alt p-4 text-xs dark:bg-transparent">
                <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                  {localize('com_ui_output')}
                </div>
                <div className="max-h-[200px] overflow-auto text-text-primary">
                  <Stdout output={output} />
                </div>
              </div>
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
