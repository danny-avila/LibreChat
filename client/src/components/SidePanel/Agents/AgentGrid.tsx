import React, { useState } from 'react';
import { Button, Spinner } from '@librechat/client';
import type t from 'librechat-data-provider';
import { useDynamicAgentQuery, useAgentCategories } from '~/hooks/Agents';
import { SmartLoader, useHasData } from './SmartLoader';
import useLocalize from '~/hooks/useLocalize';
import ErrorDisplay from './ErrorDisplay';
import AgentCard from './AgentCard';
import { cn } from '~/utils';

interface AgentGridProps {
  category: string; // Currently selected category
  searchQuery: string; // Current search query
  onSelectAgent: (agent: t.Agent) => void; // Callback when agent is selected
}

// Interface for the actual data structure returned by the API
interface AgentGridData {
  agents: t.Agent[];
  pagination?: {
    hasMore: boolean;
    current: number;
    total: number;
  };
}

/**
 * Component for displaying a grid of agent cards
 */
const AgentGrid: React.FC<AgentGridProps> = ({ category, searchQuery, onSelectAgent }) => {
  const localize = useLocalize();
  const [page, setPage] = useState(1);

  // Get category data from API
  const { categories } = useAgentCategories();

  // Single dynamic query that handles all cases - much cleaner!
  const {
    data: rawData,
    isLoading,
    error,
    isFetching,
    refetch,
  } = useDynamicAgentQuery({
    category,
    searchQuery,
    page,
    limit: 6,
  });

  // Type the data properly
  const data = rawData as AgentGridData | undefined;

  // Check if we have meaningful data to prevent unnecessary loading states
  const hasData = useHasData(data);

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
    setPage((prevPage) => prevPage + 1);
  };

  /**
   * Reset page when category or search changes
   */
  React.useEffect(() => {
    setPage(1);
  }, [category, searchQuery]);

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
        <div className="mb-2 h-6 w-48 animate-pulse rounded-md bg-gray-200 dark:bg-gray-700"></div>
        <div className="h-4 w-64 animate-pulse rounded-md bg-gray-200 dark:bg-gray-700"></div>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {Array(6)
          .fill(0)
          .map((_, index) => (
            <div
              key={index}
              className={cn(
                'flex h-[250px] animate-pulse flex-col overflow-hidden rounded-lg',
                'bg-gray-200 dark:bg-gray-800',
              )}
            >
              <div className="h-40 bg-gray-300 dark:bg-gray-700"></div>
              <div className="flex-1 p-5">
                <div className="mb-3 h-4 w-3/4 rounded bg-gray-300 dark:bg-gray-700"></div>
                <div className="mb-2 h-3 w-full rounded bg-gray-300 dark:bg-gray-700"></div>
                <div className="h-3 w-2/3 rounded bg-gray-300 dark:bg-gray-700"></div>
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
            className="text-xl font-bold text-gray-900 dark:text-white"
            id={`category-heading-${category}`}
            aria-label={`${getGridTitle()}, ${data?.agents?.length || 0} agents available`}
          >
            {getGridTitle()}
          </h2>
        </div>
      )}

      {/* Handle empty results with enhanced accessibility */}
      {(!data?.agents || data.agents.length === 0) && !isLoading && !isFetching ? (
        <div
          className="py-12 text-center text-gray-500"
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
              count: data?.agents?.length || 0,
              category: getCategoryDisplayName(category),
            })}
          </div>

          {/* Agent grid - 2 per row with proper semantic structure */}
          {data?.agents && data.agents.length > 0 && (
            <div
              className="grid grid-cols-1 gap-6 md:grid-cols-2"
              role="grid"
              aria-label={localize('com_agents_grid_announcement', {
                count: data.agents.length,
                category: getCategoryDisplayName(category),
              })}
            >
              {data.agents.map((agent: t.Agent, index: number) => (
                <div key={`${agent.id}-${index}`} role="gridcell">
                  <AgentCard agent={agent} onClick={() => onSelectAgent(agent)} />
                </div>
              ))}
            </div>
          )}

          {/* Loading indicator when fetching more with accessibility */}
          {isFetching && page > 1 && (
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
          {data?.pagination?.hasMore && !isFetching && (
            <div className="mt-8 flex justify-center">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                className={cn(
                  'min-w-[160px] border-2 border-gray-300 bg-white px-6 py-3 font-medium text-gray-700',
                  'shadow-sm transition-all duration-200 hover:border-gray-400 hover:bg-gray-50',
                  'hover:shadow-md focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
                  'dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200',
                  'dark:hover:border-gray-500 dark:hover:bg-gray-700 dark:focus:ring-blue-400',
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

  // Use SmartLoader to prevent unnecessary loading flashes
  return (
    <SmartLoader
      isLoading={isLoading}
      hasData={hasData}
      delay={200} // Show loading only after 200ms delay
      loadingComponent={loadingSkeleton}
    >
      {mainContent}
    </SmartLoader>
  );
};

export default AgentGrid;
