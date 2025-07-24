import React, { useMemo } from 'react';
import { Button, Spinner } from '@librechat/client';
import { PERMISSION_BITS } from 'librechat-data-provider';
import type t from 'librechat-data-provider';
import { useMarketplaceAgentsInfiniteQuery } from '~/data-provider/Agents';
import { useAgentCategories, useLocalize } from '~/hooks';
import { useHasData } from './SmartLoader';
import ErrorDisplay from './ErrorDisplay';
import AgentCard from './AgentCard';
import { cn } from '~/utils';

interface AgentGridProps {
  category: string; // Currently selected category
  searchQuery: string; // Current search query
  onSelectAgent: (agent: t.Agent) => void; // Callback when agent is selected
}

/**
 * Component for displaying a grid of agent cards
 */
const AgentGrid: React.FC<AgentGridProps> = ({ category, searchQuery, onSelectAgent }) => {
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
    } = {
      requiredPermission: PERMISSION_BITS.VIEW, // View permission for marketplace viewing
      limit: 6,
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

    return params;
  }, [category, searchQuery]);

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

  // Flatten all pages into a single array of agents
  const currentAgents = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.data || []);
  }, [data?.pages]);

  // Check if we have meaningful data to prevent unnecessary loading states
  const hasData = useHasData(data?.pages?.[0]);

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
   * Load more agents when "See More" button is clicked
   */
  const handleLoadMore = () => {
    if (hasNextPage && !isFetching) {
      fetchNextPage();
    }
  };

  /**
   * Get the appropriate title for the agents grid based on current state
   */
  const getGridTitle = () => {
    if (searchQuery) {
      return localize('com_agents_results_for', { query: searchQuery });
    }

    return getCategoryDisplayName(category);
  };

  // Loading skeleton component
  const loadingSkeleton = (
    <div className="space-y-6">
      <div className="mb-4">
        <div className="mb-2 h-6 w-48 animate-pulse rounded-md bg-surface-tertiary"></div>
        <div className="h-4 w-64 animate-pulse rounded-md bg-surface-tertiary"></div>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {Array(6)
          .fill(0)
          .map((_, index) => (
            <div
              key={index}
              className={cn(
                'flex animate-pulse overflow-hidden rounded-2xl',
                'aspect-[5/2.5] w-full',
                'bg-surface-tertiary',
              )}
            >
              <div className="flex h-full gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3">
                {/* Avatar skeleton */}
                <div className="flex flex-shrink-0 items-center">
                  <div className="h-10 w-10 rounded-full bg-surface-secondary sm:h-12 sm:w-12"></div>
                </div>
                {/* Content skeleton */}
                <div className="flex flex-1 flex-col justify-center space-y-2">
                  <div className="h-4 w-3/4 rounded bg-surface-secondary"></div>
                  <div className="h-3 w-full rounded bg-surface-secondary"></div>
                </div>
              </div>
            </div>
          ))}
      </div>
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
      {/* Grid title - only show for search results */}
      {searchQuery && (
        <div className="mb-4">
          <h2
            className="text-xl font-bold text-text-primary"
            id={`category-heading-${category}`}
            aria-label={`${getGridTitle()}, ${currentAgents.length || 0} agents available`}
          >
            {getGridTitle()}
          </h2>
        </div>
      )}

      {/* Handle empty results with enhanced accessibility */}
      {(!currentAgents || currentAgents.length === 0) && !isLoading && !isFetching ? (
        <div
          className="py-12 text-center text-text-secondary"
          role="status"
          aria-live="polite"
          aria-label={
            searchQuery
              ? localize('com_agents_search_empty_heading')
              : localize('com_agents_empty_state_heading')
          }
        >
          <h3 className="mb-2 text-lg font-medium">
            {searchQuery
              ? localize('com_agents_search_empty_heading')
              : localize('com_agents_empty_state_heading')}
          </h3>
          <p className="text-sm">
            {searchQuery
              ? localize('com_agents_no_results')
              : localize('com_agents_none_in_category')}
          </p>
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

          {/* Agent grid - 2 per row with proper semantic structure */}
          {currentAgents && currentAgents.length > 0 && (
            <div
              className="grid grid-cols-1 gap-6 md:grid-cols-2"
              role="grid"
              aria-label={localize('com_agents_grid_announcement', {
                count: currentAgents.length,
                category: getCategoryDisplayName(category),
              })}
            >
              {currentAgents.map((agent: t.Agent, index: number) => (
                <div key={`${agent.id}-${index}`} role="gridcell">
                  <AgentCard agent={agent} onClick={() => onSelectAgent(agent)} />
                </div>
              ))}
            </div>
          )}

          {/* Loading indicator when fetching more with accessibility */}
          {isFetching && hasNextPage && (
            <div
              className="flex justify-center py-4"
              role="status"
              aria-live="polite"
              aria-label={localize('com_agents_loading')}
            >
              <Spinner className="h-6 w-6 text-primary" />
              <span className="sr-only">{localize('com_agents_loading')}</span>
            </div>
          )}

          {/* Load more button with enhanced accessibility */}
          {hasNextPage && !isFetching && (
            <div className="mt-8 flex justify-center">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                className={cn(
                  'min-w-[160px] border-2 border-border-medium bg-surface-primary px-6 py-3 font-medium text-text-primary',
                  'shadow-sm transition-all duration-200 hover:border-border-heavy hover:bg-surface-hover',
                  'hover:shadow-md focus:ring-2 focus:ring-ring focus:ring-offset-2',
                )}
                aria-label={localize('com_agents_load_more_label', {
                  category: getCategoryDisplayName(category),
                })}
              >
                {localize('com_agents_see_more')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );

  if (isLoading || (isFetching && !isFetchingNextPage)) {
    return loadingSkeleton;
  }
  return mainContent;
};

export default AgentGrid;
