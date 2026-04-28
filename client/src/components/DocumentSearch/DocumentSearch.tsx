import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { TooltipAnchor, Button, NewChatIcon, useMediaQuery } from '@librechat/client';
import { useQueryClient } from '@tanstack/react-query';
import { LocalStorageKeys, QueryKeys } from 'librechat-data-provider';
import { FileSearch, RotateCcw } from 'lucide-react';
import type { ContextType } from '~/common';
import { useDocumentTitle, useLocalize } from '~/hooks';
import { useChatContext } from '~/Providers';
import { OpenSidebar } from '~/components/Chat/Menus';
import {
  useDocumentKeywordSearch,
  type KeywordSearchFilters,
} from '~/data-provider/DocumentSearch';
import { clearMessagesCache } from '~/utils';
import SearchBar from './SearchBar';
import ResultCard from './ResultCard';
import FilterBar, {
  EMPTY_DOC_FILTERS,
  isFilterActive,
  resolvePeriodRange,
  type DocumentSearchFilterState,
} from './FilterBar';

const DEFAULT_TOP_K = 50;
const DEFAULT_CHUNKS_PER_DOC = 1000;
const DEFAULT_APP_TITLE = 'BKL DB AI';

function getAppTitle(): string {
  return localStorage.getItem(LocalStorageKeys.APP_TITLE) || DEFAULT_APP_TITLE;
}

function toApiFilters(f: DocumentSearchFilterState): KeywordSearchFilters | undefined {
  const { from, to } = resolvePeriodRange(f);
  const out: KeywordSearchFilters = {};
  if (from) out.date_from = from;
  if (to) out.date_to = to;
  if (f.extensionGroups.length) out.extension_groups = f.extensionGroups;
  return Object.keys(out).length ? out : undefined;
}

const DocumentSearch: React.FC = () => {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { conversation, newConversation } = useChatContext();
  const { navVisible, setNavVisible } = useOutletContext<ContextType>();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  const queryFromUrl = searchParams.get('q') || '';
  const [query, setQuery] = useState(queryFromUrl);
  const [submittedQuery, setSubmittedQuery] = useState(queryFromUrl);
  const [filters, setFilters] = useState<DocumentSearchFilterState>(EMPTY_DOC_FILTERS);

  useDocumentTitle(`${localize('com_nav_document_search')} | ${getAppTitle()}`);

  const search = useDocumentKeywordSearch();

  const runSearch = useCallback(
    (q: string, f: DocumentSearchFilterState) => {
      setQuery(q);
      setSubmittedQuery(q);
      const next = new URLSearchParams(searchParams);
      if (q) next.set('q', q);
      else next.delete('q');
      setSearchParams(next);
      if (q) {
        search.mutate({
          query: q,
          top_k: DEFAULT_TOP_K,
          chunks_per_doc: DEFAULT_CHUNKS_PER_DOC,
          filters: toApiFilters(f),
        });
      } else {
        search.reset();
      }
    },
    [search, searchParams, setSearchParams],
  );

  useEffect(() => {
    if (queryFromUrl && !search.data && !search.isLoading && !search.isError) {
      runSearch(queryFromUrl, filters);
    }
    // only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const documents = search.data?.documents ?? [];
  const hasQuery = !!submittedQuery;
  const hasResults = documents.length > 0;
  const isSearching = search.isLoading;
  const hasActiveFilters = isFilterActive(filters);
  const canReset = !!query || hasQuery || hasActiveFilters || !!search.data || search.isError;

  const resultHeading = useMemo(() => {
    if (!hasQuery) return null;
    if (isSearching) return localize('com_document_search_searching');
    return localize('com_document_search_result_heading', {
      0: submittedQuery,
      1: String(search.data?.total ?? 0),
    });
  }, [hasQuery, submittedQuery, search.data?.total, isSearching, localize]);

  const handleNewChat = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.button === 0 && (e.ctrlKey || e.metaKey)) {
      window.open('/c/new', '_blank');
      return;
    }
    clearMessagesCache(queryClient, conversation?.conversationId);
    queryClient.invalidateQueries([QueryKeys.messages]);
    newConversation();
  };

  const showTopBar = !isSmallScreen && !navVisible;

  const handleFiltersChange = useCallback(
    (next: DocumentSearchFilterState) => {
      setFilters(next);
      if (submittedQuery) runSearch(submittedQuery, next);
    },
    [submittedQuery, runSearch],
  );

  const handleResetSearch = useCallback(() => {
    setQuery('');
    setSubmittedQuery('');
    setFilters(EMPTY_DOC_FILTERS);
    setSearchParams(new URLSearchParams(), { replace: true });
    search.reset();
  }, [search, setSearchParams]);

  return (
    <div className="relative flex w-full grow overflow-hidden bg-presentation">
      <main className="flex h-full w-full flex-col overflow-hidden" role="main">
        {showTopBar && (
          <div className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-border-light bg-presentation px-3">
            <OpenSidebar setNavVisible={setNavVisible} />
            <TooltipAnchor
              description={localize('com_ui_new_chat')}
              render={
                <Button
                  size="icon"
                  variant="outline"
                  data-testid="document-search-new-chat-button"
                  aria-label={localize('com_ui_new_chat')}
                  className="rounded-xl border border-border-light bg-surface-secondary p-2 hover:bg-surface-active-alt"
                  onClick={handleNewChat}
                >
                  <NewChatIcon />
                </Button>
              }
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-4xl px-6 py-8 sm:px-10 sm:py-10 md:px-12 md:py-12">
            {/* Header */}
            <div className="mb-6 flex items-center gap-2 text-text-primary">
              <FileSearch className="h-5 w-5 text-text-secondary" aria-hidden="true" />
              <h1 className="text-xl font-semibold tracking-tight">
                {localize('com_nav_document_search')}
              </h1>
            </div>

            {/* Search bar */}
            <SearchBar
              value={query}
              onSubmit={(q) => runSearch(q, filters)}
              isLoading={isSearching}
            />

            {/* Inline filter bar */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <FilterBar
                value={filters}
                onChange={handleFiltersChange}
                disabled={isSearching && !hasResults}
              />
              {canReset && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-1.5 rounded-full px-3 text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                  onClick={handleResetSearch}
                  disabled={isSearching && !hasResults}
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  {localize('com_ui_reset')}
                </Button>
              )}
            </div>

            {/* Result heading */}
            {hasQuery && (
              <div className="mt-8 flex items-baseline justify-between border-b border-border-light pb-3">
                <p className="text-sm text-text-primary">{resultHeading}</p>
              </div>
            )}

            {/* Body */}
            <div className="mt-2">
              {!hasQuery && !isSearching && (
                <SearchHintPanel
                  icon={<FileSearch className="h-10 w-10 opacity-40" aria-hidden="true" />}
                  title={localize('com_document_search_hint_title')}
                  message={localize('com_document_search_hint')}
                  tipsHeading={localize('com_document_search_tips_heading')}
                  onPickExample={(example) => setQuery(example)}
                />
              )}

              {search.isError && (
                <div className="mt-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                  {search.error?.message ?? localize('com_document_search_error')}
                </div>
              )}

              {hasQuery && search.data && !hasResults && !isSearching && (
                <EmptyState
                  icon={<FileSearch className="h-10 w-10 opacity-40" aria-hidden="true" />}
                  title={localize('com_document_search_empty_title')}
                  message={localize('com_document_search_empty')}
                />
              )}

              {hasResults && (
                <ul className="flex flex-col">
                  {documents.map((hit) => {
                    const key = hit.doc_id || hit.file_name;
                    return (
                      <li key={key}>
                        <ResultCard hit={hit} query={submittedQuery} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  message: string;
}> = ({ icon, title, message }) => (
  <div className="flex w-full flex-col items-center justify-center gap-3 py-20 text-center">
    <div className="text-text-secondary">{icon}</div>
    <p className="text-sm font-medium text-text-primary">{title}</p>
    <p className="max-w-md text-xs text-text-secondary">{message}</p>
  </div>
);

type SearchTip = {
  example: string;
  descKey:
    | 'com_document_search_tip_and_desc'
    | 'com_document_search_tip_comma_desc'
    | 'com_document_search_tip_phrase_desc'
    | 'com_document_search_tip_exclude_desc'
    | 'com_document_search_tip_or_desc'
    | 'com_document_search_tip_proximity_desc';
};

const SEARCH_TIPS: SearchTip[] = [
  { example: '세종텔레콤 알뜰폰', descKey: 'com_document_search_tip_and_desc' },
  { example: '세종텔레콤, 아이즈비전', descKey: 'com_document_search_tip_comma_desc' },
  { example: '"주주간 계약 해지"', descKey: 'com_document_search_tip_phrase_desc' },
  { example: '주식매매 -우선주', descKey: 'com_document_search_tip_exclude_desc' },
  { example: '합병 | 분할', descKey: 'com_document_search_tip_or_desc' },
  { example: '"신탁 위반"~5', descKey: 'com_document_search_tip_proximity_desc' },
];

// 설명 문자열 안의 백틱(`...`)을 <code> 엘리먼트로 렌더링한다.
const renderDesc = (text: string): React.ReactNode => {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={idx}
          className="rounded bg-surface-tertiary px-1 py-0.5 font-mono text-[11px] text-text-primary"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
};

const SearchHintPanel: React.FC<{
  icon: React.ReactNode;
  title: string;
  message: string;
  tipsHeading: string;
  onPickExample: (example: string) => void;
}> = ({ icon, title, message, tipsHeading, onPickExample }) => {
  const localize = useLocalize();
  return (
    <div className="flex w-full flex-col items-center gap-6 py-14">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="text-text-secondary">{icon}</div>
        <p className="text-sm font-medium text-text-primary">{title}</p>
        <p className="max-w-md text-xs leading-relaxed text-text-secondary">{message}</p>
      </div>

      <section
        aria-label={tipsHeading}
        className="bg-surface-primary-alt/40 w-full max-w-3xl rounded-xl border border-border-light p-5"
      >
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
          {tipsHeading}
        </p>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SEARCH_TIPS.map((tip) => (
            <li key={tip.example}>
              <button
                type="button"
                onClick={() => onPickExample(tip.example)}
                className="group flex w-full flex-col gap-1.5 rounded-lg border border-border-light bg-surface-primary px-3 py-2.5 text-left transition hover:border-border-medium hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <code className="inline-block max-w-full truncate rounded bg-surface-tertiary px-2 py-1 font-mono text-xs text-text-primary">
                  {tip.example}
                </code>
                <span className="text-xs leading-relaxed text-text-secondary">
                  {renderDesc(localize(tip.descKey))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export default DocumentSearch;
