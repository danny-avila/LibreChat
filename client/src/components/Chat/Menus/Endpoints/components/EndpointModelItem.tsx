import React, { useEffect, useState, useCallback, useRef } from 'react';
import { isAgentsEndpoint, isAssistantsEndpoint, QueryKeys } from 'librechat-data-provider';
import type { Endpoint } from '~/common';
import { useModelSelectorContext } from '../ModelSelectorContext';
import { CustomMenuItem as MenuItem } from '../CustomMenu';
import { EarthIcon } from 'lucide-react';

interface EndpointModelItemProps {
  modelId: string | null;
  endpoint: Endpoint;
  isSelected: boolean;
}

export function EndpointModelItem({ modelId, endpoint, isSelected }: EndpointModelItemProps) {
  const { handleSelectModel } = useModelSelectorContext();
  const queryClient: any = (globalThis as any).__REACT_QUERY_CLIENT__;
  const favoritesMap: Record<string, true> | undefined = (endpoint as any).favoriteAgentIds;
  const initialFavorite = Boolean(favoritesMap && modelId && favoritesMap[modelId]);
  const [favorited, setFavorited] = useState<boolean>(initialFavorite);

  useEffect(() => {
    setFavorited(initialFavorite);
  }, [initialFavorite]);

  const favoriteRef = useRef(favorited);
  favoriteRef.current = favorited;

  const refreshFromCache = useCallback(() => {
    if (!modelId) {
      return;
    }
    const latest = queryClient?.getQueryData?.([QueryKeys.user, 'favoriteAgents']) as
      | { favoriteAgents?: string[] }
      | undefined;
    const nextFavorited = latest?.favoriteAgents?.some?.((id) => id === modelId) ?? false;
    if (favoriteRef.current !== nextFavorited) {
      setFavorited(nextFavorited);
    }
  }, [modelId, queryClient]);

  useEffect(() => {
    if (!modelId) {
      return;
    }
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{ id: string; favorited: boolean }>;
      if (customEvent?.detail?.id === modelId) {
        setFavorited(Boolean(customEvent.detail.favorited));
        return;
      }
      refreshFromCache();
    };
    window.addEventListener('favoriteAgentsUpdated', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('favoriteAgentsUpdated', handler);
      window.removeEventListener('storage', handler);
    };
  }, [modelId, refreshFromCache]);

  let isGlobal = false;
  let modelName = modelId;
  const avatarUrl = endpoint?.modelIcons?.[modelId ?? ''] || null;

  // Use custom names if available
  if (endpoint && modelId && isAgentsEndpoint(endpoint.value) && endpoint.agentNames?.[modelId]) {
    modelName = endpoint.agentNames[modelId];

    const modelInfo = endpoint?.models?.find((m) => m.name === modelId);
    isGlobal = modelInfo?.isGlobal ?? false;
  } else if (
    endpoint &&
    modelId &&
    isAssistantsEndpoint(endpoint.value) &&
    endpoint.assistantNames?.[modelId]
  ) {
    modelName = endpoint.assistantNames[modelId];
  }

  return (
    <MenuItem
      key={modelId}
      onClick={() => handleSelectModel(endpoint, modelId ?? '')}
      className="flex w-full cursor-pointer items-center justify-between rounded-lg px-2 text-sm"
    >
      <div className="flex w-full min-w-0 items-center gap-2 px-1 py-1">
        {avatarUrl ? (
          <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center overflow-hidden rounded-full">
            <img src={avatarUrl} alt={modelName ?? ''} className="h-full w-full object-cover" />
          </div>
        ) : (isAgentsEndpoint(endpoint.value) || isAssistantsEndpoint(endpoint.value)) &&
          endpoint.icon ? (
          <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center overflow-hidden rounded-full">
            {endpoint.icon}
          </div>
        ) : null}
        <span className="truncate text-left">{modelName}</span>
        {isGlobal && (
          <EarthIcon className="ml-auto size-4 flex-shrink-0 self-center text-green-400" />
        )}
      </div>
      {isAgentsEndpoint(endpoint.value) && modelId && (
        <button
          role="switch"
          aria-checked={favorited}
          aria-label={favorited ? 'Unfavorite agent' : 'Favorite agent'}
          className="ml-2"
          onClick={async (e) => {
            e.stopPropagation();
            try {
              if (favorited) {
                const { dataService } = await import('librechat-data-provider');
                const res = await dataService.removeFavoriteAgent(modelId);
                queryClient?.setQueryData?.([QueryKeys.user, 'favoriteAgents'], res);
                setFavorited(false);
                try {
                  window.dispatchEvent(
                    new CustomEvent('favoriteAgentsUpdated', {
                      detail: { id: modelId, favorited: false },
                    }),
                  );
                } catch (_err) {
                  void 0;
                }
              } else {
                const { dataService } = await import('librechat-data-provider');
                const res = await dataService.addFavoriteAgent(modelId);
                queryClient?.setQueryData?.([QueryKeys.user, 'favoriteAgents'], res);
                setFavorited(true);
                try {
                  window.dispatchEvent(
                    new CustomEvent('favoriteAgentsUpdated', {
                      detail: { id: modelId, favorited: true },
                    }),
                  );
                } catch (_err) {
                  void 0;
                }
              }
            } catch (_err) {
              // ignore
            }
          }}
        >
          <svg
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            className={`size-5 ${favorited ? 'fill-yellow-400 text-yellow-400' : 'text-text-secondary'}`}
            aria-hidden="true"
          >
            <path
              d="M12 17.27l-5.197 3.084 1.39-5.96L3 9.82l6.02-.52L12 3l2.98 6.3L21 9.82l-5.193 4.574 1.39 5.96z"
              fill="currentColor"
            />
          </svg>
        </button>
      )}
      {isSelected && (
        <div className="flex-shrink-0 self-center">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="block"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12ZM16.0755 7.93219C16.5272 8.25003 16.6356 8.87383 16.3178 9.32549L11.5678 16.0755C11.3931 16.3237 11.1152 16.4792 10.8123 16.4981C10.5093 16.517 10.2142 16.3973 10.0101 16.1727L7.51006 13.4227C7.13855 13.014 7.16867 12.3816 7.57733 12.0101C7.98598 11.6386 8.61843 11.6687 8.98994 12.0773L10.6504 13.9039L14.6822 8.17451C15 7.72284 15.6238 7.61436 16.0755 7.93219Z"
              fill="currentColor"
            />
          </svg>
        </div>
      )}
    </MenuItem>
  );
}

export function renderEndpointModels(
  endpoint: Endpoint | null,
  models: Array<{ name: string; isGlobal?: boolean }>,
  selectedModel: string | null,
  filteredModels?: string[],
) {
  let modelsToRender = filteredModels || models.map((model) => model.name);
  const favoritesMap: Record<string, true> | undefined = (endpoint as any)?.favoriteAgentIds;
  if (favoritesMap) {
    modelsToRender = [...modelsToRender].sort((a, b) => {
      const af = favoritesMap[a] ? 1 : 0;
      const bf = favoritesMap[b] ? 1 : 0;
      if (af !== bf) return bf - af; // favorites first
      return a.localeCompare(b);
    });
  }

  return modelsToRender.map(
    (modelId) =>
      endpoint && (
        <EndpointModelItem
          key={modelId}
          modelId={modelId}
          endpoint={endpoint}
          isSelected={selectedModel === modelId}
        />
      ),
  );
}
