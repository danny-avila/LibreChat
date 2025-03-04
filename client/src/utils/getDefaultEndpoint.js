import { getLocalStorageItems } from './localStorage';
import { mapEndpoints } from './endpoints';
const getEndpointFromSetup = (convoSetup, endpointsConfig) => {
    let { endpoint: targetEndpoint = '' } = convoSetup || {};
    targetEndpoint = targetEndpoint ?? '';
    if (targetEndpoint && endpointsConfig?.[targetEndpoint]) {
        return targetEndpoint;
    }
    else if (targetEndpoint) {
        console.warn(`Illegal target endpoint ${targetEndpoint} ${endpointsConfig}`);
    }
    return null;
};
const getEndpointFromLocalStorage = (endpointsConfig) => {
    try {
        const { lastConversationSetup } = getLocalStorageItems();
        const { endpoint } = lastConversationSetup ?? { endpoint: null };
        const isDefaultConfig = Object.values(endpointsConfig ?? {}).every((value) => !value);
        if (isDefaultConfig && endpoint) {
            return endpoint;
        }
        if (isDefaultConfig && endpoint) {
            return endpoint;
        }
        return endpoint && endpointsConfig?.[endpoint] != null ? endpoint : null;
    }
    catch (error) {
        console.error(error);
        return null;
    }
};
const getDefinedEndpoint = (endpointsConfig) => {
    const endpoints = mapEndpoints(endpointsConfig);
    return endpoints.find((e) => Object.hasOwn(endpointsConfig ?? {}, e));
};
const getDefaultEndpoint = ({ convoSetup, endpointsConfig, }) => {
    return (getEndpointFromSetup(convoSetup, endpointsConfig) ||
        getEndpointFromLocalStorage(endpointsConfig) ||
        getDefinedEndpoint(endpointsConfig));
};
export default getDefaultEndpoint;
