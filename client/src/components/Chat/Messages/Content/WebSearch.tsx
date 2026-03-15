import { useMemo, useState, useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { Globe, ChevronDown } from 'lucide-react';
import { Tools } from 'librechat-data-provider';
import type { TAttachment, ValidSource, SearchResultData } from 'librechat-data-provider';
import { FaviconImage, getCleanDomain } from '~/components/Web/SourceHovercard';
import { StackedFavicons } from '~/components/Web/Sources';
import { useSearchContext } from '~/Providers';
import { useLocalize, useExpandCollapse } from '~/hooks';
import cn from '~/utils/cn';
import store from '~/store';

type ProgressKeys =
  | 'com_ui_web_searching'
  | 'com_ui_web_searching_again'
  | 'com_ui_web_search_processing'
  | 'com_ui_web_search_reading';

const MAX_VISIBLE_FAVICONS = 3;

function collectSources(results: Record<string, SearchResultData>): ValidSource[] {
  const sourceMap = new Map<string, ValidSource>();
  for (const result of Object.values(results)) {
    if (!result) {
      continue;
    }
    result.organic?.forEach((s) => {
      if (s.link) {
        sourceMap.set(s.link, s);
      }
    });
    result.topStories?.forEach((s) => {
      if (s.link) {
        sourceMap.set(s.link, s);
      }
    });
  }
  return Array.from(sourceMap.values());
}

function getUniqueDomainSources(sources: ValidSource[], max: number): ValidSource[] {
  const seen = new Set<string>();
  const result: ValidSource[] = [];
  for (const source of sources) {
    const domain = getCleanDomain(source.link);
    if (seen.has(domain)) {
      continue;
    }
    seen.add(domain);
    result.push(source);
    if (result.length >= max) {
      break;
    }
  }
  return result;
}

function SourceFaviconStack({ sources }: { sources: ValidSource[] }) {
  const visible = getUniqueDomainSources(sources, MAX_VISIBLE_FAVICONS);
  return (
    <div className="flex items-center" aria-hidden="true">
      {visible.map((source, i) => (
        <div
          key={source.link}
          className={cn(
            'relative flex items-center justify-center rounded-full border border-border-medium bg-surface-secondary',
            'h-[22px] w-[22px]',
            i > 0 && '-ml-2.5',
          )}
          style={{ zIndex: MAX_VISIBLE_FAVICONS - i }}
        >
          <FaviconImage domain={getCleanDomain(source.link)} className="size-3 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export default function WebSearch({
  initialProgress: progress = 0.1,
  isSubmitting,
  isLast,
  output,
  attachments,
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

  const allSources = useMemo((): ValidSource[] => {
    if (searchResults && Object.keys(searchResults).length > 0) {
      return collectSources(searchResults);
    }
    if (attachments) {
      const turnMap: Record<string, SearchResultData> = {};
      for (const att of attachments) {
        if (att.type === Tools.web_search && att[Tools.web_search]) {
          const data = att[Tools.web_search];
          const key = typeof data.turn === 'number' ? String(data.turn) : '0';
          turnMap[key] = data;
        }
      }
      if (Object.keys(turnMap).length > 0) {
        return collectSources(turnMap);
      }
    }
    return [];
  }, [searchResults, attachments]);

  const processedSources = useMemo(() => {
    if (complete && !finalizing) {
      return [];
    }
    if (!searchResults) {
      return [];
    }
    const values = Object.values(searchResults);
    const result = values[values.length - 1];
    if (!result) {
      return [];
    }
    if (finalizing) {
      return [...(result.organic || []), ...(result.topStories || [])];
    }
    return [...(result.organic || []), ...(result.topStories || [])].filter(
      (source) => source.processed === true,
    );
  }, [searchResults, complete, finalizing]);

  const ownTurn = useMemo(() => {
    if (!attachments) {
      return 0;
    }
    for (const att of attachments) {
      if (att.type === Tools.web_search && att[Tools.web_search]) {
        const turn = att[Tools.web_search].turn;
        return typeof turn === 'number' ? turn : 0;
      }
    }
    return 0;
  }, [attachments]);

  const showSources = processedSources.length > 0;
  const progressText = useMemo(() => {
    let text: ProgressKeys = ownTurn > 0 ? 'com_ui_web_searching_again' : 'com_ui_web_searching';
    if (showSources) {
      text = 'com_ui_web_search_processing';
    }
    if (finalizing) {
      text = 'com_ui_web_search_reading';
    }
    return localize(text);
  }, [ownTurn, localize, showSources, finalizing]);

  const autoExpand = useRecoilValue(store.autoExpandTools);
  const sourceCount = allSources.length;
  const [showSourceList, setShowSourceList] = useState(() => autoExpand && sourceCount > 0);
  const sourceExpandStyle = useExpandCollapse(showSourceList);

  useEffect(() => {
    if (autoExpand && sourceCount > 0) {
      setShowSourceList(true);
    }
  }, [autoExpand, sourceCount]);

  if (cancelled) {
    return null;
  }

  if (complete) {
    const hasSourceData = sourceCount > 0;
    const completedText = localize('com_ui_web_searched');

    return (
      <div className="mb-2">
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {completedText}
        </span>
        <button
          type="button"
          className={cn(
            'tool-status-text group flex items-center gap-2 rounded-full py-1 transition-colors',
            hasSourceData
              ? 'text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy'
              : 'pointer-events-none text-text-secondary',
          )}
          disabled={!hasSourceData}
          onClick={hasSourceData ? () => setShowSourceList((prev) => !prev) : undefined}
          aria-expanded={hasSourceData ? showSourceList : undefined}
          aria-label={
            hasSourceData
              ? `${completedText} - ${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'}`
              : completedText
          }
        >
          {hasSourceData ? (
            <SourceFaviconStack sources={allSources} />
          ) : (
            <Globe className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
          )}
          <span className="font-medium">{completedText}</span>
          {hasSourceData && (
            <ChevronDown
              className={cn(
                'size-3.5 shrink-0 text-text-secondary transition-transform duration-200',
                showSourceList && 'rotate-180',
              )}
              aria-hidden="true"
            />
          )}
        </button>
        {hasSourceData && (
          <div style={sourceExpandStyle}>
            <div className="overflow-hidden">
              <div className="my-2 max-h-[280px] overflow-y-auto rounded-lg border border-border-light">
                {allSources.map((source, i) => {
                  const domain = getCleanDomain(source.link);
                  return (
                    <a
                      key={i}
                      href={source.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-surface-hover',
                        i > 0 && 'border-t border-border-light',
                      )}
                    >
                      <FaviconImage domain={domain} className="size-4 shrink-0 rounded-sm" />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-text-primary">
                        {source.title || domain}
                      </span>
                      <span className="shrink-0 text-[11px] text-text-secondary">{domain}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="my-1 flex items-center gap-2.5">
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {progressText}
      </span>
      {showSources && <StackedFavicons sources={processedSources} start={-5} />}
      <Globe className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
      <span className="tool-status-text shimmer font-medium text-text-secondary">
        {progressText}
      </span>
    </div>
  );
}
