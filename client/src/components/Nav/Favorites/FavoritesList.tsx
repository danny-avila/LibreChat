import React from 'react';
import { useQueries } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import * as Collapsible from '@radix-ui/react-collapsible';
import { QueryKeys, dataService } from 'librechat-data-provider';
import { useFavorites, useLocalStorage } from '~/hooks';
import FavoriteItem from './FavoriteItem';

export default function FavoritesList() {
  const { favorites } = useFavorites();
  const [isExpanded, setIsExpanded] = useLocalStorage('favoritesExpanded', true);

  const agentQueries = useQueries({
    queries: (favorites.agents || []).map((agentId) => ({
      queryKey: [QueryKeys.agent, agentId],
      queryFn: () => dataService.getAgentById({ agent_id: agentId }),
      staleTime: 1000 * 60 * 5,
    })),
  });

  const favoriteAgents = agentQueries
    .map((query) => query.data)
    .filter((agent) => agent !== undefined);

  const favoriteModels = favorites.models || [];

  if ((favorites.agents || []).length === 0 && (favorites.models || []).length === 0) {
    return null;
  }

  return (
    <Collapsible.Root
      open={isExpanded}
      onOpenChange={setIsExpanded}
      className="flex flex-col py-2"
    >
      <Collapsible.Trigger className="group flex w-full items-center gap-2 px-3 py-1 text-xs font-bold text-text-secondary hover:text-text-primary">
        <ChevronRight className="h-3 w-3 transition-transform duration-200 group-data-[state=open]:rotate-90" />
        <span className="select-none">Favorites</span>
      </Collapsible.Trigger>
      <Collapsible.Content className="collapsible-content">
        <div className="mt-1 flex flex-col gap-1">
          {favoriteAgents.map((agent) => (
            <FavoriteItem key={agent!.id} item={agent!} type="agent" />
          ))}
          {favoriteModels.map((model) => (
            <FavoriteItem key={`${model.endpoint}-${model.model}`} item={model} type="model" />
          ))}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
