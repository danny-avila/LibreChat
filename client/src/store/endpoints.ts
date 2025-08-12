import { atom, selector } from 'recoil';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TEndpointsConfig } from 'librechat-data-provider';

const isPublic = (window as any).__NO_AUTH_MODE__ === true || import.meta.env.VITE_NO_AUTH_MODE === 'true';
const defaultConfig: TEndpointsConfig = isPublic
  ? {
      [EModelEndpoint.google]: null,
    }
  : {
      [EModelEndpoint.azureOpenAI]: null,
      [EModelEndpoint.azureAssistants]: null,
      [EModelEndpoint.assistants]: null,
      [EModelEndpoint.agents]: null,
      [EModelEndpoint.openAI]: null,
      [EModelEndpoint.chatGPTBrowser]: null,
      [EModelEndpoint.gptPlugins]: null,
      [EModelEndpoint.google]: null,
      [EModelEndpoint.anthropic]: null,
      [EModelEndpoint.custom]: null,
    };

const endpointsConfig = atom<TEndpointsConfig>({
  key: 'endpointsConfig',
  default: defaultConfig,
});

const endpointsQueryEnabled = atom<boolean>({
  key: 'endpointsQueryEnabled',
  default: true,
});

const plugins = selector({
  key: 'plugins',
  get: ({ get }) => {
    const config = get(endpointsConfig) || {};
    return config.gptPlugins?.plugins || {};
  },
});

const endpointsFilter = selector({
  key: 'endpointsFilter',
  get: ({ get }) => {
    const config = get(endpointsConfig) || {};

    const filter = {};
    for (const key of Object.keys(config)) {
      filter[key] = !!config[key];
    }
    return filter;
  },
});

export default {
  plugins,
  endpointsConfig,
  endpointsFilter,
  defaultConfig,
  endpointsQueryEnabled,
};
