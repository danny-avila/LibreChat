import { useMemo } from 'react';
import type { TAttachment, ValidSource, ImageResult } from 'librechat-data-provider';
import { useSearchContext } from '~/Providers';
import { StackedFavicons } from './Sources';
import ProgressText from './ProgressText';
import { useLocalize } from '~/hooks';

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
  const error = typeof output === 'string' && output.toLowerCase().includes('error processing');
  const cancelled = (!isSubmitting && progress < 1) || error === true;

  const { organicSources, topStories } = useMemo(() => {
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
    });

    return { organicSources, topStories, images };
  }, [searchResults]);

  const allSources = useMemo(() => {
    return [...organicSources, ...topStories];
  }, [organicSources, topStories]);

  if (progress === 1 || cancelled) {
    return null;
  }

  const showSources = allSources.length > 0;
  return (
    <>
      <div className="relative my-2.5 flex size-5 shrink-0 items-center gap-2.5">
        {showSources && (
          <div className="mr-2">
            <StackedFavicons sources={allSources} limit={allSources.length} />
          </div>
        )}
        <ProgressText
          progress={progress}
          inProgressText={
            showSources
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
