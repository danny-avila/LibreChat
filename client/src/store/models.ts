import { atom } from 'recoil';
import { EModelEndpoint, defaultModels } from 'librechat-data-provider';
import type { TModelsConfig } from 'librechat-data-provider';

const fitlerAssistantModels = (str: string) => {
  return /gpt-4|gpt-3\\.5/i.test(str) && !/vision|instruct/i.test(str);
};

const openAIModels = defaultModels[EModelEndpoint.openAI];

const modelsConfig = atom<TModelsConfig>({
  key: 'models',
  default: {
    [EModelEndpoint.openAI]: openAIModels,
    [EModelEndpoint.assistant]: openAIModels.filter(fitlerAssistantModels),
    [EModelEndpoint.gptPlugins]: openAIModels,
    [EModelEndpoint.azureOpenAI]: openAIModels,
    [EModelEndpoint.bingAI]: ['BingAI', 'Sydney'],
    [EModelEndpoint.chatGPTBrowser]: ['text-davinci-002-render-sha'],
    [EModelEndpoint.google]: defaultModels[EModelEndpoint.google],
    [EModelEndpoint.anthropic]: defaultModels[EModelEndpoint.anthropic],
  },
});

const modelsQueryEnabled = atom<boolean>({
  key: 'modelsQueryEnabled',
  default: true,
});

export default {
  modelsConfig,
  modelsQueryEnabled,
};
