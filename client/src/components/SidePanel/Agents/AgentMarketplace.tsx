import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useSetRecoilState, useRecoilValue } from 'recoil';
import { useQueryClient } from '@tanstack/react-query';
import { PermissionTypes, Permissions, QueryKeys, Constants } from 'librechat-data-provider';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import type t from 'librechat-data-provider';
import type { ContextType } from '~/common';
import { useGetEndpointsQuery, useGetAgentCategoriesQuery } from '~/data-provider';
import { MarketplaceProvider } from './MarketplaceContext';
import { useDocumentTitle, useHasAccess } from '~/hooks';
import { TooltipAnchor, Button } from '~/components/ui';
import { SidePanelGroup } from '~/components/SidePanel';
import { OpenSidebar } from '~/components/Chat/Menus';
import { SidePanelProvider, useChatContext } from '~/Providers';
import { NewChatIcon } from '~/components/svg';
import useLocalize from '~/hooks/useLocalize';
import CategoryTabs from './CategoryTabs';
import AgentDetail from './AgentDetail';
import SearchBar from './SearchBar';
import AgentGrid from './AgentGrid';
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
  const queryClient = useQueryClient();
  const { conversation, newConversation } = useChatContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const { category } = useParams();
  const setHideSidePanel = useSetRecoilState(store.hideSidePanel);
  const hideSidePanel = useRecoilValue(store.hideSidePanel);
  const { navVisible, setNavVisible } = useOutletContext<ContextType>();

  // Get URL parameters (default to 'promoted' instead of 'all')
  const activeTab = category || 'promoted';
  const searchQuery = searchParams.get('q') || '';
  const selectedAgentId = searchParams.get('agent_id') || '';

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
   * Handle category tab selection changes
   *
   * @param tabValue - The selected category value
   */
  const handleTabChange = (tabValue: string) => {
    const currentSearchParams = searchParams.toString();
    const searchParamsStr = currentSearchParams ? `?${currentSearchParams}` : '';

    // Navigate to the selected category
    if (tabValue === 'promoted') {
      navigate(`/agents${searchParamsStr}`);
    } else {
      navigate(`/agents/${tabValue}${searchParamsStr}`);
    }
  };

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
      const currentCategory = activeTab;
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
            <main className="flex h-full flex-col overflow-y-auto" role="main">
              {/* Simplified header for agents marketplace - only show nav controls when needed */}
              <div className="sticky top-0 z-10 flex h-14 w-full items-center justify-between bg-white p-2 font-semibold text-text-primary dark:bg-gray-800">
                <div className="mx-1 flex items-center gap-2">
                  {!navVisible && <OpenSidebar setNavVisible={setNavVisible} />}
                  {!navVisible && (
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
                  )}
                </div>
              </div>
              <div className="container mx-auto max-w-4xl px-4 py-8">
                {/* Hero Section - ChatGPT Style */}
                <div className="mb-8 mt-12 text-center">
                  <h1 className="mb-3 text-5xl font-bold tracking-tight text-gray-900 dark:text-white">
                    {localize('com_agents_marketplace')}
                  </h1>
                  <p className="mx-auto mb-6 max-w-2xl text-lg text-gray-600 dark:text-gray-300">
                    {localize('com_agents_marketplace_subtitle')}
                  </p>

                  {/* Search bar */}
                  <div className="mx-auto max-w-2xl">
                    <SearchBar value={searchQuery} onSearch={handleSearch} />
                  </div>
                </div>

                {/* Category tabs */}
                <CategoryTabs
                  categories={categoriesQuery.data || []}
                  activeTab={activeTab}
                  isLoading={categoriesQuery.isLoading}
                  onChange={handleTabChange}
                />

                {/* Category header - only show when not searching */}
                {!searchQuery && (
                  <div className="mb-6">
                    {(() => {
                      // Get category data for display
                      const getCategoryData = () => {
                        if (activeTab === 'promoted') {
                          return {
                            name: localize('com_agents_top_picks'),
                            description: localize('com_agents_recommended'),
                          };
                        }
                        if (activeTab === 'all') {
                          return {
                            name: 'All Agents',
                            description: 'Browse all shared agents across all categories',
                          };
                        }

                        // Find the category in the API data
                        const categoryData = categoriesQuery.data?.find(
                          (cat) => cat.value === activeTab,
                        );
                        if (categoryData) {
                          return {
                            name: categoryData.label,
                            description: categoryData.description || '',
                          };
                        }

                        // Fallback for unknown categories
                        return {
                          name: activeTab.charAt(0).toUpperCase() + activeTab.slice(1),
                          description: '',
                        };
                      };

                      const { name, description } = getCategoryData();

                      return (
                        <div className="text-left">
                          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                            {name}
                          </h2>
                          {description && (
                            <p className="mt-2 text-gray-600 dark:text-gray-300">{description}</p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Agent grid */}
                <AgentGrid
                  category={activeTab}
                  searchQuery={searchQuery}
                  onSelectAgent={handleAgentSelect}
                />
              </div>

              {/* Agent detail dialog */}
              {isDetailOpen && selectedAgent && (
                <AgentDetail
                  agent={selectedAgent}
                  isOpen={isDetailOpen}
                  onClose={handleDetailClose}
                />
              )}
            </main>
          </SidePanelGroup>
        </SidePanelProvider>
      </MarketplaceProvider>
    </div>
  );
};

export default AgentMarketplace;
