const premiumModels = [
  // OpenAI Premium Models
  'gpt-3.5-turbo',
  'gpt-3.5-turbo-0125',
  'gpt-3.5-turbo-1106',
  'gpt-3.5-turbo-instruct',
  'gpt-4',
  'gpt-4-vision-preview',
  'gpt-4-0125-preview',
  'gpt-4-turbo-preview',
  'gpt-4-1106-preview',
  'gpt-4o',
  // Anthropic Premium Models
  'claude-2.1',
  'claude-2',
  'claude-instant-1',
  'claude-1.2',
  'claude-1',
  'claude-1-100k',
  'claude-3-opus-20240229',
  'claude-3-sonnet-20240229',
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
  'code-bison',
  'code-bison-32k',
  // SdImage Premium Models
  'Automatic1111',
  'Stable Diffusion XL',
  'SD Open Journey',
  'SD Anything V5',
  'SD Realistic Vision',
];

const isPremiumModel = (model) => {
  return premiumModels.indexOf(model) > -1;
};

module.exports = {
  premiumModels,
  isPremiumModel,
};
