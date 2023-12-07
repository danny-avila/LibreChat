import { atom } from 'recoil';
import { TModelsConfig, EModelEndpoint, openAIModels } from 'librechat-data-provider';

const fitlerAssistantModels = (str: string) => {
  return /gpt-4|gpt-3\\.5/i.test(str) && !/vision|instruct/i.test(str);
};

const modelsConfig = atom<TModelsConfig>({
  key: 'models',
  default: {
    [EModelEndpoint.openAI]: openAIModels,
    [EModelEndpoint.assistant]: openAIModels.filter(fitlerAssistantModels),
    [EModelEndpoint.gptPlugins]: openAIModels,
    [EModelEndpoint.azureOpenAI]: openAIModels,
    [EModelEndpoint.bingAI]: ['BingAI', 'Sydney'],
    [EModelEndpoint.chatGPTBrowser]: ['text-davinci-002-render-sha'],
    [EModelEndpoint.google]: ['chat-bison', 'text-bison', 'codechat-bison'],
    [EModelEndpoint.anthropic]: [
      'claude-1',
      'claude-1-100k',
      'claude-instant-1',
      'claude-instant-1-100k',
      'claude-2',
    ],
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
