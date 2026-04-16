import { useMemo, useState, useEffect, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { ScrollText } from 'lucide-react';
import type { TAttachment } from 'librechat-data-provider';
import ProgressText from '~/components/Chat/Messages/Content/ProgressText';
import { useProgress, useLocalize, useExpandCollapse } from '~/hooks';
import { AttachmentGroup } from './Attachment';
import Stdout from './Stdout';
import { cn } from '~/utils';
import store from '~/store';

interface SkillArgs {
  skill_name?: string;
}

function parseArgs(args?: string | Record<string, unknown>): SkillArgs {
  if (typeof args === 'object' && args !== null) {
    return { skill_name: String(args.skill_name ?? '') };
  }
  try {
    const parsed = JSON.parse(args || '{}');
    if (typeof parsed === 'object') {
      return { skill_name: String(parsed.skill_name ?? '') };
    }
  } catch {
    // fallback
  }
  const match = args?.match(/"skill_name"\s*:\s*"([^"]+)"/);
  return { skill_name: match ? match[1] : '' };
}

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
  const hasOutput = output.length > 0;
  const autoExpand = useRecoilValue(store.autoExpandTools);

  const { skill_name = '' } = useMemo(() => parseArgs(args), [args]);
  const hasContent = !!skill_name || hasOutput;
  const [showDetail, setShowDetail] = useState(() => autoExpand && hasContent);
  const { style: expandStyle, ref: expandRef } = useExpandCollapse(showDetail);

  useEffect(() => {
    if (autoExpand && hasContent) {
      setShowDetail(true);
    }
  }, [autoExpand, hasContent]);
  const progress = useProgress(initialProgress);

  const toggleDetail = useCallback(() => setShowDetail((prev) => !prev), []);

  const cancelled = !isSubmitting && progress < 1;

  return (
    <>
      <div className="relative my-1.5 flex size-5 shrink-0 items-center gap-2.5">
        <ProgressText
          progress={progress}
          onClick={toggleDetail}
          inProgressText={localize('com_ui_skill_running', { 0: skill_name })}
          finishedText={
            cancelled
              ? localize('com_ui_cancelled')
              : localize('com_ui_skill_finished', { 0: skill_name })
          }
          icon={
            <ScrollText
              className={cn(
                'size-4 shrink-0 text-text-secondary',
                progress < 1 && !cancelled && 'animate-pulse',
              )}
              aria-hidden="true"
            />
          }
          hasInput={hasContent}
          isExpanded={showDetail}
          error={cancelled}
        />
      </div>
      <div style={expandStyle}>
        <div className="overflow-hidden" ref={expandRef}>
          <div className="my-2 overflow-hidden rounded-lg border border-border-light bg-surface-secondary">
            {hasOutput && (
              <div className="bg-surface-primary-alt p-4 text-xs dark:bg-transparent">
                <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                  {localize('com_ui_output')}
                </div>
                <div className="max-h-[200px] overflow-auto text-text-primary">
                  <Stdout output={output} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {attachments && attachments.length > 0 && <AttachmentGroup attachments={attachments} />}
    </>
  );
}
