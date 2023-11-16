import { atom } from 'recoil';
import { TModelsConfig, EModelEndpoint } from 'librechat-data-provider';
const openAIModels = [
  'gpt-3.5-turbo-16k-0613',
  'gpt-3.5-turbo-16k',
  'gpt-4-1106-preview',
  'gpt-3.5-turbo',
  'gpt-3.5-turbo-1106',
  'gpt-4-vision-preview',
  'gpt-4',
  'gpt-3.5-turbo-instruct-0914',
  'gpt-3.5-turbo-0613',
  'gpt-3.5-turbo-0301',
  'gpt-3.5-turbo-instruct',
  'gpt-4-0613',
  'text-davinci-003',
  'gpt-4-0314',
];

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

export default {
  modelsConfig,
};
