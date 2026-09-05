import { useMemo, useState, useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { Tools } from 'librechat-data-provider';
import { Globe, ChevronDown } from 'lucide-react';
import type {
  TAttachment,
  ValidSource,
  SearchResultData,
  PartMetadata,
} from 'librechat-data-provider';
import { FaviconImage, getCleanDomain } from '~/components/Web/SourceHovercard';
import { useLocalize, useExpandCollapse, useLazyCollapseBody } from '~/hooks';
import { StackedFavicons } from '~/components/Web/Sources';
import { useToolCallIntent } from './Parts/intent';
import { useSearchContext } from '~/Providers';
import { ROW_GLYPH_SLOT } from './rows';
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
  args,
  output,
  attachments,
  onExpand,
  runStepStatus,
}: {
  isLast?: boolean;
  isSubmitting: boolean;
  args?: string | Record<string, unknown>;
  output?: string | null;
  initialProgress: number;
  attachments?: TAttachment[];
  onExpand?: () => void;
  runStepStatus?: PartMetadata['runStepStatus'];
}) {
  const localize = useLocalize();
  /** Model-authored live label (web_search carries `intent` natively);
   *  persists as the settled label like the other tool cards. */
  const intent = useToolCallIntent(args);
  const { searchResults } = useSearchContext();
  const error =
    (typeof output === 'string' && output.toLowerCase().includes('error processing')) ||
    runStepStatus === 'failed';
  const isClosed = runStepStatus != null;

  // Server tool calls (srvtoolu_) never receive ON_RUN_STEP_COMPLETED, so progress
  // stays at the default 0.1. Treat the search as complete if attachments have results.
  const hasResults = useMemo(
    () =>
      attachments?.some((att) => att.type === Tools.web_search && att[Tools.web_search]) ?? false,
    [attachments],
  );
  const effectiveProgress = isClosed || (hasResults && !isSubmitting) ? 1 : progress;
  /**
   * `error` folds into this branch deliberately: an errored search has always
   * rendered as nothing (the `cancelled` early-return below), so a step closed
   * as `failed` lands in the same place rather than inventing a failure UI
   * this component has never had — or worse, falling through to the streaming
   * branch and shimmering forever.
   */
  const cancelled = isClosed
    ? runStepStatus === 'cancelled' || error
    : (!isSubmitting && effectiveProgress < 1) || error === true;

  const finalizing = !isClosed && isSubmitting && isLast && effectiveProgress === 1;
  /** A search that is the message's FINAL part stays "finalizing" only while
   *  the submission is live — afterwards it must settle like any other call,
   *  or the completed label (and its settled intent announcement) never
   *  renders and the card shimmers forever. A closed step settles immediately
   *  on its own status instead of waiting for the submission to end. */
  const complete = isClosed
    ? !cancelled
    : effectiveProgress === 1 && !finalizing && (!isLast || !isSubmitting);

  const ownTurn = useMemo((): string => {
    if (!attachments) {
      return '0';
    }
    for (const att of attachments) {
      if (att.type === Tools.web_search && att[Tools.web_search]) {
        const turn = att[Tools.web_search].turn;
        return typeof turn === 'number' ? String(turn) : '0';
      }
    }
    return '0';
  }, [attachments]);

  const allSources = useMemo((): ValidSource[] => {
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
    if (searchResults?.[ownTurn]) {
      return collectSources({ [ownTurn]: searchResults[ownTurn] });
    }
    return [];
  }, [searchResults, attachments, ownTurn]);

  // Show favicons from the raw SERP results immediately rather than waiting for
  // each source to flip to `processed`; the agents scrape barrier would otherwise
  // freeze the stack on "Searching the web" for the slowest scrape's duration.
  const streamingSources = useMemo(() => {
    if (complete && !finalizing) {
      return [];
    }
    const result = searchResults?.[ownTurn];
    if (!result) {
      return [];
    }
    return [...(result.organic || []), ...(result.topStories || [])];
  }, [searchResults, complete, finalizing, ownTurn]);

  const showSources = streamingSources.length > 0;
  /** Stable phase text: the live region must not re-announce the growing
   *  intent on every delta, so it always gets this value while streaming;
   *  the settled intent is announced once via the completed branch. */
  const genericProgressText = useMemo(() => {
    let text: ProgressKeys =
      ownTurn !== '0' ? 'com_ui_web_searching_again' : 'com_ui_web_searching';
    if (showSources) {
      text = 'com_ui_web_search_processing';
    }
    if (finalizing) {
      text = 'com_ui_web_search_reading';
    }
    return localize(text);
  }, [ownTurn, localize, showSources, finalizing]);
  const progressText = intent ?? genericProgressText;

  const autoExpand = useRecoilValue(store.autoExpandTools);
  const sourceCount = allSources.length;
  const [showSourceList, setShowSourceList] = useState(() => autoExpand && sourceCount > 0);
  const { style: sourceExpandStyle, ref: sourceExpandRef } = useExpandCollapse(showSourceList);
  const { shouldRenderBody, mountBody, handleTransitionEnd } = useLazyCollapseBody(showSourceList);

  useEffect(() => {
    if (autoExpand && sourceCount > 0) {
      setShowSourceList(true);
    }
  }, [autoExpand, sourceCount]);

  const handleToggleSources = () => {
    mountBody();
    setShowSourceList((prev) => {
      const next = !prev;
      if (next) {
        onExpand?.();
      }
      return next;
    });
  };

  if (cancelled) {
    return null;
  }

  if (complete) {
    const hasSourceData = sourceCount > 0;
    const completedText = intent ?? localize('com_ui_web_searched');

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
          onClick={hasSourceData ? handleToggleSources : undefined}
          aria-expanded={hasSourceData ? showSourceList : undefined}
          aria-label={
            hasSourceData
              ? `${completedText} - ${localize(sourceCount === 1 ? 'com_ui_web_search_source' : 'com_ui_web_search_sources', { count: sourceCount })}`
              : completedText
          }
        >
          <span className={ROW_GLYPH_SLOT} aria-hidden="true">
            {hasSourceData ? (
              <SourceFaviconStack sources={allSources} />
            ) : (
              <Globe className="size-4 shrink-0 text-text-secondary" />
            )}
          </span>
          <span className="min-w-0 truncate font-medium">{completedText}</span>
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
          <div style={sourceExpandStyle} onTransitionEnd={handleTransitionEnd}>
            <div className="overflow-hidden" ref={sourceExpandRef}>
              {shouldRenderBody && (
                <div className="my-2 max-h-[280px] overflow-y-auto rounded-lg border border-border-light">
                  {allSources.map((source, i) => {
                    const domain = getCleanDomain(source.link);
                    return (
                      <a
                        key={source.link}
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
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="my-1 flex items-center gap-2">
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {genericProgressText}
      </span>
      <span className={ROW_GLYPH_SLOT} aria-hidden="true">
        {showSources && <StackedFavicons sources={streamingSources} start={-5} />}
        <Globe className="size-4 shrink-0 text-text-secondary" />
      </span>
      <span className="tool-status-text shimmer min-w-0 truncate font-medium text-text-secondary">
        {progressText}
      </span>
    </div>
  );
}
