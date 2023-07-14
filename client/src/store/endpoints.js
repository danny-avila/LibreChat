import { atom, selector } from 'recoil';

const endpointsConfig = atom({
  key: 'endpointsConfig',
  default: {
    azureOpenAI: null,
    openAI: null,
    bingAI: null,
    chatGPTBrowser: null,
    gptPlugins: null,
    google: null,
    anthropic: null,
  },
});

const endpointsFilter = selector({
  key: 'endpointsFilter',
  get: ({ get }) => {
    const config = get(endpointsConfig) || {};

    let filter = {};
    for (const key of Object.keys(config)) filter[key] = !!config[key];
    return filter;
  },
});

const availableEndpoints = selector({
  key: 'availableEndpoints',
  get: ({ get }) => {
    const endpoints = ['azureOpenAI', 'openAI', 'chatGPTBrowser', 'gptPlugins', 'bingAI', 'google', 'anthropic'];
    const f = get(endpointsFilter);
    return endpoints.filter((endpoint) => f[endpoint]);
  },
});
// const modelAvailable

export default {
  endpointsConfig,
  endpointsFilter,
  availableEndpoints,
};
