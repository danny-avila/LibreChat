import { useMemo } from 'react';
import type { TAttachment } from 'librechat-data-provider';
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

  const processedSources = useMemo(() => {
    if (progress === 1) {
      return [];
    }
    if (!searchResults) return [];
    return Object.values(searchResults).flatMap((result) => {
      if (!result) return [];
      return [...(result.organic || []), ...(result.topStories || [])].filter(
        (source) => source.processed === true,
      );
    });
  }, [searchResults, progress]);

  if (progress === 1 || cancelled) {
    return null;
  }

  const showSources = processedSources.length > 0;
  return (
    <>
      <div className="relative my-2.5 flex size-5 shrink-0 items-center gap-2.5">
        {showSources && (
          <div className="mr-2">
            <StackedFavicons sources={processedSources} limit={processedSources.length} />
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
