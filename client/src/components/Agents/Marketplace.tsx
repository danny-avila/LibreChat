import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useMediaQuery } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import type t from 'librechat-data-provider';
import { useDocumentTitle, useHasAccess, useLocalize, TranslationKeys } from '~/hooks';
import { useGetEndpointsQuery, useGetAgentCategoriesQuery } from '~/data-provider';
import SortDropdown, { SORT_OPTIONS, DEFAULT_SORT_OPTION } from './SortDropdown';
import MarketplaceAdminSettings from './MarketplaceAdminSettings';
import OpenSidebar from '~/components/Chat/Menus/OpenSidebar';
import { SidePanelGroup } from '~/components/SidePanel';
import MineFilterToggle from './MineFilterToggle';
import CategoryTabs from './CategoryTabs';
import SearchBar from './SearchBar';
import AgentGrid from './AgentGrid';
import { cn } from '~/utils';

interface AgentMarketplaceProps {
  className?: string;
}

/**
 * AgentMarketplace - Main component for browsing and discovering agents
 *
 * Provides tabbed navigation for different agent categories,
 * search functionality, and detailed agent view through a modal dialog.
 * Uses URL parameters for state persistence and deep linking.
 */
const AgentMarketplace: React.FC<AgentMarketplaceProps> = ({ className = '' }) => {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { category } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  // Get URL parameters
  const searchQuery = searchParams.get('q') || '';

  // Sort mode, read from the URL; falls back to 'newest' for a missing/invalid value,
  // matching the server-side default so the URL stays clean when nothing is selected.
  const sort = useMemo<t.AgentSortOption>(() => {
    const value = searchParams.get('sort');
    return SORT_OPTIONS.some((option) => option.value === value)
      ? (value as t.AgentSortOption)
      : DEFAULT_SORT_OPTION;
  }, [searchParams]);
  const mine: 0 | 1 = searchParams.get('mine') === '1' ? 1 : 0;
  // Loaded-so-far count reported by the currently-displayed AgentGrid; the list is
  // cursor-paginated and has no server-side total to show instead.
  const [visibleCount, setVisibleCount] = useState(0);

  // Animation state
  type Direction = 'left' | 'right';
  // Initialize with a default value to prevent rendering issues
  const [displayCategory, setDisplayCategory] = useState<string>(category || 'all');
  const [nextCategory, setNextCategory] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const [animationDirection, setAnimationDirection] = useState<Direction>('right');

  // Ref for the scrollable container to enable infinite scroll
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Set page title
  useDocumentTitle(`${localize('com_agents_marketplace')} | LibreChat`);

  // Ensure endpoints config is loaded first (required for agent queries)
  useGetEndpointsQuery();

  // Fetch categories using existing query pattern
  const categoriesQuery = useGetAgentCategoriesQuery({
    staleTime: 1000 * 60 * 15, // 15 minutes - categories rarely change
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });

  // Handle initial category when on /agents without a category
  useEffect(() => {
    if (
      !category &&
      window.location.pathname === '/agents' &&
      categoriesQuery.data &&
      displayCategory === 'all'
    ) {
      const hasPromoted = categoriesQuery.data.some((cat) => cat.value === 'promoted');
      if (hasPromoted) {
        // If promoted exists, update display to show it
        setDisplayCategory('promoted');
      }
    }
  }, [category, categoriesQuery.data, displayCategory]);

  /**
   * Handle agent card selection - updates URL for deep linking
   */
  const handleAgentSelect = (agent: t.Agent) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('agent_id', agent.id);
    setSearchParams(newParams);
  };

  /**
   * Determine ordered tabs to compute indices for direction
   */
  const orderedTabs = useMemo<string[]>(() => {
    const dynamic = (categoriesQuery.data || []).map((c) => c.value);
    // Only include values that actually exist in the categories
    const set = new Set<string>(dynamic);
    return Array.from(set);
  }, [categoriesQuery.data]);

  const getTabIndex = useCallback(
    (tab: string): number => {
      const idx = orderedTabs.indexOf(tab);
      return idx >= 0 ? idx : 0;
    },
    [orderedTabs],
  );

  /**
   * Handle category tab selection changes with directional animation
   */
  const handleTabChange = (tabValue: string) => {
    if (tabValue === displayCategory || isTransitioning) {
      // Ignore redundant or rapid clicks during transition
      return;
    }

    const currentIndex = getTabIndex(displayCategory);
    const newIndex = getTabIndex(tabValue);
    const direction: Direction = newIndex > currentIndex ? 'right' : 'left';

    setAnimationDirection(direction);
    setNextCategory(tabValue);
    setIsTransitioning(true);

    // Update URL immediately, preserving current search params
    const currentSearchParams = searchParams.toString();
    const searchParamsStr = currentSearchParams ? `?${currentSearchParams}` : '';
    if (tabValue === 'promoted') {
      navigate(`/agents${searchParamsStr}`);
    } else {
      navigate(`/agents/${tabValue}${searchParamsStr}`);
    }

    // Complete transition after 300ms
    window.setTimeout(() => {
      setDisplayCategory(tabValue);
      setNextCategory(null);
      setIsTransitioning(false);
    }, 300);
  };

  /**
   * Sync display when URL changes externally (back/forward)
   */
  useEffect(() => {
    if (category && category !== displayCategory && !isTransitioning) {
      // URL changed externally, update display without animation
      setDisplayCategory(category);
    }
  }, [category, displayCategory, isTransitioning]);

  // No longer needed with keyframes

  /**
   * Handle search query changes
   *
   * @param query - The search query string
   */
  const handleSearch = (query: string) => {
    const newParams = new URLSearchParams(searchParams);
    const currentCategory = displayCategory;

    if (query.trim()) {
      newParams.set('q', query.trim());
    } else {
      newParams.delete('q');
    }

    // Always preserve current category when searching or clearing search
    if (currentCategory === 'promoted') {
      navigate(`/agents${newParams.toString() ? `?${newParams.toString()}` : ''}`);
    } else {
      navigate(
        `/agents/${currentCategory}${newParams.toString() ? `?${newParams.toString()}` : ''}`,
      );
    }
  };

  /**
   * Handle sort mode changes, persisted to the URL. 'newest' matches the
   * server-side default, so it is omitted rather than written explicitly.
   */
  const handleSortChange = (value: t.AgentSortOption) => {
    const newParams = new URLSearchParams(searchParams);
    if (value === DEFAULT_SORT_OPTION) {
      newParams.delete('sort');
    } else {
      newParams.set('sort', value);
    }

    if (displayCategory === 'promoted') {
      navigate(`/agents${newParams.toString() ? `?${newParams.toString()}` : ''}`);
    } else {
      navigate(
        `/agents/${displayCategory}${newParams.toString() ? `?${newParams.toString()}` : ''}`,
      );
    }
  };

  /** Toggle the "only my agents" filter, persisted to the URL. */
  const handleMineChange = (checked: boolean) => {
    const newParams = new URLSearchParams(searchParams);
    if (checked) {
      newParams.set('mine', '1');
    } else {
      newParams.delete('mine');
    }

    // `is_promoted` has no write path in the app, so "promoted AND authored by me" is
    // structurally empty for ordinary users — and `/agents` lands on the promoted tab
    // whenever that category exists, so this would be the very first thing the toggle
    // does. Move to `all` instead of showing an empty grid. Done as a single navigate
    // here rather than via `handleTabChange`, which closes over the render-time
    // `searchParams` (dropping the `mine` just set), can early-return mid-transition,
    // and would race this `setSearchParams`. No slide animation either: `displayCategory`
    // is set directly, so `isTransitioning`/`nextCategory` stay untouched.
    if (checked && displayCategory === 'promoted') {
      const searchParamsStr = newParams.toString() ? `?${newParams.toString()}` : '';
      setDisplayCategory('all');
      navigate(`/agents/all${searchParamsStr}`);
      return;
    }

    setSearchParams(newParams);
  };

  const hasAccessToMarketplace = useHasAccess({
    permissionType: PermissionTypes.MARKETPLACE,
    permission: Permissions.USE,
  });
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    if (!hasAccessToMarketplace) {
      timeoutId = setTimeout(() => {
        navigate('/c/new');
      }, 1000);
    }
    return () => {
      clearTimeout(timeoutId);
    };
  }, [hasAccessToMarketplace, navigate]);

  if (!hasAccessToMarketplace) {
    return null;
  }
  return (
    <div className={`relative flex w-full grow overflow-hidden bg-presentation ${className}`}>
      <SidePanelGroup>
        <main className="flex h-full flex-col overflow-hidden" role="main">
          {/* Scrollable container */}
          <div
            ref={scrollContainerRef}
            className="scrollbar-gutter-stable relative flex h-full flex-col overflow-y-auto overflow-x-hidden"
          >
            {/* Sticky header: single row with title, live count and search; category tabs
                render directly below it. Sort and the "my agents" filter live in the
                category header row instead, next to the category they act on. */}
            <div className="sticky top-0 z-10 bg-presentation">
              {isSmallScreen ? (
                <div className="flex items-center justify-between gap-2 px-6 pt-3">
                  <OpenSidebar />
                  <MarketplaceAdminSettings compact />
                </div>
              ) : null}

              {/* The rule under this row carries the horizontal padding itself rather
                  than inheriting it from a wrapper, so it spans the full width instead
                  of stopping short of both edges. */}
              <div className="flex h-[60px] w-full items-center justify-between gap-3 border-b border-border-light px-6">
                <div className="flex min-w-0 shrink-0 items-center gap-3">
                  <h1 className="truncate text-lg font-semibold text-text-primary">
                    {localize('com_agents_marketplace')}
                  </h1>
                  <span
                    className="shrink-0 whitespace-nowrap rounded-full bg-surface-hover px-2.5 py-1 text-xs font-medium text-text-secondary"
                    aria-live="polite"
                  >
                    {localize('com_agents_count', { count: visibleCount })}
                  </span>
                </div>

                <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                  <SearchBar
                    value={searchQuery}
                    onSearch={handleSearch}
                    className="max-w-[420px]"
                  />

                  {/* TODO: Remove this once we have a better way to handle admin settings */}
                  {!isSmallScreen && <MarketplaceAdminSettings />}
                </div>
              </div>

              {/* Category tabs */}
              <div className="w-full px-6 pb-3 pt-3">
                <CategoryTabs
                  categories={categoriesQuery.data || []}
                  activeTab={displayCategory}
                  isLoading={categoriesQuery.isLoading}
                  onChange={handleTabChange}
                />
              </div>
            </div>
            {/* Scrollable content area */}
            <div className="w-full px-6 pb-8">
              {/* Two-pane animated container wrapping the grid */}
              <div className="relative overflow-hidden">
                {/* Current content pane */}
                <div
                  className={cn(
                    isTransitioning &&
                      (animationDirection === 'right'
                        ? 'motion-safe:animate-slide-out-left'
                        : 'motion-safe:animate-slide-out-right'),
                  )}
                  key={`pane-current-${displayCategory}`}
                >
                  {/* Category header + filters. The title is hidden while searching, but the
                      filter controls always render so they can never filter invisibly. */}
                  <div className="mb-4 mt-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
                    {!searchQuery &&
                      (() => {
                        // Get category data for display
                        const getCategoryData = () => {
                          if (displayCategory === 'promoted') {
                            return {
                              name: localize('com_agents_top_picks'),
                              description: localize('com_agents_recommended'),
                            };
                          }
                          if (displayCategory === 'all') {
                            return {
                              name: localize('com_agents_all'),
                              description: localize('com_agents_all_description'),
                            };
                          }

                          // Find the category in the API data
                          const categoryData = categoriesQuery.data?.find(
                            (cat) => cat.value === displayCategory,
                          );
                          if (categoryData) {
                            return {
                              name: categoryData.label?.startsWith('com_')
                                ? localize(categoryData.label as TranslationKeys)
                                : categoryData.label,
                              description: categoryData.description?.startsWith('com_')
                                ? localize(categoryData.description as TranslationKeys)
                                : categoryData.description || '',
                            };
                          }

                          // Fallback for unknown categories
                          return {
                            name:
                              displayCategory.charAt(0).toUpperCase() + displayCategory.slice(1),
                            description: '',
                          };
                        };

                        const { name, description } = getCategoryData();

                        return (
                          <div className="min-w-0 text-left">
                            <h2 className="text-lg font-semibold text-text-primary">{name}</h2>
                            {description && (
                              <p className="mt-1 text-sm text-text-tertiary">{description}</p>
                            )}
                          </div>
                        );
                      })()}

                    {/* Filter controls. `ml-auto` keeps them right-aligned even while
                        searching, when the title is the only other child and is absent. */}
                    <div className="ml-auto flex flex-shrink-0 items-center gap-3">
                      <MineFilterToggle checked={mine === 1} onCheckedChange={handleMineChange} />
                      <SortDropdown frame="current" value={sort} onChange={handleSortChange} />
                    </div>
                  </div>

                  {/* Agent grid */}
                  <AgentGrid
                    key={`grid-${displayCategory}`}
                    category={displayCategory}
                    searchQuery={searchQuery}
                    onSelectAgent={handleAgentSelect}
                    scrollElementRef={scrollContainerRef}
                    sort={sort}
                    mine={mine}
                    onCountChange={setVisibleCount}
                  />
                </div>

                {/* Next content pane, only during transition */}
                {isTransitioning && nextCategory && (
                  <div
                    className={cn(
                      'absolute inset-0',
                      animationDirection === 'right'
                        ? 'motion-safe:animate-slide-in-right'
                        : 'motion-safe:animate-slide-in-left',
                    )}
                    key={`pane-next-${nextCategory}-${animationDirection}`}
                  >
                    {/* Category header + filters. Duplicated from the current pane on
                        purpose: both panes are mounted together for the 300ms slide, and a
                        header rendered in only one of them would blink out mid-transition. */}
                    <div className="mb-4 mt-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
                      {!searchQuery &&
                        (() => {
                          // Get category data for display
                          const getCategoryData = () => {
                            if (nextCategory === 'promoted') {
                              return {
                                name: localize('com_agents_top_picks'),
                                description: localize('com_agents_recommended'),
                              };
                            }
                            if (nextCategory === 'all') {
                              return {
                                name: localize('com_agents_all'),
                                description: localize('com_agents_all_description'),
                              };
                            }

                            // Find the category in the API data
                            const categoryData = categoriesQuery.data?.find(
                              (cat) => cat.value === nextCategory,
                            );
                            if (categoryData) {
                              return {
                                name: categoryData.label?.startsWith('com_')
                                  ? localize(categoryData.label as TranslationKeys)
                                  : categoryData.label,
                                description: categoryData.description?.startsWith('com_')
                                  ? localize(categoryData.description as TranslationKeys)
                                  : categoryData.description || '',
                              };
                            }

                            // Fallback for unknown categories
                            return {
                              name:
                                (nextCategory || '').charAt(0).toUpperCase() +
                                (nextCategory || '').slice(1),
                              description: '',
                            };
                          };

                          const { name, description } = getCategoryData();

                          return (
                            <div className="min-w-0 text-left">
                              <h2 className="text-lg font-semibold text-text-primary">{name}</h2>
                              {description && (
                                <p className="mt-1 text-sm text-text-tertiary">{description}</p>
                              )}
                            </div>
                          );
                        })()}

                      {/* Filter controls. `ml-auto` keeps them right-aligned even while
                          searching, when the title is the only other child and is absent. */}
                      <div className="ml-auto flex flex-shrink-0 items-center gap-3">
                        <MineFilterToggle checked={mine === 1} onCheckedChange={handleMineChange} />
                        <SortDropdown frame="next" value={sort} onChange={handleSortChange} />
                      </div>
                    </div>

                    {/* Agent grid — no onCountChange here: this pane is transient (only
                        mounted during the 300ms tab-switch animation), and wiring the
                        callback on both panes makes the header count flicker between
                        two values while they cross-fade. */}
                    <AgentGrid
                      key={`grid-${nextCategory}`}
                      category={nextCategory}
                      searchQuery={searchQuery}
                      onSelectAgent={handleAgentSelect}
                      scrollElementRef={scrollContainerRef}
                      sort={sort}
                      mine={mine}
                    />
                  </div>
                )}

                {/* Note: Using Tailwind keyframes for slide in/out animations */}
              </div>
            </div>
          </div>
        </main>
      </SidePanelGroup>
    </div>
  );
};

export default AgentMarketplace;
