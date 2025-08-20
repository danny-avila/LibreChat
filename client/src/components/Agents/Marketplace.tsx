import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRecoilState } from 'recoil';
import { useOutletContext } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { TooltipAnchor, Button, NewChatIcon, useMediaQuery } from '@librechat/client';
import { PermissionTypes, Permissions, QueryKeys, Constants } from 'librechat-data-provider';
import type t from 'librechat-data-provider';
import type { ContextType } from '~/common';
import { useGetEndpointsQuery, useGetAgentCategoriesQuery } from '~/data-provider';
import { useDocumentTitle, useHasAccess, useLocalize } from '~/hooks';
import MarketplaceAdminSettings from './MarketplaceAdminSettings';
import { SidePanelProvider, useChatContext } from '~/Providers';
import { MarketplaceProvider } from './MarketplaceContext';
import { SidePanelGroup } from '~/components/SidePanel';
import { OpenSidebar } from '~/components/Chat/Menus';
import CategoryTabs from './CategoryTabs';
import AgentDetail from './AgentDetail';
import SearchBar from './SearchBar';
import AgentGrid from './AgentGrid';
import { cn } from '~/utils';
import store from '~/store';

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
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { conversation, newConversation } = useChatContext();

  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const { navVisible, setNavVisible } = useOutletContext<ContextType>();
  const [hideSidePanel, setHideSidePanel] = useRecoilState(store.hideSidePanel);

  // Get URL parameters
  const searchQuery = searchParams.get('q') || '';
  const selectedAgentId = searchParams.get('agent_id') || '';

  // Animation state
  type Direction = 'left' | 'right';
  // Initialize with a default value to prevent rendering issues
  const [displayCategory, setDisplayCategory] = useState<string>(category || 'all');
  const [nextCategory, setNextCategory] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const [animationDirection, setAnimationDirection] = useState<Direction>('right');

  // Ref for the scrollable container to enable infinite scroll
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Local state
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<t.Agent | null>(null);

  // Set page title
  useDocumentTitle(`${localize('com_agents_marketplace')} | LibreChat`);

  // Ensure right sidebar is always visible in marketplace
  useEffect(() => {
    setHideSidePanel(false);

    // Also try to force expand via localStorage
    localStorage.setItem('hideSidePanel', 'false');
    localStorage.setItem('fullPanelCollapse', 'false');
  }, [setHideSidePanel, hideSidePanel]);

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
   * Handle agent card selection
   *
   * @param agent - The selected agent object
   */
  const handleAgentSelect = (agent: t.Agent) => {
    // Update URL with selected agent
    const newParams = new URLSearchParams(searchParams);
    newParams.set('agent_id', agent.id);
    setSearchParams(newParams);
    setSelectedAgent(agent);
    setIsDetailOpen(true);
  };

  /**
   * Handle closing the agent detail dialog
   */
  const handleDetailClose = () => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('agent_id');
    setSearchParams(newParams);
    setSelectedAgent(null);
    setIsDetailOpen(false);
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
    if (query.trim()) {
      newParams.set('q', query.trim());
      // Switch to "all" category when starting a new search
      navigate(`/agents/all?${newParams.toString()}`);
    } else {
      newParams.delete('q');
      // Preserve current category when clearing search
      const currentCategory = displayCategory;
      if (currentCategory === 'promoted') {
        navigate(`/agents${newParams.toString() ? `?${newParams.toString()}` : ''}`);
      } else {
        navigate(
          `/agents/${currentCategory}${newParams.toString() ? `?${newParams.toString()}` : ''}`,
        );
      }
    }
  };

  /**
   * Handle new chat button click
   */

  const handleNewChat = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.button === 0 && (e.ctrlKey || e.metaKey)) {
      window.open('/c/new', '_blank');
      return;
    }
    queryClient.setQueryData<t.TMessage[]>(
      [QueryKeys.messages, conversation?.conversationId ?? Constants.NEW_CONVO],
      [],
    );
    queryClient.invalidateQueries([QueryKeys.messages]);
    newConversation();
  };

  // Check if a detail view should be open based on URL
  useEffect(() => {
    setIsDetailOpen(!!selectedAgentId);
  }, [selectedAgentId]);

  // Layout configuration for SidePanelGroup
  const defaultLayout = useMemo(() => {
    const resizableLayout = localStorage.getItem('react-resizable-panels:layout');
    return typeof resizableLayout === 'string' ? JSON.parse(resizableLayout) : undefined;
  }, []);

  const defaultCollapsed = useMemo(() => {
    const collapsedPanels = localStorage.getItem('react-resizable-panels:collapsed');
    return typeof collapsedPanels === 'string' ? JSON.parse(collapsedPanels) : true;
  }, []);

  const fullCollapse = useMemo(() => localStorage.getItem('fullPanelCollapse') === 'true', []);

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
      <MarketplaceProvider>
        <SidePanelProvider>
          <SidePanelGroup
            defaultLayout={defaultLayout}
            fullPanelCollapse={fullCollapse}
            defaultCollapsed={defaultCollapsed}
          >
            <main className="flex h-full flex-col overflow-hidden" role="main">
              {/* Scrollable container */}
              <div
                ref={scrollContainerRef}
                className="scrollbar-gutter-stable relative flex h-full flex-col overflow-y-auto overflow-x-hidden"
              >
                {/* Simplified header for agents marketplace - only show nav controls when needed */}
                {!isSmallScreen && (
                  <div className="sticky top-0 z-20 flex items-center justify-between bg-surface-secondary p-2 font-semibold text-text-primary md:h-14">
                    <div className="mx-1 flex items-center gap-2">
                      {!navVisible ? (
                        <>
                          <OpenSidebar setNavVisible={setNavVisible} />
                          <TooltipAnchor
                            description={localize('com_ui_new_chat')}
                            render={
                              <Button
                                size="icon"
                                variant="outline"
                                data-testid="agents-new-chat-button"
                                aria-label={localize('com_ui_new_chat')}
                                className="rounded-xl border border-border-light bg-surface-secondary p-2 hover:bg-surface-hover max-md:hidden"
                                onClick={handleNewChat}
                              >
                                <NewChatIcon />
                              </Button>
                            }
                          />
                        </>
                      ) : (
                        // Invisible placeholder to maintain height
                        <div className="h-10 w-10" />
                      )}
                    </div>
                  </div>
                )}
                {/* Hero Section - scrolls away */}
                {!isSmallScreen && (
                  <div className="container mx-auto max-w-4xl">
                    <div className={cn('mb-8 text-center', 'mt-12')}>
                      <h1 className="mb-3 text-3xl font-bold tracking-tight text-text-primary md:text-5xl">
                        {localize('com_agents_marketplace')}
                      </h1>
                      <p className="mx-auto mb-6 max-w-2xl text-lg text-text-secondary">
                        {localize('com_agents_marketplace_subtitle')}
                      </p>
                    </div>
                  </div>
                )}
                {/* Sticky wrapper for search bar and categories */}
                <div
                  className={cn(
                    'sticky z-10 bg-presentation pb-4',
                    isSmallScreen ? 'top-0' : 'top-14',
                  )}
                >
                  <div className="container mx-auto max-w-4xl px-4">
                    {/* Search bar */}
                    <div className="mx-auto flex max-w-2xl gap-2 pb-6">
                      <SearchBar value={searchQuery} onSearch={handleSearch} />
                      {/* TODO: Remove this once we have a better way to handle admin settings */}
                      {/* Admin Settings */}
                      <MarketplaceAdminSettings />
                    </div>

                    {/* Category tabs */}
                    <CategoryTabs
                      categories={categoriesQuery.data || []}
                      activeTab={displayCategory}
                      isLoading={categoriesQuery.isLoading}
                      onChange={handleTabChange}
                    />
                  </div>
                </div>
                {/* Scrollable content area */}
                <div className="container mx-auto max-w-4xl px-4 pb-8">
                  {/* Two-pane animated container wrapping category header + grid */}
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
                      {/* Category header - only show when not searching */}
                      {!searchQuery && (
                        <div className="mb-6 mt-6">
                          {(() => {
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
                                  name: 'All Agents',
                                  description: 'Browse all shared agents across all categories',
                                };
                              }

                              // Find the category in the API data
                              const categoryData = categoriesQuery.data?.find(
                                (cat) => cat.value === displayCategory,
                              );
                              if (categoryData) {
                                return {
                                  name: categoryData.label,
                                  description: categoryData.description || '',
                                };
                              }

                              // Fallback for unknown categories
                              return {
                                name:
                                  displayCategory.charAt(0).toUpperCase() +
                                  displayCategory.slice(1),
                                description: '',
                              };
                            };

                            const { name, description } = getCategoryData();

                            return (
                              <div className="text-left">
                                <h2 className="text-2xl font-bold text-text-primary">{name}</h2>
                                {description && (
                                  <p className="mt-2 text-text-secondary">{description}</p>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {/* Agent grid */}
                      <AgentGrid
                        key={`grid-${displayCategory}`}
                        category={displayCategory}
                        searchQuery={searchQuery}
                        onSelectAgent={handleAgentSelect}
                        scrollElement={scrollContainerRef.current}
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
                        {/* Category header - only show when not searching */}
                        {!searchQuery && (
                          <div className="mb-6 mt-6">
                            {(() => {
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
                                    name: 'All Agents',
                                    description: 'Browse all shared agents across all categories',
                                  };
                                }

                                // Find the category in the API data
                                const categoryData = categoriesQuery.data?.find(
                                  (cat) => cat.value === nextCategory,
                                );
                                if (categoryData) {
                                  return {
                                    name: categoryData.label,
                                    description: categoryData.description || '',
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
                                <div className="text-left">
                                  <h2 className="text-2xl font-bold text-text-primary">{name}</h2>
                                  {description && (
                                    <p className="mt-2 text-text-secondary">{description}</p>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        )}

                        {/* Agent grid */}
                        <AgentGrid
                          key={`grid-${nextCategory}`}
                          category={nextCategory}
                          searchQuery={searchQuery}
                          onSelectAgent={handleAgentSelect}
                          scrollElement={scrollContainerRef.current}
                        />
                      </div>
                    )}

                    {/* Note: Using Tailwind keyframes for slide in/out animations */}
                  </div>
                </div>
                {/* Agent detail dialog */}
                {isDetailOpen && selectedAgent && (
                  <AgentDetail
                    agent={selectedAgent}
                    isOpen={isDetailOpen}
                    onClose={handleDetailClose}
                  />
                )}
              </div>
            </main>
          </SidePanelGroup>
        </SidePanelProvider>
      </MarketplaceProvider>
    </div>
  );
};

export default AgentMarketplace;
