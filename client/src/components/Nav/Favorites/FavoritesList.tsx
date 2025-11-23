import React, { useRef, useCallback, useMemo } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { QueryKeys, dataService } from 'librechat-data-provider';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import type t from 'librechat-data-provider';
import { useFavorites } from '~/hooks';
import FavoriteItem from './FavoriteItem';

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
  const [{ handlerId }, drop] = useDrop({
    accept: 'favorite-item',
    collect(monitor) {
      return {
        handlerId: monitor.getHandlerId(),
      };
    },
    hover(item: { index: number; id: string }, monitor) {
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
      const hoverClientY = (clientOffset as any).y - hoverBoundingRect.top;

      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
        return;
      }

      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
        return;
      }

      moveItem(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
  });

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

export default function FavoritesList() {
  const queryClient = useQueryClient();
  const { favorites, reorderFavorites, persistFavorites } = useFavorites();

  const agentIds = favorites.map((f) => f.agentId).filter(Boolean) as string[];

  const agentQueries = useQueries({
    queries: agentIds.map((agentId) => ({
      queryKey: [QueryKeys.agent, agentId],
      queryFn: () => dataService.getAgentById({ agent_id: agentId }),
      staleTime: 1000 * 60 * 5,
    })),
  });

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

  const moveItem = useCallback(
    (dragIndex: number, hoverIndex: number) => {
      const newFavorites = [...favorites];
      const [draggedItem] = newFavorites.splice(dragIndex, 1);
      newFavorites.splice(hoverIndex, 0, draggedItem);
      reorderFavorites(newFavorites);
    },
    [favorites, reorderFavorites],
  );

  const handleDrop = useCallback(() => {
    persistFavorites(favorites);
  }, [favorites, persistFavorites]);

  if (favorites.length === 0) {
    return null;
  }

  return (
    <div className="mb-2 flex flex-col pb-2">
      <div className="mt-1 flex flex-col gap-1">
        {favorites.map((fav, index) => {
          if (fav.agentId) {
            const agent = agentsMap[fav.agentId];
            if (!agent) return null;
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
                <FavoriteItem item={fav as any} type="model" />
              </DraggableFavoriteItem>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
