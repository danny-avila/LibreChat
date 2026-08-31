import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import {
  TooltipAnchor,
  Button,
  NewChatIcon,
  useMediaQuery,
  HoverCard,
  HoverCardPortal,
  HoverCardContent,
  HoverCardTrigger,
  CircleHelpIcon,
} from '@librechat/client';
import { useQueryClient } from '@tanstack/react-query';
import { LocalStorageKeys, QueryKeys } from 'librechat-data-provider';
import { FileSearch, FolderPlus, RotateCcw, X } from 'lucide-react';
import type { ContextType } from '~/common';
import { ESide } from '~/common';
import { useDocumentTitle, useLocalize } from '~/hooks';
import { useChatContext } from '~/Providers';
import { OpenSidebar } from '~/components/Chat/Menus';
import AddToProjectPopover from '~/components/Projects/AddToProjectPopover';
import type { ProjectDocumentInput } from '~/data-provider/Projects';
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

const DEFAULT_TOP_K = 100;
const DEFAULT_CHUNKS_PER_DOC = 1000;
const PAGE_SIZE = 10;
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
  if (f.library && f.library !== 'all') out.library = f.library;
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
  // BKL: 다중 선택(프로젝트에 담기) — 현재 결과에서 체크된 doc_id 집합
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  // 페이지 이동 시 목록 위로 되돌린다. 스크롤은 window 가 아니라 이 컨테이너다.
  const scrollRef = useRef<HTMLDivElement>(null);

  useDocumentTitle(`${localize('com_nav_document_search')} | ${getAppTitle()}`);

  const search = useDocumentKeywordSearch();

  const runSearch = useCallback(
    (q: string, f: DocumentSearchFilterState) => {
      setQuery(q);
      setSubmittedQuery(q);
      setSelectedDocIds(new Set());
      setCurrentPage(1);
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

  // `?? []` 를 그냥 두면 매 렌더 새 배열이 나와 아래 useMemo 들이 전부
  // 무효화된다. 응답이 바뀔 때만 새 참조가 되도록 고정한다.
  const documents = useMemo(() => search.data?.documents ?? [], [search.data?.documents]);
  const hasQuery = !!submittedQuery;
  const hasResults = documents.length > 0;
  const isSearching = search.isLoading;
  const hasActiveFilters = isFilterActive(filters);
  const canReset = !!query || hasQuery || hasActiveFilters || !!search.data || search.isError;

  // BKL: 다중 선택 파생값 — 선택된 hit 을 프로젝트 담기 입력으로 변환
  const selectableDocIds = useMemo(
    () => documents.filter((d) => d.doc_id).map((d) => d.doc_id),
    [documents],
  );
  const allSelected =
    selectableDocIds.length > 0 && selectableDocIds.every((id) => selectedDocIds.has(id));
  const toggleDocSelection = useCallback((docId: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  }, []);
  const selectedProjectDocs = useMemo<ProjectDocumentInput[]>(() => {
    const collection = localStorage.getItem('bkl_selected_collection');
    return documents
      .filter((d) => d.doc_id && selectedDocIds.has(d.doc_id))
      .map((d) => ({
        doc_id: d.doc_id,
        collection,
        file_name: d.file_name ?? null,
        matter_uid: d.matter_uid ?? null,
        origin: 'doc_search' as const,
      }));
  }, [documents, selectedDocIds]);

  const totalPages = Math.max(1, Math.ceil(documents.length / PAGE_SIZE));
  // 필터 변경 등으로 결과가 줄면 currentPage 가 범위를 벗어날 수 있다.
  // 렌더 중 clamp 해서 빈 페이지가 그려지지 않게 한다.
  const page = Math.min(currentPage, totalPages);
  const pagedDocuments = useMemo(
    () => documents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [documents, page],
  );

  const goToPage = useCallback((next: number) => {
    setCurrentPage(next);
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    // 위로 되돌리는 건 부가 기능이다. scrollTo 가 없는 환경에서 던져
    // 페이지 이동 자체를 막으면 안 된다.
    if (typeof el.scrollTo === 'function') {
      el.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      el.scrollTop = 0;
    }
  }, []);

  // 판정은 truncated 만 본다. total_hit_count 는 서버측 확장자 백스톱·스니펫
  // 필터·ACL 을 거치기 전 근사값이라, 98건을 전부 보여준 경우에도 100 을 넘겨
  // "더 있다" 고 잘못 안내한다. truncated 는 슬라이싱 직전에 잰 정확한 값이다.
  const showLimitNotice = hasResults && search.data?.truncated === true;

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
    setSelectedDocIds(new Set());
    setCurrentPage(1);
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

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
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
              <div className="mt-8 flex items-baseline justify-between gap-3 border-b border-border-light pb-3">
                <p className="flex items-center gap-1.5 text-sm text-text-primary">
                  {resultHeading}
                  {showLimitNotice && <LimitNotice cap={DEFAULT_TOP_K} />}
                </p>
                {hasResults && (
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedDocIds(allSelected ? new Set() : new Set(selectableDocIds))
                    }
                    className="shrink-0 text-xs text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
                  >
                    {/* 현재 페이지가 아니라 결과 전체가 대상이라 건수를 붙인다. */}
                    {allSelected ? '전체 해제' : `전체 선택 (${selectableDocIds.length}건)`}
                  </button>
                )}
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
                <>
                  <ul className="flex flex-col">
                    {pagedDocuments.map((hit) => {
                      const key = hit.doc_id || hit.file_name;
                      return (
                        <li key={key}>
                          <ResultCard
                            hit={hit}
                            query={submittedQuery}
                            isSelected={!!hit.doc_id && selectedDocIds.has(hit.doc_id)}
                            onToggleSelect={
                              hit.doc_id ? () => toggleDocSelection(hit.doc_id) : undefined
                            }
                          />
                        </li>
                      );
                    })}
                  </ul>

                  <Pagination page={page} totalPages={totalPages} onChange={goToPage} />
                </>
              )}
            </div>
          </div>
        </div>

        {/* BKL: 다중 선택 액션 바 — 1건 이상 선택 시 하단 고정 */}
        {selectedProjectDocs.length > 0 && (
          <div className="pointer-events-none absolute bottom-6 left-0 right-0 z-30 flex justify-center px-4">
            <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border-medium bg-surface-primary py-2 pl-4 pr-2 shadow-lg">
              <span className="text-sm text-text-primary">{selectedProjectDocs.length}건 선택</span>
              <AddToProjectPopover
                documents={selectedProjectDocs}
                align="center"
                onAdded={() => setSelectedDocIds(new Set())}
              >
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-submit px-3 text-sm text-white hover:bg-surface-submit-hover"
                >
                  <FolderPlus className="h-4 w-4" aria-hidden="true" />
                  프로젝트에 담기
                </button>
              </AddToProjectPopover>
              <button
                type="button"
                aria-label="선택 해제"
                onClick={() => setSelectedDocIds(new Set())}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

/**
 * 상한에서 잘렸을 때 건수 옆에 붙는 힌트. 배너로 띄우면 결과보다 눈에 띄어
 * 거슬리므로 호버로만 설명을 보여준다.
 *
 * 앱의 다른 인라인 설명(에이전트 설정 등)과 같은 HoverCard + CircleHelpIcon
 * 조합을 쓴다. TooltipAnchor 는 Ariakit 기본 지연(~500ms)이 걸려 호버해도
 * 한참 뒤에 떠서 이 용도에는 맞지 않는다.
 *
 * 문구는 표시 건수가 아니라 "조회 범위"를 말한다 — ACL 이 절단 이후에 돌아
 * 표시 건수가 더 줄어도 거짓이 되지 않아야 한다.
 */
export const LimitNotice: React.FC<{ cap: number }> = ({ cap }) => {
  const localize = useLocalize();
  const message = localize('com_document_search_limit_notice', { 0: String(cap) });
  return (
    <HoverCard openDelay={50}>
      <HoverCardTrigger asChild>
        <span
          role="note"
          tabIndex={0}
          aria-label={message}
          className="inline-flex shrink-0 cursor-help items-center text-text-tertiary hover:text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CircleHelpIcon className="h-4 w-4" aria-hidden="true" />
        </span>
      </HoverCardTrigger>
      <HoverCardPortal>
        <HoverCardContent side={ESide.Bottom} className="w-80">
          <p className="text-sm text-text-secondary">{message}</p>
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCard>
  );
};

export const Pagination: React.FC<{
  page: number;
  totalPages: number;
  onChange: (next: number) => void;
}> = ({ page, totalPages, onChange }) => {
  const localize = useLocalize();
  if (totalPages <= 1) {
    return null;
  }

  const btn =
    'inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-border-light px-2.5 text-xs text-text-secondary transition hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent';

  return (
    <nav
      aria-label={localize('com_document_search_page_nav')}
      className="mt-6 flex items-center justify-center gap-1.5 border-t border-border-light pt-5"
    >
      <button
        type="button"
        className={btn}
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
      >
        {localize('com_document_search_page_prev')}
      </button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          aria-current={n === page ? 'page' : undefined}
          className={
            n === page
              ? 'inline-flex h-8 min-w-8 items-center justify-center rounded-md bg-surface-submit px-2.5 text-xs font-medium text-white'
              : btn
          }
          onClick={() => onChange(n)}
        >
          {n}
        </button>
      ))}
      <button
        type="button"
        className={btn}
        disabled={page === totalPages}
        onClick={() => onChange(page + 1)}
      >
        {localize('com_document_search_page_next')}
      </button>
    </nav>
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
