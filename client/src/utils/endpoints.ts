import { defaultEndpoints } from 'librechat-data-provider';
import type { EModelEndpoint, TEndpointsConfig, TConfig } from 'librechat-data-provider';
import type { LocalizeFunction } from '~/common';

export const getAssistantName = ({
  name,
  localize,
}: {
  name?: string;
  localize: LocalizeFunction;
}) => {
  if (name && name.length > 0) {
    return name;
  } else {
    return localize('com_ui_assistant');
  }
};

export const getEndpointsFilter = (endpointsConfig: TEndpointsConfig) => {
  const filter: Record<string, boolean> = {};
  if (!endpointsConfig) {
    return filter;
  }
  for (const key of Object.keys(endpointsConfig)) {
    filter[key] = !!endpointsConfig[key];
  }
  return filter;
};

export const getAvailableEndpoints = (
  filter: Record<string, boolean>,
  endpointsConfig: TEndpointsConfig,
) => {
  const defaultSet = new Set(defaultEndpoints);
  const availableEndpoints: EModelEndpoint[] = [];

  for (const endpoint in endpointsConfig) {
    // Check if endpoint is in the filter or its type is in defaultEndpoints
    if (
      filter[endpoint] ||
      (endpointsConfig[endpoint]?.type &&
        defaultSet.has(endpointsConfig[endpoint]?.type as EModelEndpoint))
    ) {
      availableEndpoints.push(endpoint as EModelEndpoint);
    }
  }

  return availableEndpoints;
};

export function getEndpointField<K extends keyof TConfig>(
  endpointsConfig: TEndpointsConfig | undefined,
  endpoint: EModelEndpoint | string | null | undefined,
  property: K,
): TConfig[K] | undefined {
  if (!endpointsConfig || endpoint === null || endpoint === undefined) {
    return undefined;
  }

  const config = endpointsConfig[endpoint];
  if (!config) {
    return undefined;
  }

  return config[property];
}

export function mapEndpoints(endpointsConfig: TEndpointsConfig) {
  const filter = getEndpointsFilter(endpointsConfig);
  return getAvailableEndpoints(filter, endpointsConfig).sort(
    (a, b) => (endpointsConfig?.[a]?.order ?? 0) - (endpointsConfig?.[b]?.order ?? 0),
  );
}

export function updateLastSelectedModel({
  endpoint,
  model,
}: {
  endpoint: string;
  model: string | undefined;
}) {
  if (!model) {
    return;
  }
  const lastConversationSetup = JSON.parse(localStorage.getItem('lastConversationSetup') || '{}');
  const lastSelectedModels = JSON.parse(localStorage.getItem('lastSelectedModel') || '{}');
  if (lastConversationSetup.endpoint === endpoint) {
    lastConversationSetup.model = model;
    localStorage.setItem('lastConversationSetup', JSON.stringify(lastConversationSetup));
  }
  lastSelectedModels[endpoint] = model;
  localStorage.setItem('lastSelectedModel', JSON.stringify(lastSelectedModels));
}
