import { EModelEndpoint, defaultEndpoints, modularEndpoints, LocalStorageKeys, isAgentsEndpoint, isAssistantsEndpoint, } from 'librechat-data-provider';
export const getEntityName = ({ name = '', localize, isAgent, }) => {
    if (name && name.length > 0) {
        return name;
    }
    else {
        return isAgent === true ? localize('com_ui_agent') : localize('com_ui_assistant');
    }
};
export const getEndpointsFilter = (endpointsConfig) => {
    const filter = {};
    if (!endpointsConfig) {
        return filter;
    }
    for (const key of Object.keys(endpointsConfig)) {
        filter[key] = !!endpointsConfig[key];
    }
    return filter;
};
export const getAvailableEndpoints = (filter, endpointsConfig) => {
    const defaultSet = new Set(defaultEndpoints);
    const availableEndpoints = [];
    for (const endpoint in endpointsConfig) {
        // Check if endpoint is in the filter or its type is in defaultEndpoints
        if (filter[endpoint] ||
            (endpointsConfig[endpoint]?.type &&
                defaultSet.has(endpointsConfig[endpoint]?.type))) {
            availableEndpoints.push(endpoint);
        }
    }
    return availableEndpoints;
};
/** Get the specified field from the endpoint config */
export function getEndpointField(endpointsConfig, endpoint, property) {
    if (!endpointsConfig || endpoint === null || endpoint === undefined) {
        return undefined;
    }
    const config = endpointsConfig[endpoint];
    if (!config) {
        return undefined;
    }
    return config[property];
}
export function mapEndpoints(endpointsConfig) {
    const filter = getEndpointsFilter(endpointsConfig);
    return getAvailableEndpoints(filter, endpointsConfig).sort((a, b) => (endpointsConfig?.[a]?.order ?? 0) - (endpointsConfig?.[b]?.order ?? 0));
}
const firstLocalConvoKey = LocalStorageKeys.LAST_CONVO_SETUP + '_0';
/**
 * Ensures the last selected model stays up to date, as conversation may
 * update without updating last convo setup when same endpoint */
export function updateLastSelectedModel({ endpoint, model = '', }) {
    if (!model) {
        return;
    }
    /* Note: an empty string value is possible */
    const lastConversationSetup = JSON.parse((localStorage.getItem(firstLocalConvoKey) ?? '{}') || '{}');
    if (lastConversationSetup.endpoint === endpoint) {
        lastConversationSetup.model = model;
        localStorage.setItem(firstLocalConvoKey, JSON.stringify(lastConversationSetup));
    }
    const lastSelectedModels = JSON.parse((localStorage.getItem(LocalStorageKeys.LAST_MODEL) ?? '{}') || '{}');
    lastSelectedModels[endpoint] = model;
    localStorage.setItem(LocalStorageKeys.LAST_MODEL, JSON.stringify(lastSelectedModels));
}
/** Get the conditional logic for switching conversations */
export function getConvoSwitchLogic(params) {
    const { conversation, newEndpoint, endpointsConfig, modularChat = false } = params;
    const currentEndpoint = conversation?.endpoint;
    const template = {
        ...conversation,
        endpoint: newEndpoint,
        conversationId: 'new',
    };
    const isAssistantSwitch = isAssistantsEndpoint(newEndpoint) &&
        isAssistantsEndpoint(currentEndpoint) &&
        currentEndpoint === newEndpoint;
    const conversationId = conversation?.conversationId ?? '';
    const isExistingConversation = !!(conversationId && conversationId !== 'new');
    const currentEndpointType = getEndpointField(endpointsConfig, currentEndpoint, 'type') ?? currentEndpoint;
    const newEndpointType = getEndpointField(endpointsConfig, newEndpoint, 'type') ??
        newEndpoint;
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
export function getDefaultModelSpec(modelSpecs) {
    const defaultSpec = modelSpecs?.find((spec) => spec.default);
    const lastSelectedSpecName = localStorage.getItem(LocalStorageKeys.LAST_SPEC);
    const lastSelectedSpec = modelSpecs?.find((spec) => spec.name === lastSelectedSpecName);
    return defaultSpec || lastSelectedSpec || modelSpecs?.[0];
}
/** Gets the default spec iconURL by order or definition.
 *
 * First, the admin defined default, then last selected spec, followed by first spec
 */
export function getModelSpecIconURL(modelSpec) {
    return modelSpec.iconURL ?? modelSpec.preset.iconURL ?? modelSpec.preset.endpoint ?? '';
}
/** Gets the default frontend-facing endpoint, dependent on iconURL definition.
 *
 * If the iconURL is defined in the endpoint config, use it, otherwise use the endpoint
 */
export function getIconEndpoint({ endpointsConfig, iconURL, endpoint, }) {
    return (endpointsConfig?.[iconURL ?? ''] ? iconURL ?? endpoint : endpoint) ?? '';
}
/** Gets the key to use for the default endpoint iconURL, as defined by the custom config */
export function getIconKey({ endpoint, endpointType: _eType, endpointsConfig, endpointIconURL: iconURL, }) {
    const endpointType = _eType ?? getEndpointField(endpointsConfig, endpoint, 'type') ?? '';
    const endpointIconURL = iconURL ?? getEndpointField(endpointsConfig, endpoint, 'iconURL') ?? '';
    if (endpointIconURL && EModelEndpoint[endpointIconURL] != null) {
        return endpointIconURL;
    }
    return endpointType ? 'unknown' : endpoint ?? 'unknown';
}
export const getEntity = ({ endpoint, assistant_id, agent_id, agentsMap, assistantMap, }) => {
    const isAgent = isAgentsEndpoint(endpoint);
    const isAssistant = isAssistantsEndpoint(endpoint);
    if (isAgent) {
        const agent = agentsMap?.[agent_id ?? ''];
        return { entity: agent, isAgent, isAssistant };
    }
    else if (isAssistant) {
        const assistant = assistantMap?.[endpoint ?? '']?.[assistant_id ?? ''];
        return { entity: assistant, isAgent, isAssistant };
    }
    return { entity: null, isAgent, isAssistant };
};
