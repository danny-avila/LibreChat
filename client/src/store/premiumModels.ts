import { atom } from 'recoil';

// const fitlerAssistantModels = (str: string) => {
//   return /gpt-4|gpt-3\\.5/i.test(str) && !/vision|instruct/i.test(str);
// };

// const openAIModels = defaultModels[EModelEndpoint.openAI];

const premiumModelsConfig = atom<string[]>({
  key: 'premiumModels',
  default: [
    // OpenAI Premium Models
    'gpt-4',
    'gpt-4-32k',
    'gpt-4-vision-preview',
    'gpt-4-0125-preview',
    'gpt-4-turbo-preview',
    'gpt-4-1106-preview',
    // Anthropic Premium Models
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-2.1',
    'claude-2',
    'claude-instant-1',
    'claude-instant-1-100k',
    // Gemini Premium Models
    'gemini-pro',
    'gemini-pro-vision',
    'chat-bison',
    'chat-bison-32k',
    'codechat-bison',
    'codechat-bison-32k',
    'text-bison',
    'text-bison-32k',
    'text-unicorn',
    'code-gecko',
    // SdImage Premium Models
    'AUTOMATIC1111',
    'Stable Diffusion XL',
    'SD Open Journey',
    'SD Anything V5',
    'SD Realistic Vision',
  ],
});

const premiumModelsQueryEnabled = atom<boolean>({
  key: 'premiumModelsQueryEnabled',
  default: true,
});

export default {
  premiumModelsConfig,
  premiumModelsQueryEnabled: premiumModelsQueryEnabled,
};
