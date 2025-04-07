import type {
  TAgentsMap,
  TAssistantsMap,
  TEndpointsConfig,
  TModelSpec,
} from 'librechat-data-provider';
import { isAgentsEndpoint, isAssistantsEndpoint } from 'librechat-data-provider';
import React from 'react';
import { Endpoint, SelectedValues } from '~/common';
import SpecIcon from '~/components/Chat/Menus/Endpoints/components/SpecIcon';
import ClaudeIcon from '~/components/svg/ClaudeIcon';
import DeepSeekIcon from '~/components/svg/DeepseekColorIcon';
import GPTIcon from '~/components/svg/GPTIcon';
import GeminiIcon from '~/components/svg/GeminiIcon';
import GrokIcon from '~/components/svg/GrokIcon';
import MetaIcon from '~/components/svg/MetaIcon';
import PerplexityIcon from '~/components/svg/PerplexityIcon';

import type { useLocalize } from '~/hooks';
export function filterItems<
  T extends {
    label: string;
    name?: string;
    value?: string;
    models?: Array<{ name: string; isGlobal?: boolean }>;
  },
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
        if (modelId.name.toLowerCase().includes(searchTermLower)) {
          return true;
        }

        if (isAgentsEndpoint(item.value) && agentsMap && modelId.name in agentsMap) {
          const agentName = agentsMap[modelId.name]?.name;
          return typeof agentName === 'string' && agentName.toLowerCase().includes(searchTermLower);
        }

        if (isAssistantsEndpoint(item.value) && assistantsMap) {
          const endpoint = item.value ?? '';
          const assistant = assistantsMap[endpoint][modelId.name];
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

    if (isAgentsEndpoint(endpoint.value) && agentsMap && agentsMap[modelId]) {
      modelName = agentsMap[modelId].name || modelId;
    } else if (
      isAssistantsEndpoint(endpoint.value) &&
      assistantsMap &&
      assistantsMap[endpoint.value]
    ) {
      const assistant = assistantsMap[endpoint.value][modelId];
      modelName =
        typeof assistant.name === 'string' && assistant.name ? (assistant.name as string) : modelId;
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
    const { showIconInHeader = true } = spec;
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

    if (selectedEndpoint.value === 'OpenRouter' && model.includes('anthropic')) {
      return React.createElement(ClaudeIcon, {
        size: 20,
        className: 'icon-md shrink-0 text-text-primary',
      });
    }

    if (selectedEndpoint.value === 'OpenRouter' && model.includes('openai')) {
      return React.createElement(GPTIcon, {
        size: 20,
        className: 'icon-md shrink-0 text-text-primary',
      });
    }
    if (selectedEndpoint.value === 'OpenRouter' && model.includes('gemini')) {
      return React.createElement(GeminiIcon, {
        size: 20,
        className: 'icon-md shrink-0 text-text-primary',
      });
    }
    if (selectedEndpoint.value === 'OpenRouter' && model.includes('deepseek')) {
      return React.createElement(DeepSeekIcon, {
        size: 20,
        className: 'icon-md shrink-0 text-text-primary',
      });
    }
    if (selectedEndpoint.value === 'OpenRouter' && model.includes('meta-llama')) {
      return React.createElement(MetaIcon, {
        size: 20,
        className: 'icon-md shrink-0 text-text-primary',
      });
    }
    if (selectedEndpoint.value === 'OpenRouter' && model.includes('perplexity')) {
      return React.createElement(PerplexityIcon, {
        size: 20,
        className: 'icon-md shrink-0 text-text-primary',
      });
    } 
    if (selectedEndpoint.value === 'OpenRouter' && model.includes('grok')) {
      return React.createElement(GrokIcon, {
        size: 20,
        className: 'icon-md shrink-0 text-text-primary',
      });
    }

    return null;
  }

  if (endpoint) {
    const selectedEndpoint = mappedEndpoints.find((e) => e.value === endpoint);
    return selectedEndpoint?.icon || null;
  }

  return null;
}

export const getDisplayValue = ({
  localize,
  mappedEndpoints,
  selectedValues,
  modelSpecs,
}: {
  localize: ReturnType<typeof useLocalize>;
  selectedValues: SelectedValues;
  mappedEndpoints: Endpoint[];
  modelSpecs: TModelSpec[];
}) => {
  if (selectedValues.modelSpec) {
    const spec = modelSpecs.find((s) => s.name === selectedValues.modelSpec);
    return spec?.label || spec?.name || localize('com_ui_select_model');
  }

  if (selectedValues.model && selectedValues.endpoint) {
    const endpoint = mappedEndpoints.find((e) => e.value === selectedValues.endpoint);
    if (!endpoint) {
      return localize('com_ui_select_model');
    }

    if (
      isAgentsEndpoint(endpoint.value) &&
      endpoint.agentNames &&
      endpoint.agentNames[selectedValues.model]
    ) {
      return endpoint.agentNames[selectedValues.model];
    }

    return selectedValues.model;
  }

  if (selectedValues.endpoint) {
    const endpoint = mappedEndpoints.find((e) => e.value === selectedValues.endpoint);
    return endpoint?.label || localize('com_ui_select_model');
  }

  return localize('com_ui_select_model');
};
