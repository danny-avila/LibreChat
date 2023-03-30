import { atom, selector } from 'recoil';

const endpointsFilter = atom({
  key: 'endpointsFilter',
  default: {
    azureOpenAI: false,
    openAI: false,
    bingAI: false,
    chatGPTBrowser: false
  }
});

const availableEndpoints = selector({
  key: 'availableEndpoints',
  get: ({ get }) => {
    const endpoints = ['azureOpenAI', 'openAI', 'bingAI', 'chatGPTBrowser'];
    const f = get(endpointsFilter);
    return endpoints.filter(endpoint => f[endpoint]);
  }
});
// const modelAvailable

export default {
  endpointsFilter,
  availableEndpoints
};
