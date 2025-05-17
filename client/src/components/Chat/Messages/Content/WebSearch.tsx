import { useMemo } from 'react';
import { TriangleAlert } from 'lucide-react';
import { actionDelimiter, actionDomainSeparator, Constants } from 'librechat-data-provider';
import type { TAttachment, ValidSource, ImageResult } from 'librechat-data-provider';
import { useLocalize, useProgress } from '~/hooks';
import { useSearchContext } from '~/Providers';
import { StackedFavicons } from './Sources';
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
  const { searchResults } = useSearchContext();
  const error =
    typeof output === 'string' && output.toLowerCase().includes('error processing tool');
  const cancelled = (!isSubmitting && progress < 1) || error === true;

  const { organicSources, topStories, images, hasAnswerBox } = useMemo(() => {
    if (!searchResults) {
      return {
        organicSources: [],
        topStories: [],
        images: [],
        hasAnswerBox: false,
      };
    }

    const organicSources: ValidSource[] = [];
    const topStories: ValidSource[] = [];
    const images: ImageResult[] = [];
    let hasAnswerBox = false;

    Object.values(searchResults).forEach((result) => {
      if (!result) return;

      if (result.organic?.length) {
        organicSources.push(...result.organic);
      }
      if (result.references?.length) {
        organicSources.push(...result.references);
      }
      if (result.topStories?.length) {
        topStories.push(...result.topStories);
      }
      if (result.images?.length) {
        images.push(...result.images);
      }
      if (result.answerBox) {
        hasAnswerBox = true;
      }
    });

    return { organicSources, topStories, images, hasAnswerBox };
  }, [searchResults]);

  const allSources = useMemo(() => {
    return [...organicSources, ...topStories];
  }, [organicSources, topStories]);

  if (progress === 1) {
    return null;
  }
  return (
    <>
      <div className="relative my-2.5 flex size-5 shrink-0 items-center gap-2.5">
        {progress === 0.5 && allSources.length > 0 && (
          <div className="mr-2">
            <StackedFavicons sources={allSources} limit={allSources.length} />
          </div>
        )}
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
