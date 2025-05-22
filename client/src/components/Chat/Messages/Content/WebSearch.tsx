import { useMemo } from 'react';
import type { TAttachment } from 'librechat-data-provider';
import { StackedFavicons } from '~/components/Web/Sources';
import { useSearchContext } from '~/Providers';
import ProgressText from './ProgressText';
import { useLocalize } from '~/hooks';

type ProgressKeys =
  | 'com_ui_web_searching'
  | 'com_ui_web_searching_again'
  | 'com_ui_web_search_processing'
  | 'com_ui_web_search_reading';

export default function WebSearch({
  initialProgress: progress = 0.1,
  isSubmitting,
  isLast,
  output,
}: {
  isLast?: boolean;
  isSubmitting: boolean;
  output?: string | null;
  initialProgress: number;
  attachments?: TAttachment[];
}) {
  const localize = useLocalize();
  const { searchResults } = useSearchContext();
  const error = typeof output === 'string' && output.toLowerCase().includes('error processing');
  const cancelled = (!isSubmitting && progress < 1) || error === true;

  const complete = !isLast && progress === 1;
  const finalizing = isSubmitting && isLast && progress === 1;
  const processedSources = useMemo(() => {
    if (complete && !finalizing) {
      return [];
    }
    if (!searchResults) return [];
    const values = Object.values(searchResults);
    const result = values[values.length - 1];
    if (!result) return [];
    if (finalizing) {
      return [...(result.organic || []), ...(result.topStories || [])];
    }
    return [...(result.organic || []), ...(result.topStories || [])].filter(
      (source) => source.processed === true,
    );
  }, [searchResults, complete, finalizing]);
  const turns = useMemo(() => {
    if (!searchResults) return 0;
    return Object.values(searchResults).length;
  }, [searchResults]);

  const clampedProgress = useMemo(() => {
    return Math.min(progress, 0.99);
  }, [progress]);

  const showSources = processedSources.length > 0;
  const progressText = useMemo(() => {
    let text: ProgressKeys = turns > 1 ? 'com_ui_web_searching_again' : 'com_ui_web_searching';
    if (showSources) {
      text = 'com_ui_web_search_processing';
    }
    if (finalizing) {
      text = 'com_ui_web_search_reading';
    }
    return localize(text);
  }, [turns, localize, showSources, finalizing]);

  if (complete || cancelled) {
    return null;
  }
  return (
    <>
      <div className="relative my-2.5 flex size-5 shrink-0 items-center gap-2.5">
        {showSources && (
          <div className="mr-2">
            <StackedFavicons sources={processedSources} start={-5} />
          </div>
        )}
        <ProgressText
          finishedText=""
          hasInput={false}
          error={cancelled}
          isExpanded={false}
          progress={clampedProgress}
          inProgressText={progressText}
        />
      </div>
    </>
  );
}
