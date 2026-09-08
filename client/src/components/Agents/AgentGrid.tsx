import React, { useMemo, useEffect } from 'react';
import { Spinner } from '@librechat/client';
import { PermissionBits } from 'librechat-data-provider';
import type t from 'librechat-data-provider';
import { useMarketplaceAgentsInfiniteQuery } from '~/data-provider/Agents';
import { useAgentCategories, useLocalize, TranslationKeys } from '~/hooks';
import { useInfiniteScroll } from '~/hooks/useInfiniteScroll';
import { useHasData } from './SmartLoader';
import ErrorDisplay from './ErrorDisplay';
import AgentCard from './AgentCard';

interface AgentGridProps {
  category: string;
  searchQuery: string;
  onSelectAgent: (agent: t.Agent) => void;
  scrollElementRef?: React.RefObject<HTMLElement>;
  /** Sort mode applied to the marketplace list; server defaults to 'newest' when omitted. */
  sort?: t.AgentSortOption;
  /** When 1, restrict the list to agents authored by the current user. */
  mine?: 0 | 1;
  /** Reports the number of agents currently loaded, so a parent header can show a live count. */
  onCountChange?: (count: number) => void;
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
  onCountChange,
}) => {
  const localize = useLocalize();

  // Get category data from API
  const { categories } = useAgentCategories();

  // Build query parameters based on current state
  const queryParams = useMemo(() => {
    const params: {
      requiredPermission: number;
      category?: string;
      search?: string;
      limit: number;
      promoted?: 0 | 1;
      sort?: t.AgentSortOption;
      mine?: 0 | 1;
    } = {
      requiredPermission: PermissionBits.VIEW, // View permission for marketplace viewing
      limit: 8,
    };

    // Handle search
    if (searchQuery) {
      params.search = searchQuery;
      // Include category filter for search if it's not 'all' or 'promoted'
      if (category !== 'all' && category !== 'promoted') {
        params.category = category;
      }
    } else {
      // Handle category-based queries
      if (category === 'promoted') {
        params.promoted = 1;
      } else if (category !== 'all') {
        params.category = category;
      }
      // For 'all' category, no additional filters needed
    }

    // Only set sort/mine when a non-default value is given, so requests that
    // don't use this feature keep the same cache key as before.
    if (sort) {
      params.sort = sort;
    }
    if (mine) {
      params.mine = mine;
    }

    return params;
  }, [category, searchQuery, sort, mine]);

  // Use infinite query for marketplace agents
  const {
    data,
    isLoading,
    error,
    isFetching,
    fetchNextPage,
    hasNextPage,
    refetch,
    isFetchingNextPage,
  } = useMarketplaceAgentsInfiniteQuery(queryParams);

  // Flatten all pages into a single array of agents, deduping by id. The
  // 'popular' sort recomputes favoriteCount on every request, so an agent can
  // be pinned/unpinned between two consecutive page loads and drift across
  // the page boundary, appearing in both — the server does not guarantee
  // adjacent pages are disjoint in that mode. Keep the first occurrence so an
  // agent stays where it was originally seen while scrolling.
  const currentAgents = useMemo(() => {
    if (!data?.pages) return [];
    const flattened = data.pages.flatMap((page) => page.data || []);
    const seenIds = new Set<string>();
    const deduped: t.Agent[] = [];
    for (const agent of flattened) {
      if (seenIds.has(agent.id)) {
        continue;
      }
      seenIds.add(agent.id);
      deduped.push(agent);
    }
    return deduped;
  }, [data?.pages]);

  // Check if we have meaningful data to prevent unnecessary loading states
  const hasData = useHasData(data?.pages?.[0]);

  // Set up infinite scroll
  const { setScrollElement } = useInfiniteScroll({
    hasNextPage,
    isLoading: isFetching || isFetchingNextPage,
    fetchNextPage: () => {
      if (hasNextPage && !isFetching) {
        fetchNextPage();
      }
    },
    threshold: 0.8, // Trigger when 80% scrolled
    throttleMs: 200,
  });

  // Connect the scroll element when it's provided
  useEffect(() => {
    const scrollElement = scrollElementRef?.current;
    if (scrollElement) {
      setScrollElement(scrollElement);
    }
  }, [scrollElementRef, setScrollElement]);

  // Report the loaded count upward so a parent header can show a live total.
  useEffect(() => {
    onCountChange?.(currentAgents.length);
  }, [currentAgents.length, onCountChange]);

  /**
   * Get category display name from API data or use fallback
   */
  const getCategoryDisplayName = (categoryValue: string) => {
    const categoryData = categories.find((cat) => cat.value === categoryValue);
    if (categoryData) {
      return categoryData.label;
    }

    // Fallback for special categories or unknown categories
    if (categoryValue === 'promoted') {
      return localize('com_agents_top_picks');
    }
    if (categoryValue === 'all') {
      return 'All';
    }

    // Simple capitalization for unknown categories
    return categoryValue.charAt(0).toUpperCase() + categoryValue.slice(1);
  };

  /**
   * "You haven't created any agents yet" reads better than "No agents found" once the
   * user has explicitly filtered to their own agents — but it would be untrue on the
   * promoted tab, which is empty of own agents by construction (`is_promoted` has no
   * write path in the app). That pair is only reachable by direct URL or history
   * navigation; the toggle itself moves off `promoted`. A search always wins, since
   * "no matches for this query" is the more specific explanation.
   */
  const getEmptyStateHeadingKey = (): TranslationKeys => {
    if (!mine || searchQuery) {
      return 'com_agents_empty_state_heading';
    }
    if (category === 'promoted') {
      return 'com_agents_mine_promoted_empty_state_heading';
    }
    return 'com_agents_mine_empty_state_heading';
  };
  const emptyStateHeadingKey = getEmptyStateHeadingKey();

  // Simple loading spinner
  const loadingSpinner = (
    <div className="flex justify-center py-12">
      <Spinner className="h-8 w-8 text-text-primary" />
    </div>
  );

  // Handle error state with enhanced error display
  if (error) {
    return (
      <ErrorDisplay
        error={error || 'Unknown error occurred'}
        onRetry={() => refetch()}
        context={{
          searchQuery,
          category,
        }}
      />
    );
  }

  // Main content component with proper semantic structure
  const mainContent = (
    <div
      className="space-y-6"
      role="tabpanel"
      id={`category-panel-${category}`}
      aria-labelledby={`category-tab-${category}`}
      aria-live="polite"
      aria-busy={isLoading && !hasData}
    >
      {/* Handle empty results with enhanced accessibility */}
      {(!currentAgents || currentAgents.length === 0) && !isLoading && !isFetching ? (
        <div
          className="py-12 text-center text-text-secondary"
          role="status"
          aria-live="polite"
          aria-label={
            searchQuery
              ? localize('com_agents_search_empty_heading')
              : localize(emptyStateHeadingKey)
          }
        >
          <h3 className="mb-2 text-lg font-medium">{localize(emptyStateHeadingKey)}</h3>
        </div>
      ) : (
        <>
          {/* Announcement for screen readers */}
          <div id="search-results-count" className="sr-only" aria-live="polite" aria-atomic="true">
            {localize('com_agents_grid_announcement', {
              count: currentAgents?.length || 0,
              category: getCategoryDisplayName(category),
            })}
          </div>

          {/* Agent grid - column count auto-adjusts to available width */}
          {currentAgents && currentAgents.length > 0 && (
            <div
              className="grid grid-cols-[repeat(auto-fill,minmax(288px,1fr))] items-stretch gap-6"
              role="grid"
              aria-label={localize('com_agents_grid_announcement', {
                count: currentAgents.length,
                category: getCategoryDisplayName(category),
              })}
            >
              {currentAgents.map((agent: t.Agent) => (
                <div key={agent.id} role="gridcell" className="h-full">
                  <AgentCard agent={agent} onSelect={onSelectAgent} />
                </div>
              ))}
            </div>
          )}

          {/* Loading indicator when fetching more with accessibility */}
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

          {/* End of results indicator */}
          {!hasNextPage && currentAgents && currentAgents.length > 0 && (
            <div className="mt-8 text-center">
              <p className="text-sm text-text-secondary">
                {localize('com_agents_no_more_results')}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );

  if ((isLoading || (isFetching && !isFetchingNextPage)) && !hasData) {
    return loadingSpinner;
  }
  return mainContent;
};

export default AgentGrid;
