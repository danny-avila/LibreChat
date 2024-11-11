import {
  EModelEndpoint,
  defaultEndpoints,
  modularEndpoints,
  LocalStorageKeys,
  isAgentsEndpoint,
  isAssistantsEndpoint,
} from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';
import type { LocalizeFunction } from '~/common';

export const getAssistantName = ({
  name = '',
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

export const getEndpointsFilter = (endpointsConfig: t.TEndpointsConfig) => {
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
  endpointsConfig: t.TEndpointsConfig,
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

/** Get the specified field from the endpoint config */
export function getEndpointField<K extends keyof t.TConfig>(
  endpointsConfig: t.TEndpointsConfig | undefined,
  endpoint: EModelEndpoint | string | null | undefined,
  property: K,
): t.TConfig[K] | undefined {
  if (!endpointsConfig || endpoint === null || endpoint === undefined) {
    return undefined;
  }

  const config = endpointsConfig[endpoint];
  if (!config) {
    return undefined;
  }

  return config[property];
}

export function mapEndpoints(endpointsConfig: t.TEndpointsConfig) {
  const filter = getEndpointsFilter(endpointsConfig);
  return getAvailableEndpoints(filter, endpointsConfig).sort(
    (a, b) => (endpointsConfig?.[a]?.order ?? 0) - (endpointsConfig?.[b]?.order ?? 0),
  );
}

const firstLocalConvoKey = LocalStorageKeys.LAST_CONVO_SETUP + '_0';

/**
 * Ensures the last selected model stays up to date, as conversation may
 * update without updating last convo setup when same endpoint */
export function updateLastSelectedModel({
  endpoint,
  model = '',
}: {
  endpoint: string;
  model?: string;
}) {
  if (!model) {
    return;
  }
  /* Note: an empty string value is possible */
  const lastConversationSetup = JSON.parse(
    (localStorage.getItem(firstLocalConvoKey) ?? '{}') || '{}',
  );

  if (lastConversationSetup.endpoint === endpoint) {
    lastConversationSetup.model = model;
    localStorage.setItem(firstLocalConvoKey, JSON.stringify(lastConversationSetup));
  }

  const lastSelectedModels = JSON.parse(
    (localStorage.getItem(LocalStorageKeys.LAST_MODEL) ?? '{}') || '{}',
  );
  lastSelectedModels[endpoint] = model;
  localStorage.setItem(LocalStorageKeys.LAST_MODEL, JSON.stringify(lastSelectedModels));
}

interface ConversationInitParams {
  conversation: t.TConversation | null;
  newEndpoint: EModelEndpoint | string | null;
  endpointsConfig: t.TEndpointsConfig;
  modularChat?: boolean;
}

interface InitiatedTemplateResult {
  template: Partial<t.TPreset>;
  shouldSwitch: boolean;
  isExistingConversation: boolean;
  isCurrentModular: boolean;
  isNewModular: boolean;
  newEndpointType: EModelEndpoint | undefined;
}

/** Get the conditional logic for switching conversations */
export function getConvoSwitchLogic(params: ConversationInitParams): InitiatedTemplateResult {
  const { conversation, newEndpoint, endpointsConfig, modularChat = false } = params;

  const currentEndpoint = conversation?.endpoint;
  const template: Partial<t.TPreset> = {
    ...conversation,
    endpoint: newEndpoint,
    conversationId: 'new',
  };

  const isAssistantSwitch =
    isAssistantsEndpoint(newEndpoint) &&
    isAssistantsEndpoint(currentEndpoint) &&
    currentEndpoint === newEndpoint;

  const conversationId = conversation?.conversationId ?? '';
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
export function getDefaultModelSpec(modelSpecs?: t.TModelSpec[]) {
  const defaultSpec = modelSpecs?.find((spec) => spec.default);
  const lastSelectedSpecName = localStorage.getItem(LocalStorageKeys.LAST_SPEC);
  const lastSelectedSpec = modelSpecs?.find((spec) => spec.name === lastSelectedSpecName);
  return defaultSpec || lastSelectedSpec || modelSpecs?.[0];
}

/** Gets the default spec iconURL by order or definition.
 *
 * First, the admin defined default, then last selected spec, followed by first spec
 */
export function getModelSpecIconURL(modelSpec: t.TModelSpec) {
  return modelSpec.iconURL ?? modelSpec.preset.iconURL ?? modelSpec.preset.endpoint ?? '';
}

/** Gets the default frontend-facing endpoint, dependent on iconURL definition.
 *
 * If the iconURL is defined in the endpoint config, use it, otherwise use the endpoint
 */
export function getIconEndpoint({
  endpointsConfig,
  iconURL,
  endpoint,
}: {
  endpointsConfig: t.TEndpointsConfig | undefined;
  iconURL: string | undefined;
  endpoint: string | null | undefined;
}) {
  return (endpointsConfig?.[iconURL ?? ''] ? iconURL ?? endpoint : endpoint) ?? '';
}

/** Gets the key to use for the default endpoint iconURL, as defined by the custom config */
export function getIconKey({
  endpoint,
  endpointType: _eType,
  endpointsConfig,
  endpointIconURL: iconURL,
}: {
  endpoint?: string | null;
  endpointsConfig?: t.TEndpointsConfig | undefined;
  endpointType?: string | null;
  endpointIconURL?: string;
}) {
  const endpointType = _eType ?? getEndpointField(endpointsConfig, endpoint, 'type') ?? '';
  const endpointIconURL = iconURL ?? getEndpointField(endpointsConfig, endpoint, 'iconURL') ?? '';
  if (endpointIconURL && EModelEndpoint[endpointIconURL] != null) {
    return endpointIconURL;
  }
  return endpointType ? 'unknown' : endpoint ?? 'unknown';
}

export const getEntity = ({
  endpoint,
  assistant_id,
  agent_id,
  agentsMap,
  assistantMap,
}: {
  endpoint: EModelEndpoint | string | null | undefined;
  assistant_id: string | undefined;
  agent_id: string | undefined;
  agentsMap: t.TAgentsMap | undefined;
  assistantMap: t.TAssistantsMap | undefined;
}): {
  entity: t.Agent | t.Assistant | undefined | null;
  isAgent: boolean;
  isAssistant: boolean;
} => {
  const isAgent = isAgentsEndpoint(endpoint);
  const isAssistant = isAssistantsEndpoint(endpoint);

  if (isAgent) {
    const agent = agentsMap?.[agent_id ?? ''];
    return { entity: agent, isAgent, isAssistant };
  } else if (isAssistant) {
    const assistant = assistantMap?.[endpoint ?? '']?.[assistant_id ?? ''];
    return { entity: assistant, isAgent, isAssistant };
  }
  return { entity: null, isAgent, isAssistant };
};
