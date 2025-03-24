import React from 'react';
import { Bot } from 'lucide-react';
import { EModelEndpoint } from 'librechat-data-provider';
import type {
  TAgentsMap,
  TAssistantsMap,
  TEndpointsConfig,
  TModelSpec,
} from 'librechat-data-provider';
import SpecIcon from '~/components/Chat/Menus/Endpoints/components/SpecIcon';
import { Endpoint, SelectedValues } from '~/common';

export function filterItems<
  T extends { label: string; name?: string; value?: string; models?: string[] },
>(
  items: T[],
  searchValue: string,
  agentsMap: TAgentsMap | undefined,
  assistantsMap: TAssistantsMap | undefined,
): T[] | null {
  const searchTermLower = searchValue.trim().toLowerCase();
  if (!searchTermLower) {
    return null;
  }

  return items.filter((item) => {
    const itemMatches =
      item.label.toLowerCase().includes(searchTermLower) ||
      (item.name && item.name.toLowerCase().includes(searchTermLower)) ||
      (item.value && item.value.toLowerCase().includes(searchTermLower));

    if (itemMatches) {
      return true;
    }

    if (item.models && item.models.length > 0) {
      return item.models.some((modelId) => {
        if (modelId.toLowerCase().includes(searchTermLower)) {
          return true;
        }

        if (item.value === EModelEndpoint.agents && agentsMap && modelId in agentsMap) {
          const agentName = agentsMap[modelId]?.name;
          return typeof agentName === 'string' && agentName.toLowerCase().includes(searchTermLower);
        }

        if (item.value === EModelEndpoint.assistants && assistantsMap && modelId in assistantsMap) {
          const assistant = assistantsMap[modelId][EModelEndpoint.assistants];
          if (assistant && typeof assistant.name === 'string') {
            return assistant.name.toLowerCase().includes(searchTermLower);
          }
          return false;
        }

        return false;
      });
    }

    return false;
  });
}

export function filterModels(
  endpoint: Endpoint,
  models: string[],
  searchValue: string,
  agentsMap: TAgentsMap | undefined,
  assistantsMap: TAssistantsMap | undefined,
): string[] {
  const searchTermLower = searchValue.trim().toLowerCase();
  if (!searchTermLower) {
    return models;
  }

  return models.filter((modelId) => {
    let modelName = modelId;

    if (endpoint.value === EModelEndpoint.agents && agentsMap && agentsMap[modelId]) {
      modelName = agentsMap[modelId].name || modelId;
    } else if (
      endpoint.value === EModelEndpoint.assistants &&
      assistantsMap &&
      assistantsMap[modelId]
    ) {
      modelName =
        typeof assistantsMap[modelId].name === 'string'
          ? (assistantsMap[modelId].name as string)
          : modelId;
    }

    return modelName.toLowerCase().includes(searchTermLower);
  });
}

export function getSelectedIcon({
  mappedEndpoints,
  selectedValues,
  modelSpecs,
  endpointsConfig,
}: {
  mappedEndpoints: Endpoint[];
  selectedValues: SelectedValues;
  modelSpecs: TModelSpec[];
  endpointsConfig: TEndpointsConfig;
}): React.ReactNode | null {
  const { endpoint, model, modelSpec } = selectedValues;

  if (modelSpec) {
    const spec = modelSpecs.find((s) => s.name === modelSpec);
    if (!spec) {
      return null;
    }
    const { showIconInHeader } = spec;
    if (!showIconInHeader) {
      return null;
    }
    return React.createElement(SpecIcon, {
      currentSpec: spec,
      endpointsConfig,
    });
  }

  if (endpoint && model) {
    const selectedEndpoint = mappedEndpoints.find((e) => e.value === endpoint);
    if (!selectedEndpoint) {
      return null;
    }

    if (selectedEndpoint.modelIcons?.[model]) {
      const iconUrl = selectedEndpoint.modelIcons[model];
      return React.createElement(
        'div',
        { className: 'h-5 w-5 overflow-hidden rounded-full' },
        React.createElement('img', {
          src: iconUrl,
          alt: model,
          className: 'h-full w-full object-cover',
        }),
      );
    }

    return (
      selectedEndpoint.icon ||
      React.createElement(Bot, {
        size: 20,
        className: 'icon-md shrink-0 text-text-primary',
      })
    );
  }

  if (endpoint) {
    const selectedEndpoint = mappedEndpoints.find((e) => e.value === endpoint);
    return selectedEndpoint?.icon || null;
  }

  return null;
}
