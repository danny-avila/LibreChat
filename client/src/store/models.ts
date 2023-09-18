import { atom } from 'recoil';
import { TModelsConfig } from 'librechat-data-provider';
const openAIModels = [
  'gpt-3.5-turbo',
  'gpt-3.5-turbo-16k',
  'gpt-3.5-turbo-0301',
  'text-davinci-003',
  'gpt-4',
  'gpt-4-0314',
  'gpt-4-0613',
];

const modelsConfig = atom<TModelsConfig>({
  key: 'models',
  default: {
    openAI: openAIModels,
    gptPlugins: openAIModels,
    azureOpenAI: openAIModels,
    bingAI: ['BingAI', 'Sydney'],
    chatGPTBrowser: ['text-davinci-002-render-sha'],
    google: ['chat-bison', 'text-bison', 'codechat-bison'],
    anthropic: [
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
