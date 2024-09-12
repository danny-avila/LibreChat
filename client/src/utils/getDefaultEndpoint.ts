import type {
  TConversation,
  TPreset,
  TEndpointsConfig,
  EModelEndpoint,
} from 'librechat-data-provider';
import getLocalStorageItems from './getLocalStorageItems';
import { mapEndpoints } from './endpoints';

type TConvoSetup = Partial<TPreset> | Partial<TConversation>;

type TDefaultEndpoint = { convoSetup: TConvoSetup; endpointsConfig: TEndpointsConfig };

const getEndpointFromSetup = (convoSetup: TConvoSetup, endpointsConfig: TEndpointsConfig) => {
  const { endpoint: targetEndpoint } = convoSetup || {};
  if (targetEndpoint && endpointsConfig?.[targetEndpoint ?? '']) {
    return targetEndpoint;
  } else if (targetEndpoint) {
    console.warn(`Illegal target endpoint ${targetEndpoint} ${endpointsConfig}`);
  }
  return null;
};

const getEndpointFromLocalStorage = (endpointsConfig: TEndpointsConfig) => {
  try {
    const { lastConversationSetup } = getLocalStorageItems();
    const { endpoint } = lastConversationSetup;
    const isDefaultConfig = Object.values(endpointsConfig ?? {}).every((value) => !value);

    if (isDefaultConfig && endpoint) {
      return endpoint;
    }

    if (isDefaultConfig && endpoint) {
      return endpoint;
    }

    return endpoint && endpointsConfig?.[endpoint ?? ''] ? endpoint : null;
  } catch (error) {
    console.error(error);
    return null;
  }
};

const getDefinedEndpoint = (endpointsConfig: TEndpointsConfig) => {
  const endpoints = mapEndpoints(endpointsConfig);
  return endpoints.find((e) =>
    endpointsConfig != null && Object.prototype.hasOwnProperty.call(endpointsConfig, e),
  );
};

const getDefaultEndpoint = ({ convoSetup, endpointsConfig }: TDefaultEndpoint): EModelEndpoint => {
  return (
    getEndpointFromSetup(convoSetup, endpointsConfig) ||
    getEndpointFromLocalStorage(endpointsConfig) ||
    getDefinedEndpoint(endpointsConfig)
  );
};

export default getDefaultEndpoint;
