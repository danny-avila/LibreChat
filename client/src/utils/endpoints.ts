import {
  defaultEndpoints,
  modularEndpoints,
  EModelEndpoint,
  LocalStorageKeys,
} from 'librechat-data-provider';
import type {
  TEndpointsConfig,
  TConfig,
  TPreset,
  TConversation,
  TModelSpec,
} from 'librechat-data-provider';
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
  const lastConversationSetup = JSON.parse(
    localStorage.getItem(LocalStorageKeys.LAST_CONVO_SETUP) || '{}',
  );
  const lastSelectedModels = JSON.parse(localStorage.getItem(LocalStorageKeys.LAST_MODEL) || '{}');
  if (lastConversationSetup.endpoint === endpoint) {
    lastConversationSetup.model = model;
    localStorage.setItem(LocalStorageKeys.LAST_CONVO_SETUP, JSON.stringify(lastConversationSetup));
  }
  lastSelectedModels[endpoint] = model;
  localStorage.setItem(LocalStorageKeys.LAST_MODEL, JSON.stringify(lastSelectedModels));
}

interface ConversationInitParams {
  conversation: TConversation | null;
  newEndpoint: EModelEndpoint | string;
  endpointsConfig: TEndpointsConfig;
  modularChat?: boolean;
}

interface InitiatedTemplateResult {
  template: Partial<TPreset>;
  shouldSwitch: boolean;
  isExistingConversation: boolean;
  isCurrentModular: boolean;
  isNewModular: boolean;
  newEndpointType: EModelEndpoint | undefined;
}

/** Get the conditional logic for switching conversations */
export function getConvoSwitchLogic(params: ConversationInitParams): InitiatedTemplateResult {
  const { conversation, newEndpoint, endpointsConfig, modularChat } = params;

  const currentEndpoint = conversation?.endpoint;
  const template: Partial<TPreset> = {
    ...conversation,
    endpoint: newEndpoint,
    conversationId: 'new',
  };

  const isAssistantSwitch =
    newEndpoint === EModelEndpoint.assistants &&
    currentEndpoint === EModelEndpoint.assistants &&
    currentEndpoint === newEndpoint;

  const conversationId = conversation?.conversationId;
  const isExistingConversation = !!(conversationId && conversationId !== 'new');

  const currentEndpointType =
    getEndpointField(endpointsConfig, currentEndpoint, 'type') ?? currentEndpoint;
  const newEndpointType =
    getEndpointField(endpointsConfig, newEndpoint, 'type') ??
    (newEndpoint as EModelEndpoint | undefined);

  const hasEndpoint = modularEndpoints.has(currentEndpoint ?? '');
  const hasCurrentEndpointType = modularEndpoints.has(currentEndpointType ?? '');
  const isCurrentModular = hasEndpoint || hasCurrentEndpointType || isAssistantSwitch;

  const hasNewEndpoint = modularEndpoints.has(newEndpoint ?? '');
  const hasNewEndpointType = modularEndpoints.has(newEndpointType ?? '');
  const isNewModular = hasNewEndpoint || hasNewEndpointType || isAssistantSwitch;

  const endpointsMatch = currentEndpoint === newEndpoint;
  const shouldSwitch = endpointsMatch || modularChat || isAssistantSwitch;

  return {
    template,
    shouldSwitch,
    isExistingConversation,
    isCurrentModular,
    newEndpointType,
    isNewModular,
  };
}

/** Gets the default spec by order.
 *
 * First, the admin defined default, then last selected spec, followed by first spec
 */
export function getDefaultModelSpec(modelSpecs: TModelSpec[]) {
  const defaultSpec = modelSpecs.find((spec) => spec.default);
  const lastConvo = JSON.parse(localStorage.getItem(LocalStorageKeys.LAST_CONVO_SETUP) || '{}');
  const lastSelectedSpec = modelSpecs.find((spec) => spec.name === lastConvo.spec);
  return defaultSpec || lastSelectedSpec || modelSpecs[0];
}
