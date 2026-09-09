import React, { useEffect, useMemo, useRef } from 'react';
import { useMediaQuery } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import type t from 'librechat-data-provider';
import { useGetEndpointsQuery, useGetAgentCategoriesQuery } from '~/data-provider';
import SortDropdown, { SORT_OPTIONS, DEFAULT_SORT_OPTION } from './SortDropdown';
import { useDocumentTitle, useHasAccess, useLocalize } from '~/hooks';
import MarketplaceAdminSettings from './MarketplaceAdminSettings';
import OpenSidebar from '~/components/Chat/Menus/OpenSidebar';
import { SidePanelGroup } from '~/components/SidePanel';
import MineFilterToggle from './MineFilterToggle';
import CategoryTabs from './CategoryTabs';
import SearchBar from './SearchBar';
import AgentGrid from './AgentGrid';

interface AgentMarketplaceProps {
  className?: string;
}

const AgentMarketplace: React.FC<AgentMarketplaceProps> = ({ className = '' }) => {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { category } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const searchQuery = searchParams.get('q') || '';
  const sort = useMemo<t.AgentSortOption>(() => {
    const value = searchParams.get('sort');
    return SORT_OPTIONS.some((option) => option.value === value)
      ? (value as t.AgentSortOption)
      : DEFAULT_SORT_OPTION;
  }, [searchParams]);
  const mine: 0 | 1 = searchParams.get('mine') === '1' ? 1 : 0;

  useDocumentTitle(`${localize('com_agents_marketplace')} | LibreChat`);
  useGetEndpointsQuery();
  const categoriesQuery = useGetAgentCategoriesQuery({
    staleTime: 1000 * 60 * 15,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
  const defaultCategory = categoriesQuery.data?.some((item) => item.value === 'promoted')
    ? 'promoted'
    : 'all';
  const activeCategory = category || defaultCategory;

  const handleTabChange = (value: string) => {
    if (value === activeCategory) {
      return;
    }
    navigate({
      pathname: value === 'promoted' ? '/agents' : `/agents/${encodeURIComponent(value)}`,
      search: searchParams.toString(),
    });
  };

  const handleSearch = (query: string) => {
    const params = new URLSearchParams(searchParams);
    if (query.trim()) {
      params.set('q', query.trim());
    } else {
      params.delete('q');
    }
    setSearchParams(params);
  };

  const handleSortChange = (value: t.AgentSortOption) => {
    const params = new URLSearchParams(searchParams);
    if (value === DEFAULT_SORT_OPTION) {
      params.delete('sort');
    } else {
      params.set('sort', value);
    }
    setSearchParams(params);
  };

  const handleMineChange = (checked: boolean) => {
    const params = new URLSearchParams(searchParams);
    if (checked) {
      params.set('mine', '1');
    } else {
      params.delete('mine');
    }
    if (checked && activeCategory === 'promoted') {
      navigate({ pathname: '/agents/all', search: params.toString() });
      return;
    }
    setSearchParams(params);
  };

  const hasAccessToMarketplace = useHasAccess({
    permissionType: PermissionTypes.MARKETPLACE,
    permission: Permissions.USE,
  });
  useEffect(() => {
    if (hasAccessToMarketplace) {
      return;
    }
    const timeoutId = setTimeout(() => navigate('/c/new'), 1000);
    return () => clearTimeout(timeoutId);
  }, [hasAccessToMarketplace, navigate]);

  if (!hasAccessToMarketplace) {
    return null;
  }

  return (
    <div className={`relative flex w-full grow overflow-hidden bg-presentation ${className}`}>
      <SidePanelGroup>
        <main
          className="flex h-full min-w-0 flex-col overflow-hidden"
          aria-label={localize('com_agents_marketplace')}
        >
          <div className="shrink-0 border-b border-border-light">
            <div className="flex items-center gap-2 p-3">
              {isSmallScreen && <OpenSidebar className="size-9 shrink-0 rounded-lg" />}
              <SearchBar value={searchQuery} onSearch={handleSearch} className="min-w-0 flex-1" />
              <MarketplaceAdminSettings />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 pb-3">
              <div className="min-w-0 flex-1 basis-full lg:basis-0">
                <CategoryTabs
                  categories={categoriesQuery.data || []}
                  activeTab={activeCategory}
                  isLoading={categoriesQuery.isLoading}
                  onChange={handleTabChange}
                />
              </div>
              <div className="ms-auto flex shrink-0 items-center gap-1.5">
                <MineFilterToggle checked={mine === 1} onCheckedChange={handleMineChange} />
                <SortDropdown value={sort} onChange={handleSortChange} />
              </div>
            </div>
          </div>
          <div
            ref={scrollContainerRef}
            className="scrollbar-gutter-stable min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3"
          >
            <AgentGrid
              key={activeCategory}
              category={activeCategory}
              searchQuery={searchQuery}
              scrollElementRef={scrollContainerRef}
              sort={sort}
              mine={mine}
            />
          </div>
        </main>
      </SidePanelGroup>
    </div>
  );
};

export default AgentMarketplace;
