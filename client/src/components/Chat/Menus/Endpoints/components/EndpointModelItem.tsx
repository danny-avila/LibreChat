import React, { useRef, useState, useEffect } from 'react';
import { VisuallyHidden } from '@ariakit/react';
import { CheckCircle2, EarthIcon, Pin, PinOff } from 'lucide-react';
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
      aria-selected={isSelected || undefined}
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
        <>
          <CheckCircle2 className="size-4 shrink-0 text-text-primary" aria-hidden="true" />
          <VisuallyHidden>{localize('com_a11y_selected')}</VisuallyHidden>
        </>
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
