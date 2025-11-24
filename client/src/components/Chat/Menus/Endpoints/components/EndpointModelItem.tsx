import React from 'react';
import { EarthIcon, Pin, PinOff } from 'lucide-react';
import { isAgentsEndpoint, isAssistantsEndpoint } from 'librechat-data-provider';
import { useModelSelectorContext } from '../ModelSelectorContext';
import { CustomMenuItem as MenuItem } from '../CustomMenu';
import type { Endpoint } from '~/common';
import { useFavorites } from '~/hooks';
import { cn } from '~/utils';

interface EndpointModelItemProps {
  modelId: string | null;
  endpoint: Endpoint;
  isSelected: boolean;
}

export function EndpointModelItem({ modelId, endpoint }: EndpointModelItemProps) {
  const { handleSelectModel } = useModelSelectorContext();
  const { isFavoriteModel, toggleFavoriteModel, isFavoriteAgent, toggleFavoriteAgent } =
    useFavorites();
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

  const isAgent = isAgentsEndpoint(endpoint.value);
  const isFavorite = isAgent
    ? isFavoriteAgent(modelId ?? '')
    : isFavoriteModel(modelId ?? '', endpoint.value);

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (modelId) {
      if (isAgent) {
        toggleFavoriteAgent(modelId);
      } else {
        toggleFavoriteModel({ model: modelId, endpoint: endpoint.value });
      }
    }
  };

  const renderAvatar = () => {
    if (avatarUrl) {
      return (
        <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center overflow-hidden rounded-full">
          <img src={avatarUrl} alt={modelName ?? ''} className="h-full w-full object-cover" />
        </div>
      );
    }
    if (
      (isAgentsEndpoint(endpoint.value) || isAssistantsEndpoint(endpoint.value)) &&
      endpoint.icon
    ) {
      return (
        <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center overflow-hidden rounded-full">
          {endpoint.icon}
        </div>
      );
    }
    return null;
  };

  return (
    <MenuItem
      key={modelId}
      onClick={() => handleSelectModel(endpoint, modelId ?? '')}
      className="group flex w-full cursor-pointer items-center justify-between rounded-lg px-2 text-sm"
    >
      <div className="flex w-full min-w-0 items-center gap-2 px-1 py-1">
        {renderAvatar()}
        <span className="truncate">{modelName}</span>
        {isGlobal && <EarthIcon className="ml-1 size-4 text-surface-submit" />}
      </div>
      <button
        onClick={handleFavoriteClick}
        className={cn(
          'rounded-md p-1 hover:bg-surface-hover',
          isFavorite ? 'visible' : 'invisible group-hover:visible',
        )}
      >
        {isFavorite ? (
          <PinOff className="h-4 w-4 text-text-secondary" />
        ) : (
          <Pin className="h-4 w-4 text-text-secondary" />
        )}
      </button>
    </MenuItem>
  );
}

export function renderEndpointModels(
  endpoint: Endpoint | null,
  models: Array<{ name: string; isGlobal?: boolean }>,
  selectedModel: string | null,
  filteredModels?: string[],
) {
  const modelsToRender = filteredModels || models.map((model) => model.name);

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
