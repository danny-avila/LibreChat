import React, { useRef, useState, useEffect } from 'react';
import { EarthIcon, Pin, PinOff } from 'lucide-react';
import { isAgentsEndpoint, isAssistantsEndpoint } from 'librechat-data-provider';
import { useModelSelectorContext } from '../ModelSelectorContext';
import { CustomMenuItem as MenuItem } from '../CustomMenu';
import { useFavorites, useLocalize } from '~/hooks';
import type { Endpoint } from '~/common';
import { cn } from '~/utils';

interface EndpointModelItemProps {
  modelId: string | null;
  endpoint: Endpoint;
  isSelected: boolean;
}

export function EndpointModelItem({ modelId, endpoint, isSelected }: EndpointModelItemProps) {
  const localize = useLocalize();
  const { handleSelectModel } = useModelSelectorContext();
  const { isFavoriteModel, toggleFavoriteModel, isFavoriteAgent, toggleFavoriteAgent } =
    useFavorites();

  const itemRef = useRef<HTMLDivElement>(null);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const element = itemRef.current;
    if (!element) {
      return;
    }

    const observer = new MutationObserver(() => {
      setIsActive(element.hasAttribute('data-active-item'));
    });

    observer.observe(element, { attributes: true, attributeFilter: ['data-active-item'] });
    setIsActive(element.hasAttribute('data-active-item'));

    return () => observer.disconnect();
  }, []);

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

  const handleFavoriteToggle = () => {
    if (!modelId) {
      return;
    }

    if (isAgent) {
      toggleFavoriteAgent(modelId);
    } else {
      toggleFavoriteModel({ model: modelId, endpoint: endpoint.value });
    }
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleFavoriteToggle();
  };

  const renderAvatar = () => {
    const isAgentOrAssistant =
      isAgentsEndpoint(endpoint.value) || isAssistantsEndpoint(endpoint.value);
    const showEndpointIcon = isAgentOrAssistant && endpoint.icon;

    const getContent = () => {
      if (avatarUrl) {
        return <img src={avatarUrl} alt={modelName ?? ''} className="h-full w-full object-cover" />;
      }
      if (showEndpointIcon) {
        return endpoint.icon;
      }
      return null;
    };

    const content = getContent();
    if (!content) {
      return null;
    }

    return (
      <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center overflow-hidden rounded-full">
        {content}
      </div>
    );
  };

  return (
    <MenuItem
      ref={itemRef}
      onClick={() => handleSelectModel(endpoint, modelId ?? '')}
      className="group flex w-full cursor-pointer items-center justify-between rounded-lg px-2 text-sm"
    >
      <div className="flex w-full min-w-0 items-center gap-2 px-1 py-1">
        {renderAvatar()}
        <span className="truncate">{modelName}</span>
        {isGlobal && <EarthIcon className="ml-1 size-4 text-surface-submit" />}
      </div>
      <button
        tabIndex={isActive ? 0 : -1}
        onClick={handleFavoriteClick}
        aria-label={isFavorite ? localize('com_ui_unpin') : localize('com_ui_pin')}
        className={cn(
          'rounded-md p-1 hover:bg-surface-hover',
          isFavorite ? 'visible' : 'invisible group-hover:visible group-data-[active-item]:visible',
        )}
      >
        {isFavorite ? (
          <PinOff className="h-4 w-4 text-text-secondary" />
        ) : (
          <Pin className="h-4 w-4 text-text-secondary" aria-hidden="true" />
        )}
      </button>
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
  endpointIndex?: number,
) {
  const modelsToRender = filteredModels || models.map((model) => model.name);
  const indexSuffix = endpointIndex != null ? `-${endpointIndex}` : '';

  return modelsToRender.map(
    (modelId, modelIndex) =>
      endpoint && (
        <EndpointModelItem
          key={`${endpoint.value}${indexSuffix}-${modelId}-${modelIndex}`}
          modelId={modelId}
          endpoint={endpoint}
          isSelected={selectedModel === modelId}
        />
      ),
  );
}
