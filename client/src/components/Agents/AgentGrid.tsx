import React, { useMemo, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import { Spinner } from '@librechat/client';
import { PermissionBits } from 'librechat-data-provider';
import type t from 'librechat-data-provider';
import type { ApiError } from './ErrorDisplay';
import { useMarketplaceAgentsInfiniteQuery } from '~/data-provider/Agents';
import { useAgentCategories, useLocalize, TranslationKeys } from '~/hooks';
import VirtualizedAgentGrid from './VirtualizedAgentGrid';
import GridSkeleton from './GridSkeleton';
import ErrorDisplay from './ErrorDisplay';

interface AgentGridProps {
  category: string;
  searchQuery: string;
  onSelectAgent?: (agent: t.Agent) => void;
  scrollElementRef: React.RefObject<HTMLElement>;
  /** Sort mode applied to the marketplace list; server defaults to 'newest' when omitted. */
  sort?: t.AgentSortOption;
  /** When 1, restrict the list to agents authored by the current user. */
  mine?: 0 | 1;
}

/**
 * Component for displaying a grid of agent cards
 */
const AgentGrid: React.FC<AgentGridProps> = ({
  category,
  searchQuery,
  onSelectAgent,
  scrollElementRef,
  sort,
  mine,
}) => {
  const localize = useLocalize();

  // Get category data from API
  const { categories } = useAgentCategories();

  // Build query parameters based on current state. Keep this aligned with the
  // shared request type so additions to the API contract are checked here.
  const queryParams = useMemo<t.AgentListParams>(() => {
    const params: t.AgentListParams = {
      requiredPermission: PermissionBits.VIEW,
      limit: 32,
    };

    if (searchQuery) {
      params.search = searchQuery;
      if (category !== 'all' && category !== 'promoted') {
        params.category = category;
      }
    } else if (category === 'promoted') {
      params.promoted = 1;
    } else if (category !== 'all') {
      params.category = category;
    }

    /* Sent even when it is the picker's default: `GET /api/agents` answers a request that
       names no mode in most-recently-edited order, which is what the agent selector and
       the mention menu rely on, so the marketplace has to ask for creation order. */
    params.sort = sort ?? 'newest';
    if (mine === 1) {
      params.mine = mine;
    }

    return params;
  }, [category, searchQuery, sort, mine]);

  // Use infinite query for marketplace agents
  const {
    data,
    dataUpdatedAt,
    isLoading,
    error,
    isFetching,
    fetchNextPage,
    hasNextPage,
    refetch,
    isFetchingNextPage,
    isPreviousData,
  } = useMarketplaceAgentsInfiniteQuery(queryParams);

  // Deduplicate as pages are traversed rather than creating a second flattened
  // collection first. This preserves page order while handling popular-sort
  // drift at a page boundary.
  const currentAgents = useMemo(() => {
    if (!data?.pages) return [];
    const seenIds = new Set<string>();
    const agents: t.Agent[] = [];
    for (const page of data.pages) {
      for (const agent of page.data || []) {
        if (!seenIds.has(agent.id)) {
          seenIds.add(agent.id);
          agents.push(agent);
        }
      }
    }
    return agents;
  }, [data?.pages]);

  const hasData = currentAgents.length > 0;
  const scopeKey = useMemo(() => JSON.stringify(queryParams), [queryParams]);
  /**
   * react-query drops `error` for the duration of a retry, so rendering straight off it
   * would swap the error state for a skeleton on every attempt — remounting the card and
   * resetting its backoff, which turned the automatic recovery into an endless
   * two-second poll. Hold the failure until the request it describes has actually
   * succeeded, and forget it when the query scope changes.
   *
   * Which event counts as "succeeded" depends on what failed, so the kind of the fetch
   * in flight is recorded with the failure. A cursor page is not in the cache, so
   * refreshing the loaded prefix can succeed without ever fetching it: only a longer
   * list means that page arrived, and only `fetchNextPage` asks for it again. A first
   * load or a refresh of the pages already held is the opposite case: the page count
   * does not change, so `dataUpdatedAt` is the signal and `refetch` is the retry.
   */
  const inFlightKindRef = useRef<'next-page' | 'refresh'>('refresh');
  if (isFetching) {
    inFlightKindRef.current = isFetchingNextPage ? 'next-page' : 'refresh';
  }
  const failureRef = useRef<{
    scope: string;
    error: unknown;
    at: number;
    pages: number;
    kind: 'next-page' | 'refresh';
  } | null>(null);
  if (error) {
    failureRef.current = {
      scope: scopeKey,
      error,
      at: dataUpdatedAt,
      pages: data?.pages.length ?? 0,
      kind: inFlightKindRef.current,
    };
  } else if (data && failureRef.current != null) {
    const held = failureRef.current;
    const recovered =
      held.kind === 'next-page' && held.pages > 0
        ? data.pages.length > held.pages
        : dataUpdatedAt !== held.at;
    if (recovered) {
      failureRef.current = null;
    }
  }
  const heldFailure = failureRef.current?.scope === scopeKey ? failureRef.current : null;
  const failure = heldFailure?.error ?? null;
  const isPendingResults = isPreviousData || (!hasData && (isLoading || isFetching || hasNextPage));
  useLayoutEffect(() => {
    if (isPendingResults && scrollElementRef.current) {
      scrollElementRef.current.scrollTop = 0;
    }
  }, [isPendingResults, scopeKey, scrollElementRef]);
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetching) {
      void fetchNextPage({ cancelRefetch: false });
    }
  }, [fetchNextPage, hasNextPage, isFetching]);

  // An empty cursor page can occur when its selected agents change during the request.
  useEffect(() => {
    if (data && !hasData && hasNextPage && !isFetching && !error) {
      loadMore();
    }
  }, [data, hasData, hasNextPage, isFetching, error, loadMore]);

  /**
   * Get category display name from API data or use fallback
   */
  const getCategoryDisplayName = (categoryValue: string) => {
    const categoryData = categories.find((cat) => cat.value === categoryValue);
    if (categoryData) {
      return categoryData.label?.startsWith('com_')
        ? localize(categoryData.label as TranslationKeys)
        : categoryData.label;
    }

    if (categoryValue === 'promoted') {
      return localize('com_agents_top_picks');
    }
    if (categoryValue === 'all') {
      return localize('com_agents_all_category');
    }

    return categoryValue.charAt(0).toUpperCase() + categoryValue.slice(1);
  };

  /**
   * Search is the most specific empty state. Mine is account-wide only for
   * "all"; category-scoped mine results use the existing category translation.
   */
  const getEmptyStateHeading = (): { key: TranslationKeys; values?: Record<string, string> } => {
    if (searchQuery) {
      return { key: 'com_agents_search_empty_heading' };
    }
    if (mine && category === 'all') {
      return { key: 'com_agents_mine_empty_state_heading' };
    }
    if (category !== 'all') {
      return {
        key: 'com_agents_category_empty',
        values: { category: getCategoryDisplayName(category) },
      };
    }
    return { key: 'com_agents_empty_state_heading' };
  };
  const emptyState = getEmptyStateHeading();

  const loadingSkeleton = isPendingResults ? (
    <GridSkeleton scrollElementRef={scrollElementRef} label={localize('com_agents_loading')} />
  ) : null;

  /**
   * What the grid shows instead of the list. Rendered inside the grid rather than in
   * place of it: the grid owns the detail dialog and the element focus returns to, so
   * swapping it out for a failure or an empty result would tear an open dialog down
   * mid-flight and leave keyboard focus on a detached card.
   */
  let listPlaceholder: React.ReactNode = null;
  if (failure) {
    listPlaceholder = (
      <ErrorDisplay
        error={(failure as ApiError) || 'Unknown error occurred'}
        /* A cursor page that failed is not in the cache, so `refetch` would refresh the
           prefix that already succeeded and leave it missing. Retry the page the failure
           was waiting for. `cancelRefetch: false` so a click, the card's backoff and the
           query's own reconnect refetch coalesce into one request instead of each
           restarting the previous one. */
        onRetry={() =>
          void (heldFailure?.kind === 'next-page' && heldFailure.pages > 0
            ? fetchNextPage({ cancelRefetch: false })
            : refetch({ cancelRefetch: false }))
        }
        isRetrying={isFetching}
        context={{
          searchQuery,
          category,
        }}
      />
    );
  } else if (!hasData) {
    listPlaceholder = (
      <div
        className="py-12 text-center text-text-secondary"
        role="status"
        aria-live="polite"
        aria-label={localize(emptyState.key, emptyState.values)}
      >
        <h3 className="mb-2 text-lg font-medium">{localize(emptyState.key, emptyState.values)}</h3>
      </div>
    );
  }

  // Main content component with proper semantic structure
  const mainContent = (
    <div
      className="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-text-primary"
      role="tabpanel"
      id={`category-panel-${category}`}
      aria-labelledby={`category-tab-${category}`}
      aria-busy={isPendingResults || (isFetching && !isFetchingNextPage)}
      tabIndex={isPendingResults ? 0 : undefined}
    >
      {loadingSkeleton}
      {(!isPendingResults || failure) && (
        <>
          {hasData && !failure && (
            <div
              id="search-results-count"
              className="sr-only"
              aria-live="polite"
              aria-atomic="true"
            >
              {localize('com_agents_grid_announcement', {
                count: currentAgents?.length || 0,
                category: getCategoryDisplayName(category),
              })}
            </div>
          )}

          <VirtualizedAgentGrid
            key={scopeKey}
            agents={currentAgents}
            scrollElementRef={scrollElementRef}
            label={localize('com_agents_grid_announcement', {
              count: currentAgents.length,
              category: getCategoryDisplayName(category),
            })}
            hasNextPage={hasNextPage ?? false}
            isFetching={isFetching}
            onLoadMore={loadMore}
            onSelectAgent={onSelectAgent}
            placeholder={listPlaceholder}
          />

          {isFetchingNextPage && (
            <div
              className="flex justify-center py-8"
              role="status"
              aria-live="polite"
              aria-label={localize('com_agents_loading')}
            >
              <Spinner className="h-6 w-6 text-text-primary" />
              <span className="sr-only">{localize('com_agents_loading')}</span>
            </div>
          )}

          {!failure && hasData && !hasNextPage && (
            <div className="mt-6 text-center">
              <p className="text-sm text-text-secondary">
                {localize('com_agents_no_more_results')}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );

  return mainContent;
};

export default AgentGrid;
