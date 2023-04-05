import { atom } from 'recoil';

// preset structure is as same defination as conversation
// sample structure
// {
//   presetId: 'new',
//   title: 'New Chat',
//   user: null,
//   // endpoint: [azureOpenAI, openAI, bingAI, chatGPTBrowser]
//   endpoint: 'azureOpenAI',
//   // for azureOpenAI, openAI, chatGPTBrowser only
//   model: 'gpt-3.5-turbo',
//   // for azureOpenAI, openAI only
//   chatGptLabel: null,
//   promptPrefix: null,
//   temperature: 1,
//   top_p: 1,
//   presence_penalty: 0,
//   frequency_penalty: 0,
//   // for bingAI only
//   jailbreak: false,
//   toneStyle: null,
//   context: null,
//   systemMessage: null,
// };

// an array of saved presets.
// sample structure
// [preset1, preset2, preset3]
const presets = atom({
  key: 'presets',
  default: []
});

export default {
  presets
};
