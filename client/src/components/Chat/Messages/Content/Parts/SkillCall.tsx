import { useMemo } from 'react';
import { ScrollText } from 'lucide-react';
import type { TAttachment } from 'librechat-data-provider';
import ProgressText from '~/components/Chat/Messages/Content/ProgressText';
import useToolCallState from './useToolCallState';
import { AttachmentGroup } from './Attachment';
import parseJsonField from './parseJsonField';
import { useLocalize } from '~/hooks';
import Stdout from './Stdout';
import { cn } from '~/utils';

export default function SkillCall({
  isSubmitting,
  initialProgress = 0.1,
  args,
  output = '',
  attachments,
}: {
  initialProgress: number;
  isSubmitting: boolean;
  args?: string | Record<string, unknown>;
  output?: string;
  attachments?: TAttachment[];
}) {
  const localize = useLocalize();
  const skillName = useMemo(() => parseJsonField(args, 'skillName'), [args]);

  const { showCode, toggleCode, expandStyle, expandRef, progress, cancelled, hasError, hasOutput } =
    useToolCallState(initialProgress, isSubmitting, output, !!skillName);

  return (
    <>
      <div className="relative my-1.5 flex size-5 shrink-0 items-center gap-2.5">
        <ProgressText
          progress={progress}
          onClick={toggleCode}
          inProgressText={localize('com_ui_skill_running', { 0: skillName })}
          finishedText={
            cancelled
              ? localize('com_ui_cancelled')
              : localize('com_ui_skill_finished', { 0: skillName })
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
          hasInput={!!skillName || hasOutput}
          isExpanded={showCode}
          error={cancelled}
        />
      </div>
      <div style={expandStyle}>
        <div className="overflow-hidden" ref={expandRef}>
          {hasOutput && (
            <div className="my-2 overflow-hidden rounded-lg border border-border-light bg-surface-secondary">
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
      {attachments && attachments.length > 0 && <AttachmentGroup attachments={attachments} />}
    </>
  );
}
