import React, { useRef, useCallback, useMemo, useContext, useEffect } from 'react';
import { LayoutGrid } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDrag, useDrop } from 'react-dnd';
import { Skeleton } from '@librechat/client';
import { QueryKeys, dataService, PermissionTypes, Permissions } from 'librechat-data-provider';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import type t from 'librechat-data-provider';
import { useFavorites, useLocalize, useHasAccess, AuthContext } from '~/hooks';
import FavoriteItem from './FavoriteItem';

/** Skeleton placeholder for a favorite item while loading */
const FavoriteItemSkeleton = () => (
  <div className="flex w-full items-center rounded-lg px-3 py-2">
    <Skeleton className="mr-2 h-5 w-5 rounded-full" />
    <Skeleton className="h-4 w-24" />
  </div>
);

interface DraggableFavoriteItemProps {
  id: string;
  index: number;
  moveItem: (dragIndex: number, hoverIndex: number) => void;
  onDrop: () => void;
  children: React.ReactNode;
}

const DraggableFavoriteItem = ({
  id,
  index,
  moveItem,
  onDrop,
  children,
}: DraggableFavoriteItemProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [{ handlerId }, drop] = useDrop<{ index: number; id: string }, unknown, { handlerId: any }>(
    {
      accept: 'favorite-item',
      collect(monitor) {
        return {
          handlerId: monitor.getHandlerId(),
        };
      },
      hover(item, monitor) {
        if (!ref.current) {
          return;
        }
        const dragIndex = item.index;
        const hoverIndex = index;

        if (dragIndex === hoverIndex) {
          return;
        }

        const hoverBoundingRect = ref.current?.getBoundingClientRect();
        const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
        const clientOffset = monitor.getClientOffset();
        if (!clientOffset) {
          return;
        }
        const hoverClientY = clientOffset.y - hoverBoundingRect.top;

        if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
          return;
        }

        if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
          return;
        }

        moveItem(dragIndex, hoverIndex);
        item.index = hoverIndex;
      },
    },
  );

  const [{ isDragging }, drag] = useDrag({
    type: 'favorite-item',
    item: () => {
      return { id, index };
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    end: () => {
      onDrop();
    },
  });

  const opacity = isDragging ? 0 : 1;
  drag(drop(ref));

  return (
    <div ref={ref} style={{ opacity }} data-handler-id={handlerId}>
      {children}
    </div>
  );
};

export default function FavoritesList({
  isSmallScreen,
  toggleNav,
}: {
  isSmallScreen?: boolean;
  toggleNav?: () => void;
}) {
  const navigate = useNavigate();
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const authContext = useContext(AuthContext);
  const { favorites, reorderFavorites, isLoading: isFavoritesLoading } = useFavorites();

  const hasAccessToAgents = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });

  const hasAccessToMarketplace = useHasAccess({
    permissionType: PermissionTypes.MARKETPLACE,
    permission: Permissions.USE,
  });

  // Check if auth is ready (avoid race conditions)
  const authReady =
    authContext?.isAuthenticated !== undefined &&
    (authContext?.isAuthenticated === false || authContext?.user !== undefined);

  // Show agent marketplace when marketplace permission is enabled, auth is ready, and user has access to agents
  const showAgentMarketplace = authReady && hasAccessToAgents && hasAccessToMarketplace;

  const handleAgentMarketplace = useCallback(() => {
    navigate('/agents');
    if (isSmallScreen && toggleNav) {
      toggleNav();
    }
  }, [navigate, isSmallScreen, toggleNav]);

  const agentIds = favorites.map((f) => f.agentId).filter(Boolean) as string[];

  const agentQueries = useQueries({
    queries: agentIds.map((agentId) => ({
      queryKey: [QueryKeys.agent, agentId],
      queryFn: () => dataService.getAgentById({ agent_id: agentId }),
      staleTime: 1000 * 60 * 5,
    })),
  });

  // Check if any agent queries are still loading (not yet fetched)
  const isAgentsLoading = agentIds.length > 0 && agentQueries.some((q) => q.isLoading);

  const agentsMap = useMemo(() => {
    const map: Record<string, t.Agent> = {};

    const addToMap = (agent: t.Agent) => {
      if (agent && agent.id && !map[agent.id]) {
        map[agent.id] = agent;
      }
    };

    const marketplaceData = queryClient.getQueriesData<InfiniteData<t.AgentListResponse>>([
      QueryKeys.marketplaceAgents,
    ]);
    marketplaceData.forEach(([_, data]) => {
      data?.pages.forEach((page) => {
        page.data.forEach(addToMap);
      });
    });

    const agentsListData = queryClient.getQueriesData<t.AgentListResponse>([QueryKeys.agents]);
    agentsListData.forEach(([_, data]) => {
      if (data && Array.isArray(data.data)) {
        data.data.forEach(addToMap);
      }
    });

    agentQueries.forEach((query) => {
      if (query.data) {
        map[query.data.id] = query.data;
      }
    });

    return map;
  }, [agentQueries, queryClient]);

  const draggedFavoritesRef = useRef(favorites);

  const moveItem = useCallback(
    (dragIndex: number, hoverIndex: number) => {
      const newFavorites = [...draggedFavoritesRef.current];
      const [draggedItem] = newFavorites.splice(dragIndex, 1);
      newFavorites.splice(hoverIndex, 0, draggedItem);
      draggedFavoritesRef.current = newFavorites;
      reorderFavorites(newFavorites, false);
    },
    [reorderFavorites],
  );

  const handleDrop = useCallback(() => {
    // Persist the final order using the ref which has the latest state
    reorderFavorites(draggedFavoritesRef.current, true);
  }, [reorderFavorites]);

  // Keep ref in sync when favorites change from external sources
  useEffect(() => {
    draggedFavoritesRef.current = favorites;
  }, [favorites]);

  // Show nothing while favorites are loading to prevent layout shifts
  if (isFavoritesLoading) {
    return null;
  }

  // If no favorites and no marketplace to show, return null
  if (favorites.length === 0 && !showAgentMarketplace) {
    return null;
  }

  return (
    <div className="mb-2 flex flex-col pb-2">
      <div className="mt-1 flex flex-col gap-1">
        {/* Agent Marketplace button */}
        {showAgentMarketplace && (
          <div
            className="group relative flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm text-text-primary hover:bg-surface-active-alt"
            onClick={handleAgentMarketplace}
            data-testid="nav-agents-marketplace-button"
          >
            <div className="flex flex-1 items-center truncate pr-6">
              <div className="mr-2 h-5 w-5">
                <LayoutGrid className="h-5 w-5 text-text-primary" />
              </div>
              <span className="truncate">{localize('com_agents_marketplace')}</span>
            </div>
          </div>
        )}
        {/* Show skeletons for ALL items while agents are still loading */}
        {isAgentsLoading
          ? favorites.map((fav, index) => <FavoriteItemSkeleton key={`skeleton-${index}`} />)
          : favorites.map((fav, index) => {
              if (fav.agentId) {
                const agent = agentsMap[fav.agentId];
                if (!agent) {
                  return null;
                }
                return (
                  <DraggableFavoriteItem
                    key={fav.agentId}
                    id={fav.agentId}
                    index={index}
                    moveItem={moveItem}
                    onDrop={handleDrop}
                  >
                    <FavoriteItem item={agent} type="agent" />
                  </DraggableFavoriteItem>
                );
              } else if (fav.model && fav.endpoint) {
                return (
                  <DraggableFavoriteItem
                    key={`${fav.endpoint}-${fav.model}`}
                    id={`${fav.endpoint}-${fav.model}`}
                    index={index}
                    moveItem={moveItem}
                    onDrop={handleDrop}
                  >
                    <FavoriteItem
                      item={{ model: fav.model, endpoint: fav.endpoint }}
                      type="model"
                    />
                  </DraggableFavoriteItem>
                );
              }
              return null;
            })}
      </div>
    </div>
  );
}
