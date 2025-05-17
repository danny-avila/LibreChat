import { useMemo, useState, useEffect, useRef, useLayoutEffect } from 'react';
import { TriangleAlert } from 'lucide-react';
import { actionDelimiter, actionDomainSeparator, Constants } from 'librechat-data-provider';
import type { TAttachment } from 'librechat-data-provider';
import { useLocalize, useProgress } from '~/hooks';
import { AttachmentGroup } from './Parts';
import ToolCallInfo from './ToolCallInfo';
import ProgressText from './ProgressText';
import { Button } from '~/components';
import { logger, cn } from '~/utils';

export default function WebSearch({
  initialProgress: progress = 0.1,
  isSubmitting,
  output,
}: {
  isSubmitting: boolean;
  output?: string | null;
  initialProgress: number;
  attachments?: TAttachment[];
}) {
  const localize = useLocalize();
  const error =
    typeof output === 'string' && output.toLowerCase().includes('error processing tool');
  const cancelled = (!isSubmitting && progress < 1) || error === true;

  if (progress === 1) {
    return null;
  }
  return (
    <>
      <div className="relative my-2.5 flex size-5 shrink-0 items-center gap-2.5">
        <ProgressText
          progress={progress}
          inProgressText={
            progress === 0.5
              ? localize('com_ui_web_search_processing')
              : localize('com_ui_web_searching')
          }
          isExpanded={false}
          error={cancelled}
          finishedText=""
        />
      </div>
    </>
  );
}
