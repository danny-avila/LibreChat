const { maxTokensMap } = require('@librechat/api');
const { EModelEndpoint } = require('librechat-data-provider');
const {
  defaultRate,
  tokenValues,
  getValueKey,
  getMultiplier,
  cacheTokenValues,
  getCacheMultiplier,
} = require('./tx');

describe('getValueKey', () => {
  it('should return "16k" for model name containing "gpt-3.5-turbo-16k"', () => {
    expect(getValueKey('gpt-3.5-turbo-16k-some-other-info')).toBe('16k');
  });

  it('should return "4k" for model name containing "gpt-3.5"', () => {
    expect(getValueKey('gpt-3.5-some-other-info')).toBe('4k');
  });

  it('should return "32k" for model name containing "gpt-4-32k"', () => {
    expect(getValueKey('gpt-4-32k-some-other-info')).toBe('32k');
  });

  it('should return "8k" for model name containing "gpt-4"', () => {
    expect(getValueKey('gpt-4-some-other-info')).toBe('8k');
  });

  it('should return "gpt-5" for model name containing "gpt-5"', () => {
    expect(getValueKey('gpt-5-some-other-info')).toBe('gpt-5');
    expect(getValueKey('gpt-5-2025-01-30')).toBe('gpt-5');
    expect(getValueKey('gpt-5-2025-01-30-0130')).toBe('gpt-5');
    expect(getValueKey('openai/gpt-5')).toBe('gpt-5');
    expect(getValueKey('openai/gpt-5-2025-01-30')).toBe('gpt-5');
    expect(getValueKey('gpt-5-turbo')).toBe('gpt-5');
    expect(getValueKey('gpt-5-0130')).toBe('gpt-5');
  });

  it('should return "gpt-5.1" for model name containing "gpt-5.1"', () => {
    expect(getValueKey('gpt-5.1')).toBe('gpt-5.1');
    expect(getValueKey('gpt-5.1-chat')).toBe('gpt-5.1');
    expect(getValueKey('gpt-5.1-codex')).toBe('gpt-5.1');
    expect(getValueKey('openai/gpt-5.1')).toBe('gpt-5.1');
  });

  it('should return "gpt-5.2" for model name containing "gpt-5.2"', () => {
    expect(getValueKey('gpt-5.2')).toBe('gpt-5.2');
    expect(getValueKey('gpt-5.2-chat')).toBe('gpt-5.2');
    expect(getValueKey('openai/gpt-5.2')).toBe('gpt-5.2');
  });

  it('should return "gpt-3.5-turbo-1106" for model name containing "gpt-3.5-turbo-1106"', () => {
    expect(getValueKey('gpt-3.5-turbo-1106-some-other-info')).toBe('gpt-3.5-turbo-1106');
    expect(getValueKey('openai/gpt-3.5-turbo-1106')).toBe('gpt-3.5-turbo-1106');
    expect(getValueKey('gpt-3.5-turbo-1106/openai')).toBe('gpt-3.5-turbo-1106');
  });

  it('should return "gpt-4-1106" for model name containing "gpt-4-1106"', () => {
    expect(getValueKey('gpt-4-1106-some-other-info')).toBe('gpt-4-1106');
    expect(getValueKey('gpt-4-1106-vision-preview')).toBe('gpt-4-1106');
    expect(getValueKey('gpt-4-1106-preview')).toBe('gpt-4-1106');
    expect(getValueKey('openai/gpt-4-1106')).toBe('gpt-4-1106');
    expect(getValueKey('gpt-4-1106/openai/')).toBe('gpt-4-1106');
  });

  it('should return "gpt-4-1106" for model type of "gpt-4-1106"', () => {
    expect(getValueKey('gpt-4-vision-preview')).toBe('gpt-4-1106');
    expect(getValueKey('openai/gpt-4-1106')).toBe('gpt-4-1106');
    expect(getValueKey('gpt-4-turbo')).toBe('gpt-4-1106');
    expect(getValueKey('gpt-4-0125')).toBe('gpt-4-1106');
  });

  it('should return "gpt-4.5" for model type of "gpt-4.5"', () => {
    expect(getValueKey('gpt-4.5-preview')).toBe('gpt-4.5');
    expect(getValueKey('gpt-4.5-2024-08-06')).toBe('gpt-4.5');
    expect(getValueKey('gpt-4.5-2024-08-06-0718')).toBe('gpt-4.5');
    expect(getValueKey('openai/gpt-4.5')).toBe('gpt-4.5');
    expect(getValueKey('openai/gpt-4.5-2024-08-06')).toBe('gpt-4.5');
    expect(getValueKey('gpt-4.5-turbo')).toBe('gpt-4.5');
    expect(getValueKey('gpt-4.5-0125')).toBe('gpt-4.5');
  });

  it('should return "gpt-4.1" for model type of "gpt-4.1"', () => {
    expect(getValueKey('gpt-4.1-preview')).toBe('gpt-4.1');
    expect(getValueKey('gpt-4.1-2024-08-06')).toBe('gpt-4.1');
    expect(getValueKey('gpt-4.1-2024-08-06-0718')).toBe('gpt-4.1');
    expect(getValueKey('openai/gpt-4.1')).toBe('gpt-4.1');
    expect(getValueKey('openai/gpt-4.1-2024-08-06')).toBe('gpt-4.1');
    expect(getValueKey('gpt-4.1-turbo')).toBe('gpt-4.1');
    expect(getValueKey('gpt-4.1-0125')).toBe('gpt-4.1');
  });

  it('should return "gpt-4.1-mini" for model type of "gpt-4.1-mini"', () => {
    expect(getValueKey('gpt-4.1-mini-preview')).toBe('gpt-4.1-mini');
    expect(getValueKey('gpt-4.1-mini-2024-08-06')).toBe('gpt-4.1-mini');
    expect(getValueKey('openai/gpt-4.1-mini')).toBe('gpt-4.1-mini');
    expect(getValueKey('gpt-4.1-mini-0125')).toBe('gpt-4.1-mini');
  });

  it('should return "gpt-4.1-nano" for model type of "gpt-4.1-nano"', () => {
    expect(getValueKey('gpt-4.1-nano-preview')).toBe('gpt-4.1-nano');
    expect(getValueKey('gpt-4.1-nano-2024-08-06')).toBe('gpt-4.1-nano');
    expect(getValueKey('openai/gpt-4.1-nano')).toBe('gpt-4.1-nano');
    expect(getValueKey('gpt-4.1-nano-0125')).toBe('gpt-4.1-nano');
  });

  it('should return "gpt-5" for model type of "gpt-5"', () => {
    expect(getValueKey('gpt-5-2025-01-30')).toBe('gpt-5');
    expect(getValueKey('gpt-5-2025-01-30-0130')).toBe('gpt-5');
    expect(getValueKey('openai/gpt-5')).toBe('gpt-5');
    expect(getValueKey('openai/gpt-5-2025-01-30')).toBe('gpt-5');
    expect(getValueKey('gpt-5-turbo')).toBe('gpt-5');
    expect(getValueKey('gpt-5-0130')).toBe('gpt-5');
  });

  it('should return "gpt-5-mini" for model type of "gpt-5-mini"', () => {
    expect(getValueKey('gpt-5-mini-2025-01-30')).toBe('gpt-5-mini');
    expect(getValueKey('openai/gpt-5-mini')).toBe('gpt-5-mini');
    expect(getValueKey('gpt-5-mini-0130')).toBe('gpt-5-mini');
    expect(getValueKey('gpt-5-mini-2025-01-30-0130')).toBe('gpt-5-mini');
  });

  it('should return "gpt-5-nano" for model type of "gpt-5-nano"', () => {
    expect(getValueKey('gpt-5-nano-2025-01-30')).toBe('gpt-5-nano');
    expect(getValueKey('openai/gpt-5-nano')).toBe('gpt-5-nano');
    expect(getValueKey('gpt-5-nano-0130')).toBe('gpt-5-nano');
    expect(getValueKey('gpt-5-nano-2025-01-30-0130')).toBe('gpt-5-nano');
  });

  it('should return "gpt-5-pro" for model type of "gpt-5-pro"', () => {
    expect(getValueKey('gpt-5-pro-2025-01-30')).toBe('gpt-5-pro');
    expect(getValueKey('openai/gpt-5-pro')).toBe('gpt-5-pro');
    expect(getValueKey('gpt-5-pro-0130')).toBe('gpt-5-pro');
    expect(getValueKey('gpt-5-pro-2025-01-30-0130')).toBe('gpt-5-pro');
    expect(getValueKey('gpt-5-pro-preview')).toBe('gpt-5-pro');
  });

  it('should return "gpt-4o" for model type of "gpt-4o"', () => {
    expect(getValueKey('gpt-4o-2024-08-06')).toBe('gpt-4o');
    expect(getValueKey('gpt-4o-2024-08-06-0718')).toBe('gpt-4o');
    expect(getValueKey('openai/gpt-4o')).toBe('gpt-4o');
    expect(getValueKey('openai/gpt-4o-2024-08-06')).toBe('gpt-4o');
    expect(getValueKey('gpt-4o-turbo')).toBe('gpt-4o');
    expect(getValueKey('gpt-4o-0125')).toBe('gpt-4o');
  });

  it('should return "gpt-4o-mini" for model type of "gpt-4o-mini"', () => {
    expect(getValueKey('gpt-4o-mini-2024-07-18')).toBe('gpt-4o-mini');
    expect(getValueKey('openai/gpt-4o-mini')).toBe('gpt-4o-mini');
    expect(getValueKey('gpt-4o-mini-0718')).toBe('gpt-4o-mini');
    expect(getValueKey('gpt-4o-2024-08-06-0718')).not.toBe('gpt-4o-mini');
  });

  it('should return "gpt-4o-2024-05-13" for model type of "gpt-4o-2024-05-13"', () => {
    expect(getValueKey('gpt-4o-2024-05-13')).toBe('gpt-4o-2024-05-13');
    expect(getValueKey('openai/gpt-4o-2024-05-13')).toBe('gpt-4o-2024-05-13');
    expect(getValueKey('gpt-4o-2024-05-13-0718')).toBe('gpt-4o-2024-05-13');
    expect(getValueKey('gpt-4o-2024-05-13-0718')).not.toBe('gpt-4o');
  });

  it('should return "gpt-4o" for model type of "chatgpt-4o"', () => {
    expect(getValueKey('chatgpt-4o-latest')).toBe('gpt-4o');
    expect(getValueKey('openai/chatgpt-4o-latest')).toBe('gpt-4o');
    expect(getValueKey('chatgpt-4o-latest-0916')).toBe('gpt-4o');
    expect(getValueKey('chatgpt-4o-latest-0718')).toBe('gpt-4o');
  });

  it('should return "claude-3-7-sonnet" for model type of "claude-3-7-sonnet-"', () => {
    expect(getValueKey('claude-3-7-sonnet-20240620')).toBe('claude-3-7-sonnet');
    expect(getValueKey('anthropic/claude-3-7-sonnet')).toBe('claude-3-7-sonnet');
    expect(getValueKey('claude-3-7-sonnet-turbo')).toBe('claude-3-7-sonnet');
    expect(getValueKey('claude-3-7-sonnet-0125')).toBe('claude-3-7-sonnet');
  });

  it('should return "claude-3.7-sonnet" for model type of "claude-3.7-sonnet-"', () => {
    expect(getValueKey('claude-3.7-sonnet-20240620')).toBe('claude-3.7-sonnet');
    expect(getValueKey('anthropic/claude-3.7-sonnet')).toBe('claude-3.7-sonnet');
    expect(getValueKey('claude-3.7-sonnet-turbo')).toBe('claude-3.7-sonnet');
    expect(getValueKey('claude-3.7-sonnet-0125')).toBe('claude-3.7-sonnet');
  });

  it('should return "claude-3-5-sonnet" for model type of "claude-3-5-sonnet-"', () => {
    expect(getValueKey('claude-3-5-sonnet-20240620')).toBe('claude-3-5-sonnet');
    expect(getValueKey('anthropic/claude-3-5-sonnet')).toBe('claude-3-5-sonnet');
    expect(getValueKey('claude-3-5-sonnet-turbo')).toBe('claude-3-5-sonnet');
    expect(getValueKey('claude-3-5-sonnet-0125')).toBe('claude-3-5-sonnet');
  });

  it('should return "claude-3.5-sonnet" for model type of "claude-3.5-sonnet-"', () => {
    expect(getValueKey('claude-3.5-sonnet-20240620')).toBe('claude-3.5-sonnet');
    expect(getValueKey('anthropic/claude-3.5-sonnet')).toBe('claude-3.5-sonnet');
    expect(getValueKey('claude-3.5-sonnet-turbo')).toBe('claude-3.5-sonnet');
    expect(getValueKey('claude-3.5-sonnet-0125')).toBe('claude-3.5-sonnet');
  });

  it('should return "claude-3-5-haiku" for model type of "claude-3-5-haiku-"', () => {
    expect(getValueKey('claude-3-5-haiku-20240620')).toBe('claude-3-5-haiku');
    expect(getValueKey('anthropic/claude-3-5-haiku')).toBe('claude-3-5-haiku');
    expect(getValueKey('claude-3-5-haiku-turbo')).toBe('claude-3-5-haiku');
    expect(getValueKey('claude-3-5-haiku-0125')).toBe('claude-3-5-haiku');
  });

  it('should return "claude-3.5-haiku" for model type of "claude-3.5-haiku-"', () => {
    expect(getValueKey('claude-3.5-haiku-20240620')).toBe('claude-3.5-haiku');
    expect(getValueKey('anthropic/claude-3.5-haiku')).toBe('claude-3.5-haiku');
    expect(getValueKey('claude-3.5-haiku-turbo')).toBe('claude-3.5-haiku');
    expect(getValueKey('claude-3.5-haiku-0125')).toBe('claude-3.5-haiku');
  });

  it('should return expected value keys for "gpt-oss" models', () => {
    expect(getValueKey('openai/gpt-oss-120b')).toBe('gpt-oss-120b');
    expect(getValueKey('openai/gpt-oss:120b')).toBe('gpt-oss:120b');
    expect(getValueKey('openai/gpt-oss-570b')).toBe('gpt-oss');
    expect(getValueKey('gpt-oss-570b')).toBe('gpt-oss');
    expect(getValueKey('groq/gpt-oss-1080b')).toBe('gpt-oss');
    expect(getValueKey('gpt-oss-20b')).toBe('gpt-oss-20b');
    expect(getValueKey('oai/gpt-oss:20b')).toBe('gpt-oss:20b');
  });
});

describe('getMultiplier', () => {
  it('should return the correct multiplier for a given valueKey and tokenType', () => {
    expect(getMultiplier({ valueKey: '8k', tokenType: 'prompt' })).toBe(tokenValues['8k'].prompt);
    expect(getMultiplier({ valueKey: '8k', tokenType: 'completion' })).toBe(
      tokenValues['8k'].completion,
    );
  });

  it('should return correct multipliers for o4-mini and o3', () => {
    ['o4-mini', 'o3'].forEach((model) => {
      const prompt = getMultiplier({ model, tokenType: 'prompt' });
      const completion = getMultiplier({ model, tokenType: 'completion' });
      expect(prompt).toBe(tokenValues[model].prompt);
      expect(completion).toBe(tokenValues[model].completion);
    });
  });

  it('should return defaultRate if tokenType is provided but not found in tokenValues', () => {
    expect(getMultiplier({ valueKey: '8k', tokenType: 'unknownType' })).toBe(defaultRate);
  });

  it('should derive the valueKey from the model if not provided', () => {
    expect(getMultiplier({ tokenType: 'prompt', model: 'gpt-4-some-other-info' })).toBe(
      tokenValues['8k'].prompt,
    );
  });

  it('should return 1 if only model or tokenType is missing', () => {
    expect(getMultiplier({ tokenType: 'prompt' })).toBe(1);
    expect(getMultiplier({ model: 'gpt-4-some-other-info' })).toBe(1);
  });

  it('should return the correct multiplier for gpt-3.5-turbo-1106', () => {
    expect(getMultiplier({ valueKey: 'gpt-3.5-turbo-1106', tokenType: 'prompt' })).toBe(
      tokenValues['gpt-3.5-turbo-1106'].prompt,
    );
    expect(getMultiplier({ valueKey: 'gpt-3.5-turbo-1106', tokenType: 'completion' })).toBe(
      tokenValues['gpt-3.5-turbo-1106'].completion,
    );
  });

  it('should return the correct multiplier for gpt-4-1106', () => {
    expect(getMultiplier({ valueKey: 'gpt-4-1106', tokenType: 'prompt' })).toBe(
      tokenValues['gpt-4-1106'].prompt,
    );
    expect(getMultiplier({ valueKey: 'gpt-4-1106', tokenType: 'completion' })).toBe(
      tokenValues['gpt-4-1106'].completion,
    );
  });

  it('should return the correct multiplier for gpt-5', () => {
    const valueKey = getValueKey('gpt-5-2025-01-30');
    expect(getMultiplier({ valueKey, tokenType: 'prompt' })).toBe(tokenValues['gpt-5'].prompt);
    expect(getMultiplier({ valueKey, tokenType: 'completion' })).toBe(
      tokenValues['gpt-5'].completion,
    );
    expect(getMultiplier({ model: 'gpt-5-preview', tokenType: 'prompt' })).toBe(
      tokenValues['gpt-5'].prompt,
    );
    expect(getMultiplier({ model: 'openai/gpt-5', tokenType: 'completion' })).toBe(
      tokenValues['gpt-5'].completion,
    );
  });

  it('should return the correct multiplier for gpt-5-mini', () => {
    const valueKey = getValueKey('gpt-5-mini-2025-01-30');
    expect(getMultiplier({ valueKey, tokenType: 'prompt' })).toBe(tokenValues['gpt-5-mini'].prompt);
    expect(getMultiplier({ valueKey, tokenType: 'completion' })).toBe(
      tokenValues['gpt-5-mini'].completion,
    );
    expect(getMultiplier({ model: 'gpt-5-mini-preview', tokenType: 'prompt' })).toBe(
      tokenValues['gpt-5-mini'].prompt,
    );
    expect(getMultiplier({ model: 'openai/gpt-5-mini', tokenType: 'completion' })).toBe(
      tokenValues['gpt-5-mini'].completion,
    );
  });

  it('should return the correct multiplier for gpt-5-nano', () => {
    const valueKey = getValueKey('gpt-5-nano-2025-01-30');
    expect(getMultiplier({ valueKey, tokenType: 'prompt' })).toBe(tokenValues['gpt-5-nano'].prompt);
    expect(getMultiplier({ valueKey, tokenType: 'completion' })).toBe(
      tokenValues['gpt-5-nano'].completion,
    );
    expect(getMultiplier({ model: 'gpt-5-nano-preview', tokenType: 'prompt' })).toBe(
      tokenValues['gpt-5-nano'].prompt,
    );
    expect(getMultiplier({ model: 'openai/gpt-5-nano', tokenType: 'completion' })).toBe(
      tokenValues['gpt-5-nano'].completion,
    );
  });

  it('should return the correct multiplier for gpt-5-pro', () => {
    const valueKey = getValueKey('gpt-5-pro-2025-01-30');
    expect(getMultiplier({ valueKey, tokenType: 'prompt' })).toBe(tokenValues['gpt-5-pro'].prompt);
    expect(getMultiplier({ valueKey, tokenType: 'completion' })).toBe(
      tokenValues['gpt-5-pro'].completion,
    );
    expect(getMultiplier({ model: 'gpt-5-pro-preview', tokenType: 'prompt' })).toBe(
      tokenValues['gpt-5-pro'].prompt,
    );
    expect(getMultiplier({ model: 'openai/gpt-5-pro', tokenType: 'completion' })).toBe(
      tokenValues['gpt-5-pro'].completion,
    );
  });

  it('should return the correct multiplier for gpt-5.1', () => {
    expect(getMultiplier({ model: 'gpt-5.1', tokenType: 'prompt' })).toBe(
      tokenValues['gpt-5.1'].prompt,
    );
    expect(getMultiplier({ model: 'gpt-5.1', tokenType: 'completion' })).toBe(
      tokenValues['gpt-5.1'].completion,
    );
    expect(getMultiplier({ model: 'openai/gpt-5.1', tokenType: 'prompt' })).toBe(
      tokenValues['gpt-5.1'].prompt,
    );
    expect(tokenValues['gpt-5.1'].prompt).toBe(1.25);
    expect(tokenValues['gpt-5.1'].completion).toBe(10);
  });

  it('should return the correct multiplier for gpt-5.2', () => {
    expect(getMultiplier({ model: 'gpt-5.2', tokenType: 'prompt' })).toBe(
      tokenValues['gpt-5.2'].prompt,
    );
    expect(getMultiplier({ model: 'gpt-5.2', tokenType: 'completion' })).toBe(
      tokenValues['gpt-5.2'].completion,
    );
    expect(getMultiplier({ model: 'openai/gpt-5.2', tokenType: 'prompt' })).toBe(
      tokenValues['gpt-5.2'].prompt,
    );
    expect(tokenValues['gpt-5.2'].prompt).toBe(1.75);
    expect(tokenValues['gpt-5.2'].completion).toBe(14);
  });

  it('should return the correct multiplier for gpt-4o', () => {
    const valueKey = getValueKey('gpt-4o-2024-08-06');
    expect(getMultiplier({ valueKey, tokenType: 'prompt' })).toBe(tokenValues['gpt-4o'].prompt);
    expect(getMultiplier({ valueKey, tokenType: 'completion' })).toBe(
      tokenValues['gpt-4o'].completion,
    );
    expect(getMultiplier({ valueKey, tokenType: 'completion' })).not.toBe(
      tokenValues['gpt-4-1106'].completion,
    );
  });

  it('should return the correct multiplier for gpt-4.1', () => {
    const valueKey = getValueKey('gpt-4.1-2024-08-06');
    expect(getMultiplier({ valueKey, tokenType: 'prompt' })).toBe(tokenValues['gpt-4.1'].prompt);
    expect(getMultiplier({ valueKey, tokenType: 'completion' })).toBe(
      tokenValues['gpt-4.1'].completion,
    );
    expect(getMultiplier({ model: 'gpt-4.1-preview', tokenType: 'prompt' })).toBe(
      tokenValues['gpt-4.1'].prompt,
    );
    expect(getMultiplier({ model: 'openai/gpt-4.1', tokenType: 'completion' })).toBe(
      tokenValues['gpt-4.1'].completion,
    );
  });

  it('should return the correct multiplier for gpt-4.1-mini', () => {
    const valueKey = getValueKey('gpt-4.1-mini-2024-08-06');
    expect(getMultiplier({ valueKey, tokenType: 'prompt' })).toBe(
      tokenValues['gpt-4.1-mini'].prompt,
    );
    expect(getMultiplier({ valueKey, tokenType: 'completion' })).toBe(
      tokenValues['gpt-4.1-mini'].completion,
    );
    expect(getMultiplier({ model: 'gpt-4.1-mini-preview', tokenType: 'prompt' })).toBe(
      tokenValues['gpt-4.1-mini'].prompt,
    );
    expect(getMultiplier({ model: 'openai/gpt-4.1-mini', tokenType: 'completion' })).toBe(
      tokenValues['gpt-4.1-mini'].completion,
    );
  });

  it('should return the correct multiplier for gpt-4.1-nano', () => {
    const valueKey = getValueKey('gpt-4.1-nano-2024-08-06');
    expect(getMultiplier({ valueKey, tokenType: 'prompt' })).toBe(
      tokenValues['gpt-4.1-nano'].prompt,
    );
    expect(getMultiplier({ valueKey, tokenType: 'completion' })).toBe(
      tokenValues['gpt-4.1-nano'].completion,
    );
    expect(getMultiplier({ model: 'gpt-4.1-nano-preview', tokenType: 'prompt' })).toBe(
      tokenValues['gpt-4.1-nano'].prompt,
    );
    expect(getMultiplier({ model: 'openai/gpt-4.1-nano', tokenType: 'completion' })).toBe(
      tokenValues['gpt-4.1-nano'].completion,
    );
  });

  it('should return the correct multiplier for gpt-4o-mini', () => {
    const valueKey = getValueKey('gpt-4o-mini-2024-07-18');
    expect(getMultiplier({ valueKey, tokenType: 'prompt' })).toBe(
      tokenValues['gpt-4o-mini'].prompt,
    );
    expect(getMultiplier({ valueKey, tokenType: 'completion' })).toBe(
      tokenValues['gpt-4o-mini'].completion,
    );
    expect(getMultiplier({ valueKey, tokenType: 'completion' })).not.toBe(
      tokenValues['gpt-4-1106'].completion,
    );
  });

  it('should return the correct multiplier for chatgpt-4o-latest', () => {
    const valueKey = getValueKey('chatgpt-4o-latest');
    expect(getMultiplier({ valueKey, tokenType: 'prompt' })).toBe(tokenValues['gpt-4o'].prompt);
    expect(getMultiplier({ valueKey, tokenType: 'completion' })).toBe(
      tokenValues['gpt-4o'].completion,
    );
    expect(getMultiplier({ valueKey, tokenType: 'completion' })).not.toBe(
      tokenValues['gpt-4o-mini'].completion,
    );
  });

  it('should derive the valueKey from the model if not provided for new models', () => {
    expect(
      getMultiplier({ tokenType: 'prompt', model: 'gpt-3.5-turbo-1106-some-other-info' }),
    ).toBe(tokenValues['gpt-3.5-turbo-1106'].prompt);
    expect(getMultiplier({ tokenType: 'completion', model: 'gpt-4-1106-vision-preview' })).toBe(
      tokenValues['gpt-4-1106'].completion,
    );
    expect(getMultiplier({ tokenType: 'completion', model: 'gpt-4-0125-preview' })).toBe(
      tokenValues['gpt-4-1106'].completion,
    );
    expect(getMultiplier({ tokenType: 'completion', model: 'gpt-4-turbo-vision-preview' })).toBe(
      tokenValues['gpt-4-1106'].completion,
    );
    expect(getMultiplier({ tokenType: 'completion', model: 'gpt-3.5-turbo-0125' })).toBe(
      tokenValues['gpt-3.5-turbo-0125'].completion,
    );
  });

  it('should return defaultRate if derived valueKey does not match any known patterns', () => {
    expect(getMultiplier({ tokenType: 'prompt', model: 'gpt-10-some-other-info' })).toBe(
      defaultRate,
    );
  });

  it('should return correct multipliers for GPT-OSS models', () => {
    const models = ['gpt-oss-20b', 'gpt-oss-120b'];
    models.forEach((key) => {
      const expectedPrompt = tokenValues[key].prompt;
      const expectedCompletion = tokenValues[key].completion;
      expect(getMultiplier({ valueKey: key, tokenType: 'prompt' })).toBe(expectedPrompt);
      expect(getMultiplier({ valueKey: key, tokenType: 'completion' })).toBe(expectedCompletion);
      expect(getMultiplier({ model: key, tokenType: 'prompt' })).toBe(expectedPrompt);
      expect(getMultiplier({ model: key, tokenType: 'completion' })).toBe(expectedCompletion);
    });
  });

  it('should return correct multipliers for GLM models', () => {
    const models = ['glm-4.6', 'glm-4.5v', 'glm-4.5-air', 'glm-4.5', 'glm-4-32b', 'glm-4', 'glm4'];
    models.forEach((key) => {
      const expectedPrompt = tokenValues[key].prompt;
      const expectedCompletion = tokenValues[key].completion;
      expect(getMultiplier({ valueKey: key, tokenType: 'prompt' })).toBe(expectedPrompt);
      expect(getMultiplier({ valueKey: key, tokenType: 'completion' })).toBe(expectedCompletion);
      expect(getMultiplier({ model: key, tokenType: 'prompt' })).toBe(expectedPrompt);
      expect(getMultiplier({ model: key, tokenType: 'completion' })).toBe(expectedCompletion);
    });
  });
});

describe('AWS Bedrock Model Tests', () => {
  const awsModels = [
    'anthropic.claude-3-5-haiku-20241022-v1:0',
    'anthropic.claude-3-haiku-20240307-v1:0',
    'anthropic.claude-3-sonnet-20240229-v1:0',
    'anthropic.claude-3-opus-20240229-v1:0',
    'anthropic.claude-3-5-sonnet-20240620-v1:0',
    'anthropic.claude-v2:1',
    'anthropic.claude-instant-v1',
    'meta.llama2-13b-chat-v1',
    'meta.llama2-70b-chat-v1',
    'meta.llama3-8b-instruct-v1:0',
    'meta.llama3-70b-instruct-v1:0',
    'meta.llama3-1-8b-instruct-v1:0',
    'meta.llama3-1-70b-instruct-v1:0',
    'meta.llama3-1-405b-instruct-v1:0',
    'mistral.mistral-7b-instruct-v0:2',
    'mistral.mistral-small-2402-v1:0',
    'mistral.mixtral-8x7b-instruct-v0:1',
    'mistral.mistral-large-2402-v1:0',
    'mistral.mistral-large-2407-v1:0',
    'cohere.command-text-v14',
    'cohere.command-light-text-v14',
    'cohere.command-r-v1:0',
    'cohere.command-r-plus-v1:0',
    'ai21.j2-mid-v1',
    'ai21.j2-ultra-v1',
    'amazon.titan-text-lite-v1',
    'amazon.titan-text-express-v1',
    'amazon.nova-micro-v1:0',
    'amazon.nova-lite-v1:0',
    'amazon.nova-pro-v1:0',
  ];

  it('should return the correct prompt multipliers for all models', () => {
    const results = awsModels.map((model) => {
      const valueKey = getValueKey(model, EModelEndpoint.bedrock);
      const multiplier = getMultiplier({ valueKey, tokenType: 'prompt' });
      return tokenValues[valueKey].prompt && multiplier === tokenValues[valueKey].prompt;
    });
    expect(results.every(Boolean)).toBe(true);
  });

  it('should return the correct completion multipliers for all models', () => {
    const results = awsModels.map((model) => {
      const valueKey = getValueKey(model, EModelEndpoint.bedrock);
      const multiplier = getMultiplier({ valueKey, tokenType: 'completion' });
      return tokenValues[valueKey].completion && multiplier === tokenValues[valueKey].completion;
    });
    expect(results.every(Boolean)).toBe(true);
  });
});

describe('Amazon Model Tests', () => {
  describe('Amazon Nova Models', () => {
    it('should return correct pricing for nova-premier', () => {
      expect(getMultiplier({ model: 'nova-premier', tokenType: 'prompt' })).toBe(
        tokenValues['nova-premier'].prompt,
      );
      expect(getMultiplier({ model: 'nova-premier', tokenType: 'completion' })).toBe(
        tokenValues['nova-premier'].completion,
      );
      expect(getMultiplier({ model: 'amazon.nova-premier-v1:0', tokenType: 'prompt' })).toBe(
        tokenValues['nova-premier'].prompt,
      );
      expect(getMultiplier({ model: 'amazon.nova-premier-v1:0', tokenType: 'completion' })).toBe(
        tokenValues['nova-premier'].completion,
      );
    });

    it('should return correct pricing for nova-pro', () => {
      expect(getMultiplier({ model: 'nova-pro', tokenType: 'prompt' })).toBe(
        tokenValues['nova-pro'].prompt,
      );
      expect(getMultiplier({ model: 'nova-pro', tokenType: 'completion' })).toBe(
        tokenValues['nova-pro'].completion,
      );
      expect(getMultiplier({ model: 'amazon.nova-pro-v1:0', tokenType: 'prompt' })).toBe(
        tokenValues['nova-pro'].prompt,
      );
      expect(getMultiplier({ model: 'amazon.nova-pro-v1:0', tokenType: 'completion' })).toBe(
        tokenValues['nova-pro'].completion,
      );
    });

    it('should return correct pricing for nova-lite', () => {
      expect(getMultiplier({ model: 'nova-lite', tokenType: 'prompt' })).toBe(
        tokenValues['nova-lite'].prompt,
      );
      expect(getMultiplier({ model: 'nova-lite', tokenType: 'completion' })).toBe(
        tokenValues['nova-lite'].completion,
      );
      expect(getMultiplier({ model: 'amazon.nova-lite-v1:0', tokenType: 'prompt' })).toBe(
        tokenValues['nova-lite'].prompt,
      );
      expect(getMultiplier({ model: 'amazon.nova-lite-v1:0', tokenType: 'completion' })).toBe(
        tokenValues['nova-lite'].completion,
      );
    });

    it('should return correct pricing for nova-micro', () => {
      expect(getMultiplier({ model: 'nova-micro', tokenType: 'prompt' })).toBe(
        tokenValues['nova-micro'].prompt,
      );
      expect(getMultiplier({ model: 'nova-micro', tokenType: 'completion' })).toBe(
        tokenValues['nova-micro'].completion,
      );
      expect(getMultiplier({ model: 'amazon.nova-micro-v1:0', tokenType: 'prompt' })).toBe(
        tokenValues['nova-micro'].prompt,
      );
      expect(getMultiplier({ model: 'amazon.nova-micro-v1:0', tokenType: 'completion' })).toBe(
        tokenValues['nova-micro'].completion,
      );
    });

    it('should match both short and full model names to the same pricing', () => {
      const models = ['nova-micro', 'nova-lite', 'nova-pro', 'nova-premier'];
      const fullModels = [
        'amazon.nova-micro-v1:0',
        'amazon.nova-lite-v1:0',
        'amazon.nova-pro-v1:0',
        'amazon.nova-premier-v1:0',
      ];

      models.forEach((shortModel, i) => {
        const fullModel = fullModels[i];
        const shortPrompt = getMultiplier({ model: shortModel, tokenType: 'prompt' });
        const fullPrompt = getMultiplier({ model: fullModel, tokenType: 'prompt' });
        const shortCompletion = getMultiplier({ model: shortModel, tokenType: 'completion' });
        const fullCompletion = getMultiplier({ model: fullModel, tokenType: 'completion' });

        expect(shortPrompt).toBe(fullPrompt);
        expect(shortCompletion).toBe(fullCompletion);
        expect(shortPrompt).toBe(tokenValues[shortModel].prompt);
        expect(shortCompletion).toBe(tokenValues[shortModel].completion);
      });
    });
  });

  describe('Amazon Titan Models', () => {
    it('should return correct pricing for titan-text-premier', () => {
      expect(getMultiplier({ model: 'titan-text-premier', tokenType: 'prompt' })).toBe(
        tokenValues['titan-text-premier'].prompt,
      );
      expect(getMultiplier({ model: 'titan-text-premier', tokenType: 'completion' })).toBe(
        tokenValues['titan-text-premier'].completion,
      );
      expect(getMultiplier({ model: 'amazon.titan-text-premier-v1:0', tokenType: 'prompt' })).toBe(
        tokenValues['titan-text-premier'].prompt,
      );
      expect(
        getMultiplier({ model: 'amazon.titan-text-premier-v1:0', tokenType: 'completion' }),
      ).toBe(tokenValues['titan-text-premier'].completion);
    });

    it('should return correct pricing for titan-text-express', () => {
      expect(getMultiplier({ model: 'titan-text-express', tokenType: 'prompt' })).toBe(
        tokenValues['titan-text-express'].prompt,
      );
      expect(getMultiplier({ model: 'titan-text-express', tokenType: 'completion' })).toBe(
        tokenValues['titan-text-express'].completion,
      );
      expect(getMultiplier({ model: 'amazon.titan-text-express-v1', tokenType: 'prompt' })).toBe(
        tokenValues['titan-text-express'].prompt,
      );
      expect(
        getMultiplier({ model: 'amazon.titan-text-express-v1', tokenType: 'completion' }),
      ).toBe(tokenValues['titan-text-express'].completion);
    });

    it('should return correct pricing for titan-text-lite', () => {
      expect(getMultiplier({ model: 'titan-text-lite', tokenType: 'prompt' })).toBe(
        tokenValues['titan-text-lite'].prompt,
      );
      expect(getMultiplier({ model: 'titan-text-lite', tokenType: 'completion' })).toBe(
        tokenValues['titan-text-lite'].completion,
      );
      expect(getMultiplier({ model: 'amazon.titan-text-lite-v1', tokenType: 'prompt' })).toBe(
        tokenValues['titan-text-lite'].prompt,
      );
      expect(getMultiplier({ model: 'amazon.titan-text-lite-v1', tokenType: 'completion' })).toBe(
        tokenValues['titan-text-lite'].completion,
      );
    });

    it('should match both short and full model names to the same pricing', () => {
      const models = ['titan-text-lite', 'titan-text-express', 'titan-text-premier'];
      const fullModels = [
        'amazon.titan-text-lite-v1',
        'amazon.titan-text-express-v1',
        'amazon.titan-text-premier-v1:0',
      ];

      models.forEach((shortModel, i) => {
        const fullModel = fullModels[i];
        const shortPrompt = getMultiplier({ model: shortModel, tokenType: 'prompt' });
        const fullPrompt = getMultiplier({ model: fullModel, tokenType: 'prompt' });
        const shortCompletion = getMultiplier({ model: shortModel, tokenType: 'completion' });
        const fullCompletion = getMultiplier({ model: fullModel, tokenType: 'completion' });

        expect(shortPrompt).toBe(fullPrompt);
        expect(shortCompletion).toBe(fullCompletion);
        expect(shortPrompt).toBe(tokenValues[shortModel].prompt);
        expect(shortCompletion).toBe(tokenValues[shortModel].completion);
      });
    });
  });
});

describe('AI21 Model Tests', () => {
  describe('AI21 J2 Models', () => {
    it('should return correct pricing for j2-mid', () => {
      expect(getMultiplier({ model: 'j2-mid', tokenType: 'prompt' })).toBe(
        tokenValues['j2-mid'].prompt,
      );
      expect(getMultiplier({ model: 'j2-mid', tokenType: 'completion' })).toBe(
        tokenValues['j2-mid'].completion,
      );
      expect(getMultiplier({ model: 'ai21.j2-mid-v1', tokenType: 'prompt' })).toBe(
        tokenValues['j2-mid'].prompt,
      );
      expect(getMultiplier({ model: 'ai21.j2-mid-v1', tokenType: 'completion' })).toBe(
        tokenValues['j2-mid'].completion,
      );
    });

    it('should return correct pricing for j2-ultra', () => {
      expect(getMultiplier({ model: 'j2-ultra', tokenType: 'prompt' })).toBe(
        tokenValues['j2-ultra'].prompt,
      );
      expect(getMultiplier({ model: 'j2-ultra', tokenType: 'completion' })).toBe(
        tokenValues['j2-ultra'].completion,
      );
      expect(getMultiplier({ model: 'ai21.j2-ultra-v1', tokenType: 'prompt' })).toBe(
        tokenValues['j2-ultra'].prompt,
      );
      expect(getMultiplier({ model: 'ai21.j2-ultra-v1', tokenType: 'completion' })).toBe(
        tokenValues['j2-ultra'].completion,
      );
    });

    it('should match both short and full model names to the same pricing', () => {
      const models = ['j2-mid', 'j2-ultra'];
      const fullModels = ['ai21.j2-mid-v1', 'ai21.j2-ultra-v1'];

      models.forEach((shortModel, i) => {
        const fullModel = fullModels[i];
        const shortPrompt = getMultiplier({ model: shortModel, tokenType: 'prompt' });
        const fullPrompt = getMultiplier({ model: fullModel, tokenType: 'prompt' });
        const shortCompletion = getMultiplier({ model: shortModel, tokenType: 'completion' });
        const fullCompletion = getMultiplier({ model: fullModel, tokenType: 'completion' });

        expect(shortPrompt).toBe(fullPrompt);
        expect(shortCompletion).toBe(fullCompletion);
        expect(shortPrompt).toBe(tokenValues[shortModel].prompt);
        expect(shortCompletion).toBe(tokenValues[shortModel].completion);
      });
    });
  });

  describe('AI21 Jamba Models', () => {
    it('should return correct pricing for jamba-instruct', () => {
      expect(getMultiplier({ model: 'jamba-instruct', tokenType: 'prompt' })).toBe(
        tokenValues['jamba-instruct'].prompt,
      );
      expect(getMultiplier({ model: 'jamba-instruct', tokenType: 'completion' })).toBe(
        tokenValues['jamba-instruct'].completion,
      );
      expect(getMultiplier({ model: 'ai21.jamba-instruct-v1:0', tokenType: 'prompt' })).toBe(
        tokenValues['jamba-instruct'].prompt,
      );
      expect(getMultiplier({ model: 'ai21.jamba-instruct-v1:0', tokenType: 'completion' })).toBe(
        tokenValues['jamba-instruct'].completion,
      );
    });

    it('should match both short and full model names to the same pricing', () => {
      const shortPrompt = getMultiplier({ model: 'jamba-instruct', tokenType: 'prompt' });
      const fullPrompt = getMultiplier({
        model: 'ai21.jamba-instruct-v1:0',
        tokenType: 'prompt',
      });
      const shortCompletion = getMultiplier({ model: 'jamba-instruct', tokenType: 'completion' });
      const fullCompletion = getMultiplier({
        model: 'ai21.jamba-instruct-v1:0',
        tokenType: 'completion',
      });

      expect(shortPrompt).toBe(fullPrompt);
      expect(shortCompletion).toBe(fullCompletion);
      expect(shortPrompt).toBe(tokenValues['jamba-instruct'].prompt);
      expect(shortCompletion).toBe(tokenValues['jamba-instruct'].completion);
    });
  });
});

describe('Deepseek Model Tests', () => {
  const deepseekModels = ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner', 'deepseek.r1'];

  it('should return the correct prompt multipliers for all models', () => {
    const results = deepseekModels.map((model) => {
      const valueKey = getValueKey(model);
      const multiplier = getMultiplier({ valueKey, tokenType: 'prompt' });
      return tokenValues[valueKey].prompt && multiplier === tokenValues[valueKey].prompt;
    });
    expect(results.every(Boolean)).toBe(true);
  });

  it('should return the correct completion multipliers for all models', () => {
    const results = deepseekModels.map((model) => {
      const valueKey = getValueKey(model);
      const multiplier = getMultiplier({ valueKey, tokenType: 'completion' });
      return tokenValues[valueKey].completion && multiplier === tokenValues[valueKey].completion;
    });
    expect(results.every(Boolean)).toBe(true);
  });

  it('should return the correct prompt multipliers for reasoning model', () => {
    const model = 'deepseek-reasoner';
    const valueKey = getValueKey(model);
    expect(valueKey).toBe(model);
    const multiplier = getMultiplier({ valueKey, tokenType: 'prompt' });
    const result = tokenValues[valueKey].prompt && multiplier === tokenValues[valueKey].prompt;
    expect(result).toBe(true);
  });

  it('should return correct pricing for deepseek-chat', () => {
    expect(getMultiplier({ model: 'deepseek-chat', tokenType: 'prompt' })).toBe(
      tokenValues['deepseek-chat'].prompt,
    );
    expect(getMultiplier({ model: 'deepseek-chat', tokenType: 'completion' })).toBe(
      tokenValues['deepseek-chat'].completion,
    );
    expect(tokenValues['deepseek-chat'].prompt).toBe(0.28);
    expect(tokenValues['deepseek-chat'].completion).toBe(0.42);
  });

  it('should return correct pricing for deepseek-reasoner', () => {
    expect(getMultiplier({ model: 'deepseek-reasoner', tokenType: 'prompt' })).toBe(
      tokenValues['deepseek-reasoner'].prompt,
    );
    expect(getMultiplier({ model: 'deepseek-reasoner', tokenType: 'completion' })).toBe(
      tokenValues['deepseek-reasoner'].completion,
    );
    expect(tokenValues['deepseek-reasoner'].prompt).toBe(0.28);
    expect(tokenValues['deepseek-reasoner'].completion).toBe(0.42);
  });

  it('should handle DeepSeek model name variations with provider prefixes', () => {
    const modelVariations = [
      'deepseek/deepseek-chat',
      'openrouter/deepseek-chat',
      'deepseek/deepseek-reasoner',
    ];

    modelVariations.forEach((model) => {
      const promptMultiplier = getMultiplier({ model, tokenType: 'prompt' });
      const completionMultiplier = getMultiplier({ model, tokenType: 'completion' });
      expect(promptMultiplier).toBe(0.28);
      expect(completionMultiplier).toBe(0.42);
    });
  });

  it('should return correct cache multipliers for DeepSeek models', () => {
    expect(getCacheMultiplier({ model: 'deepseek-chat', cacheType: 'write' })).toBe(
      cacheTokenValues['deepseek-chat'].write,
    );
    expect(getCacheMultiplier({ model: 'deepseek-chat', cacheType: 'read' })).toBe(
      cacheTokenValues['deepseek-chat'].read,
    );
    expect(getCacheMultiplier({ model: 'deepseek-reasoner', cacheType: 'write' })).toBe(
      cacheTokenValues['deepseek-reasoner'].write,
    );
    expect(getCacheMultiplier({ model: 'deepseek-reasoner', cacheType: 'read' })).toBe(
      cacheTokenValues['deepseek-reasoner'].read,
    );
  });

  it('should return correct cache pricing values for DeepSeek models', () => {
    expect(cacheTokenValues['deepseek-chat'].write).toBe(0.28);
    expect(cacheTokenValues['deepseek-chat'].read).toBe(0.028);
    expect(cacheTokenValues['deepseek-reasoner'].write).toBe(0.28);
    expect(cacheTokenValues['deepseek-reasoner'].read).toBe(0.028);
    expect(cacheTokenValues['deepseek'].write).toBe(0.28);
    expect(cacheTokenValues['deepseek'].read).toBe(0.028);
  });

  it('should handle DeepSeek cache multipliers with model variations', () => {
    const modelVariations = ['deepseek/deepseek-chat', 'openrouter/deepseek-reasoner'];

    modelVariations.forEach((model) => {
      const writeMultiplier = getCacheMultiplier({ model, cacheType: 'write' });
      const readMultiplier = getCacheMultiplier({ model, cacheType: 'read' });
      expect(writeMultiplier).toBe(0.28);
      expect(readMultiplier).toBe(0.028);
    });
  });
});

describe('Qwen3 Model Tests', () => {
  describe('Qwen3 Base Models', () => {
    it('should return correct pricing for qwen3 base pattern', () => {
      expect(getMultiplier({ model: 'qwen3', tokenType: 'prompt' })).toBe(
        tokenValues['qwen3'].prompt,
      );
      expect(getMultiplier({ model: 'qwen3', tokenType: 'completion' })).toBe(
        tokenValues['qwen3'].completion,
      );
    });

    it('should return correct pricing for qwen3-4b (falls back to qwen3)', () => {
      expect(getMultiplier({ model: 'qwen3-4b', tokenType: 'prompt' })).toBe(
        tokenValues['qwen3'].prompt,
      );
      expect(getMultiplier({ model: 'qwen3-4b', tokenType: 'completion' })).toBe(
        tokenValues['qwen3'].completion,
      );
    });

    it('should return correct pricing for qwen3-8b', () => {
      expect(getMultiplier({ model: 'qwen3-8b', tokenType: 'prompt' })).toBe(
        tokenValues['qwen3-8b'].prompt,
      );
      expect(getMultiplier({ model: 'qwen3-8b', tokenType: 'completion' })).toBe(
        tokenValues['qwen3-8b'].completion,
      );
    });

    it('should return correct pricing for qwen3-14b', () => {
      expect(getMultiplier({ model: 'qwen3-14b', tokenType: 'prompt' })).toBe(
        tokenValues['qwen3-14b'].prompt,
      );
      expect(getMultiplier({ model: 'qwen3-14b', tokenType: 'completion' })).toBe(
        tokenValues['qwen3-14b'].completion,
      );
    });

    it('should return correct pricing for qwen3-235b-a22b', () => {
      expect(getMultiplier({ model: 'qwen3-235b-a22b', tokenType: 'prompt' })).toBe(
        tokenValues['qwen3-235b-a22b'].prompt,
      );
      expect(getMultiplier({ model: 'qwen3-235b-a22b', tokenType: 'completion' })).toBe(
        tokenValues['qwen3-235b-a22b'].completion,
      );
    });

    it('should handle model name variations with provider prefixes', () => {
      const models = [
        { input: 'qwen3', expected: 'qwen3' },
        { input: 'qwen3-4b', expected: 'qwen3' },
        { input: 'qwen3-8b', expected: 'qwen3-8b' },
        { input: 'qwen3-32b', expected: 'qwen3-32b' },
      ];
      models.forEach(({ input, expected }) => {
        const withPrefix = `alibaba/${input}`;
        expect(getMultiplier({ model: withPrefix, tokenType: 'prompt' })).toBe(
          tokenValues[expected].prompt,
        );
        expect(getMultiplier({ model: withPrefix, tokenType: 'completion' })).toBe(
          tokenValues[expected].completion,
        );
      });
    });
  });

  describe('Qwen3 VL (Vision-Language) Models', () => {
    it('should return correct pricing for qwen3-vl-8b-thinking', () => {
      expect(getMultiplier({ model: 'qwen3-vl-8b-thinking', tokenType: 'prompt' })).toBe(
        tokenValues['qwen3-vl-8b-thinking'].prompt,
      );
      expect(getMultiplier({ model: 'qwen3-vl-8b-thinking', tokenType: 'completion' })).toBe(
        tokenValues['qwen3-vl-8b-thinking'].completion,
      );
    });

    it('should return correct pricing for qwen3-vl-8b-instruct', () => {
      expect(getMultiplier({ model: 'qwen3-vl-8b-instruct', tokenType: 'prompt' })).toBe(
        tokenValues['qwen3-vl-8b-instruct'].prompt,
      );
      expect(getMultiplier({ model: 'qwen3-vl-8b-instruct', tokenType: 'completion' })).toBe(
        tokenValues['qwen3-vl-8b-instruct'].completion,
      );
    });

    it('should return correct pricing for qwen3-vl-30b-a3b', () => {
      expect(getMultiplier({ model: 'qwen3-vl-30b-a3b', tokenType: 'prompt' })).toBe(
        tokenValues['qwen3-vl-30b-a3b'].prompt,
      );
      expect(getMultiplier({ model: 'qwen3-vl-30b-a3b', tokenType: 'completion' })).toBe(
        tokenValues['qwen3-vl-30b-a3b'].completion,
      );
    });

    it('should return correct pricing for qwen3-vl-235b-a22b', () => {
      expect(getMultiplier({ model: 'qwen3-vl-235b-a22b', tokenType: 'prompt' })).toBe(
        tokenValues['qwen3-vl-235b-a22b'].prompt,
      );
      expect(getMultiplier({ model: 'qwen3-vl-235b-a22b', tokenType: 'completion' })).toBe(
        tokenValues['qwen3-vl-235b-a22b'].completion,
      );
    });
  });

  describe('Qwen3 Specialized Models', () => {
    it('should return correct pricing for qwen3-max', () => {
      expect(getMultiplier({ model: 'qwen3-max', tokenType: 'prompt' })).toBe(
        tokenValues['qwen3-max'].prompt,
      );
      expect(getMultiplier({ model: 'qwen3-max', tokenType: 'completion' })).toBe(
        tokenValues['qwen3-max'].completion,
      );
    });

    it('should return correct pricing for qwen3-coder', () => {
      expect(getMultiplier({ model: 'qwen3-coder', tokenType: 'prompt' })).toBe(
        tokenValues['qwen3-coder'].prompt,
      );
      expect(getMultiplier({ model: 'qwen3-coder', tokenType: 'completion' })).toBe(
        tokenValues['qwen3-coder'].completion,
      );
    });

    it('should return correct pricing for qwen3-coder-plus', () => {
      expect(getMultiplier({ model: 'qwen3-coder-plus', tokenType: 'prompt' })).toBe(
        tokenValues['qwen3-coder-plus'].prompt,
      );
      expect(getMultiplier({ model: 'qwen3-coder-plus', tokenType: 'completion' })).toBe(
        tokenValues['qwen3-coder-plus'].completion,
      );
    });

    it('should return correct pricing for qwen3-coder-flash', () => {
      expect(getMultiplier({ model: 'qwen3-coder-flash', tokenType: 'prompt' })).toBe(
        tokenValues['qwen3-coder-flash'].prompt,
      );
      expect(getMultiplier({ model: 'qwen3-coder-flash', tokenType: 'completion' })).toBe(
        tokenValues['qwen3-coder-flash'].completion,
      );
    });

    it('should return correct pricing for qwen3-next-80b-a3b', () => {
      expect(getMultiplier({ model: 'qwen3-next-80b-a3b', tokenType: 'prompt' })).toBe(
        tokenValues['qwen3-next-80b-a3b'].prompt,
      );
      expect(getMultiplier({ model: 'qwen3-next-80b-a3b', tokenType: 'completion' })).toBe(
        tokenValues['qwen3-next-80b-a3b'].completion,
      );
    });
  });

  describe('Qwen3 Model Variations', () => {
    it('should handle all qwen3 models with provider prefixes', () => {
      const models = ['qwen3', 'qwen3-8b', 'qwen3-max', 'qwen3-coder', 'qwen3-vl-8b-instruct'];
      const prefixes = ['alibaba', 'qwen', 'openrouter'];

      models.forEach((model) => {
        prefixes.forEach((prefix) => {
          const fullModel = `${prefix}/${model}`;
          expect(getMultiplier({ model: fullModel, tokenType: 'prompt' })).toBe(
            tokenValues[model].prompt,
          );
          expect(getMultiplier({ model: fullModel, tokenType: 'completion' })).toBe(
            tokenValues[model].completion,
          );
        });
      });
    });

    it('should handle qwen3-4b falling back to qwen3 base pattern', () => {
      const testCases = ['qwen3-4b', 'alibaba/qwen3-4b', 'qwen/qwen3-4b-preview'];
      testCases.forEach((model) => {
        expect(getMultiplier({ model, tokenType: 'prompt' })).toBe(tokenValues['qwen3'].prompt);
        expect(getMultiplier({ model, tokenType: 'completion' })).toBe(
          tokenValues['qwen3'].completion,
        );
      });
    });
  });
});

describe('getCacheMultiplier', () => {
  it('should return the correct cache multiplier for a given valueKey and cacheType', () => {
    expect(getCacheMultiplier({ valueKey: 'claude-3-5-sonnet', cacheType: 'write' })).toBe(
      cacheTokenValues['claude-3-5-sonnet'].write,
    );
    expect(getCacheMultiplier({ valueKey: 'claude-3-5-sonnet', cacheType: 'read' })).toBe(
      cacheTokenValues['claude-3-5-sonnet'].read,
    );
    expect(getCacheMultiplier({ valueKey: 'claude-3-5-haiku', cacheType: 'write' })).toBe(
      cacheTokenValues['claude-3-5-haiku'].write,
    );
    expect(getCacheMultiplier({ valueKey: 'claude-3-5-haiku', cacheType: 'read' })).toBe(
      cacheTokenValues['claude-3-5-haiku'].read,
    );
    expect(getCacheMultiplier({ valueKey: 'claude-3-haiku', cacheType: 'write' })).toBe(
      cacheTokenValues['claude-3-haiku'].write,
    );
    expect(getCacheMultiplier({ valueKey: 'claude-3-haiku', cacheType: 'read' })).toBe(
      cacheTokenValues['claude-3-haiku'].read,
    );
  });

  it('should return null if cacheType is provided but not found in cacheTokenValues', () => {
    expect(
      getCacheMultiplier({ valueKey: 'claude-3-5-sonnet', cacheType: 'unknownType' }),
    ).toBeNull();
  });

  it('should derive the valueKey from the model if not provided', () => {
    expect(getCacheMultiplier({ cacheType: 'write', model: 'claude-3-5-sonnet-20240620' })).toBe(
      cacheTokenValues['claude-3-5-sonnet'].write,
    );
    expect(getCacheMultiplier({ cacheType: 'read', model: 'claude-3-haiku-20240307' })).toBe(
      cacheTokenValues['claude-3-haiku'].read,
    );
  });

  it('should return null if only model or cacheType is missing', () => {
    expect(getCacheMultiplier({ cacheType: 'write' })).toBeNull();
    expect(getCacheMultiplier({ model: 'claude-3-5-sonnet' })).toBeNull();
  });

  it('should return null if derived valueKey does not match any known patterns', () => {
    expect(getCacheMultiplier({ cacheType: 'write', model: 'gpt-4-some-other-info' })).toBeNull();
  });

  it('should handle endpointTokenConfig if provided', () => {
    const endpointTokenConfig = {
      'custom-model': {
        write: 5,
        read: 1,
      },
    };
    expect(
      getCacheMultiplier({ model: 'custom-model', cacheType: 'write', endpointTokenConfig }),
    ).toBe(endpointTokenConfig['custom-model'].write);
    expect(
      getCacheMultiplier({ model: 'custom-model', cacheType: 'read', endpointTokenConfig }),
    ).toBe(endpointTokenConfig['custom-model'].read);
  });

  it('should return null if model is not found in endpointTokenConfig', () => {
    const endpointTokenConfig = {
      'custom-model': {
        write: 5,
        read: 1,
      },
    };
    expect(
      getCacheMultiplier({ model: 'unknown-model', cacheType: 'write', endpointTokenConfig }),
    ).toBeNull();
  });

  it('should handle models with "bedrock/" prefix', () => {
    expect(
      getCacheMultiplier({
        model: 'bedrock/anthropic.claude-3-5-sonnet-20240620-v1:0',
        cacheType: 'write',
      }),
    ).toBe(cacheTokenValues['claude-3-5-sonnet'].write);
    expect(
      getCacheMultiplier({
        model: 'bedrock/anthropic.claude-3-haiku-20240307-v1:0',
        cacheType: 'read',
      }),
    ).toBe(cacheTokenValues['claude-3-haiku'].read);
  });
});

describe('Google Model Tests', () => {
  const googleModels = [
    'gemini-3',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.5-pro-preview-05-06',
    'gemini-2.5-flash-preview-04-17',
    'gemini-2.5-exp',
    'gemini-2.0-flash-lite-preview-02-05',
    'gemini-2.0-flash-001',
    'gemini-2.0-flash-exp',
    'gemini-2.0-pro-exp-02-05',
    'gemini-1.5-flash-8b',
    'gemini-1.5-flash-thinking',
    'gemini-1.5-pro-latest',
    'gemini-1.5-pro-preview-0409',
    'gemini-pro-vision',
    'gemini-1.0',
    'gemini-pro',
  ];

  it('should return the correct prompt and completion rates for all models', () => {
    const results = googleModels.map((model) => {
      const valueKey = getValueKey(model, EModelEndpoint.google);
      const promptRate = getMultiplier({
        model,
        tokenType: 'prompt',
        endpoint: EModelEndpoint.google,
      });
      const completionRate = getMultiplier({
        model,
        tokenType: 'completion',
        endpoint: EModelEndpoint.google,
      });
      return { model, valueKey, promptRate, completionRate };
    });

    results.forEach(({ valueKey, promptRate, completionRate }) => {
      expect(promptRate).toBe(tokenValues[valueKey].prompt);
      expect(completionRate).toBe(tokenValues[valueKey].completion);
    });
  });

  it('should map to the correct model keys', () => {
    const expected = {
      'gemini-3': 'gemini-3',
      'gemini-2.5-pro': 'gemini-2.5-pro',
      'gemini-2.5-flash': 'gemini-2.5-flash',
      'gemini-2.5-flash-lite': 'gemini-2.5-flash-lite',
      'gemini-2.5-pro-preview-05-06': 'gemini-2.5-pro',
      'gemini-2.5-flash-preview-04-17': 'gemini-2.5-flash',
      'gemini-2.5-exp': 'gemini-2.5',
      'gemini-2.0-flash-lite-preview-02-05': 'gemini-2.0-flash-lite',
      'gemini-2.0-flash-001': 'gemini-2.0-flash',
      'gemini-2.0-flash-exp': 'gemini-2.0-flash',
      'gemini-2.0-pro-exp-02-05': 'gemini-2.0',
      'gemini-1.5-flash-8b': 'gemini-1.5-flash-8b',
      'gemini-1.5-flash-thinking': 'gemini-1.5-flash',
      'gemini-1.5-pro-latest': 'gemini-1.5',
      'gemini-1.5-pro-preview-0409': 'gemini-1.5',
      'gemini-pro-vision': 'gemini-pro-vision',
      'gemini-1.0': 'gemini',
      'gemini-pro': 'gemini',
    };

    Object.entries(expected).forEach(([model, expectedKey]) => {
      const valueKey = getValueKey(model, EModelEndpoint.google);
      expect(valueKey).toBe(expectedKey);
    });
  });

  it('should handle model names with different formats', () => {
    const testCases = [
      { input: 'google/gemini-pro', expected: 'gemini' },
      { input: 'gemini-pro/google', expected: 'gemini' },
      { input: 'google/gemini-2.0-flash-lite', expected: 'gemini-2.0-flash-lite' },
    ];

    testCases.forEach(({ input, expected }) => {
      const valueKey = getValueKey(input, EModelEndpoint.google);
      expect(valueKey).toBe(expected);
      expect(
        getMultiplier({ model: input, tokenType: 'prompt', endpoint: EModelEndpoint.google }),
      ).toBe(tokenValues[expected].prompt);
      expect(
        getMultiplier({ model: input, tokenType: 'completion', endpoint: EModelEndpoint.google }),
      ).toBe(tokenValues[expected].completion);
    });
  });
});

describe('Grok Model Tests - Pricing', () => {
  describe('getMultiplier', () => {
    test('should return correct prompt and completion rates for Grok vision models', () => {
      const models = ['grok-2-vision-1212', 'grok-2-vision', 'grok-2-vision-latest'];
      models.forEach((model) => {
        expect(getMultiplier({ model, tokenType: 'prompt' })).toBe(
          tokenValues['grok-2-vision'].prompt,
        );
        expect(getMultiplier({ model, tokenType: 'completion' })).toBe(
          tokenValues['grok-2-vision'].completion,
        );
      });
    });

    test('should return correct prompt and completion rates for Grok text models', () => {
      const models = ['grok-2-1212', 'grok-2', 'grok-2-latest'];
      models.forEach((model) => {
        expect(getMultiplier({ model, tokenType: 'prompt' })).toBe(tokenValues['grok-2'].prompt);
        expect(getMultiplier({ model, tokenType: 'completion' })).toBe(
          tokenValues['grok-2'].completion,
        );
      });
    });

    test('should return correct prompt and completion rates for Grok beta models', () => {
      expect(getMultiplier({ model: 'grok-vision-beta', tokenType: 'prompt' })).toBe(
        tokenValues['grok-vision-beta'].prompt,
      );
      expect(getMultiplier({ model: 'grok-vision-beta', tokenType: 'completion' })).toBe(
        tokenValues['grok-vision-beta'].completion,
      );
      expect(getMultiplier({ model: 'grok-beta', tokenType: 'prompt' })).toBe(
        tokenValues['grok-beta'].prompt,
      );
      expect(getMultiplier({ model: 'grok-beta', tokenType: 'completion' })).toBe(
        tokenValues['grok-beta'].completion,
      );
    });

    test('should return correct prompt and completion rates for Grok 3 models', () => {
      expect(getMultiplier({ model: 'grok-3', tokenType: 'prompt' })).toBe(
        tokenValues['grok-3'].prompt,
      );
      expect(getMultiplier({ model: 'grok-3', tokenType: 'completion' })).toBe(
        tokenValues['grok-3'].completion,
      );
      expect(getMultiplier({ model: 'grok-3-fast', tokenType: 'prompt' })).toBe(
        tokenValues['grok-3-fast'].prompt,
      );
      expect(getMultiplier({ model: 'grok-3-fast', tokenType: 'completion' })).toBe(
        tokenValues['grok-3-fast'].completion,
      );
      expect(getMultiplier({ model: 'grok-3-mini', tokenType: 'prompt' })).toBe(
        tokenValues['grok-3-mini'].prompt,
      );
      expect(getMultiplier({ model: 'grok-3-mini', tokenType: 'completion' })).toBe(
        tokenValues['grok-3-mini'].completion,
      );
      expect(getMultiplier({ model: 'grok-3-mini-fast', tokenType: 'prompt' })).toBe(
        tokenValues['grok-3-mini-fast'].prompt,
      );
      expect(getMultiplier({ model: 'grok-3-mini-fast', tokenType: 'completion' })).toBe(
        tokenValues['grok-3-mini-fast'].completion,
      );
    });

    test('should return correct prompt and completion rates for Grok 4 model', () => {
      expect(getMultiplier({ model: 'grok-4-0709', tokenType: 'prompt' })).toBe(
        tokenValues['grok-4'].prompt,
      );
      expect(getMultiplier({ model: 'grok-4-0709', tokenType: 'completion' })).toBe(
        tokenValues['grok-4'].completion,
      );
    });

    test('should return correct prompt and completion rates for Grok 4 Fast model', () => {
      expect(getMultiplier({ model: 'grok-4-fast', tokenType: 'prompt' })).toBe(
        tokenValues['grok-4-fast'].prompt,
      );
      expect(getMultiplier({ model: 'grok-4-fast', tokenType: 'completion' })).toBe(
        tokenValues['grok-4-fast'].completion,
      );
    });

    test('should return correct prompt and completion rates for Grok 4.1 Fast models', () => {
      expect(getMultiplier({ model: 'grok-4-1-fast-reasoning', tokenType: 'prompt' })).toBe(
        tokenValues['grok-4-1-fast'].prompt,
      );
      expect(getMultiplier({ model: 'grok-4-1-fast-reasoning', tokenType: 'completion' })).toBe(
        tokenValues['grok-4-1-fast'].completion,
      );
      expect(getMultiplier({ model: 'grok-4-1-fast-non-reasoning', tokenType: 'prompt' })).toBe(
        tokenValues['grok-4-1-fast'].prompt,
      );
      expect(getMultiplier({ model: 'grok-4-1-fast-non-reasoning', tokenType: 'completion' })).toBe(
        tokenValues['grok-4-1-fast'].completion,
      );
    });

    test('should return correct prompt and completion rates for Grok Code Fast model', () => {
      expect(getMultiplier({ model: 'grok-code-fast-1', tokenType: 'prompt' })).toBe(
        tokenValues['grok-code-fast'].prompt,
      );
      expect(getMultiplier({ model: 'grok-code-fast-1', tokenType: 'completion' })).toBe(
        tokenValues['grok-code-fast'].completion,
      );
    });

    test('should return correct prompt and completion rates for Grok 3 models with prefixes', () => {
      expect(getMultiplier({ model: 'xai/grok-3', tokenType: 'prompt' })).toBe(
        tokenValues['grok-3'].prompt,
      );
      expect(getMultiplier({ model: 'xai/grok-3', tokenType: 'completion' })).toBe(
        tokenValues['grok-3'].completion,
      );
      expect(getMultiplier({ model: 'xai/grok-3-fast', tokenType: 'prompt' })).toBe(
        tokenValues['grok-3-fast'].prompt,
      );
      expect(getMultiplier({ model: 'xai/grok-3-fast', tokenType: 'completion' })).toBe(
        tokenValues['grok-3-fast'].completion,
      );
      expect(getMultiplier({ model: 'xai/grok-3-mini', tokenType: 'prompt' })).toBe(
        tokenValues['grok-3-mini'].prompt,
      );
      expect(getMultiplier({ model: 'xai/grok-3-mini', tokenType: 'completion' })).toBe(
        tokenValues['grok-3-mini'].completion,
      );
      expect(getMultiplier({ model: 'xai/grok-3-mini-fast', tokenType: 'prompt' })).toBe(
        tokenValues['grok-3-mini-fast'].prompt,
      );
      expect(getMultiplier({ model: 'xai/grok-3-mini-fast', tokenType: 'completion' })).toBe(
        tokenValues['grok-3-mini-fast'].completion,
      );
    });

    test('should return correct prompt and completion rates for Grok 4 model with prefixes', () => {
      expect(getMultiplier({ model: 'xai/grok-4-0709', tokenType: 'prompt' })).toBe(
        tokenValues['grok-4'].prompt,
      );
      expect(getMultiplier({ model: 'xai/grok-4-0709', tokenType: 'completion' })).toBe(
        tokenValues['grok-4'].completion,
      );
    });

    test('should return correct prompt and completion rates for Grok 4 Fast model with prefixes', () => {
      expect(getMultiplier({ model: 'xai/grok-4-fast', tokenType: 'prompt' })).toBe(
        tokenValues['grok-4-fast'].prompt,
      );
      expect(getMultiplier({ model: 'xai/grok-4-fast', tokenType: 'completion' })).toBe(
        tokenValues['grok-4-fast'].completion,
      );
    });

    test('should return correct prompt and completion rates for Grok 4.1 Fast models with prefixes', () => {
      expect(getMultiplier({ model: 'xai/grok-4-1-fast-reasoning', tokenType: 'prompt' })).toBe(
        tokenValues['grok-4-1-fast'].prompt,
      );
      expect(getMultiplier({ model: 'xai/grok-4-1-fast-reasoning', tokenType: 'completion' })).toBe(
        tokenValues['grok-4-1-fast'].completion,
      );
      expect(getMultiplier({ model: 'xai/grok-4-1-fast-non-reasoning', tokenType: 'prompt' })).toBe(
        tokenValues['grok-4-1-fast'].prompt,
      );
      expect(
        getMultiplier({ model: 'xai/grok-4-1-fast-non-reasoning', tokenType: 'completion' }),
      ).toBe(tokenValues['grok-4-1-fast'].completion);
    });

    test('should return correct prompt and completion rates for Grok Code Fast model with prefixes', () => {
      expect(getMultiplier({ model: 'xai/grok-code-fast-1', tokenType: 'prompt' })).toBe(
        tokenValues['grok-code-fast'].prompt,
      );
      expect(getMultiplier({ model: 'xai/grok-code-fast-1', tokenType: 'completion' })).toBe(
        tokenValues['grok-code-fast'].completion,
      );
    });
  });
});

describe('GLM Model Tests', () => {
  it('should return expected value keys for GLM models', () => {
    expect(getValueKey('glm-4.6')).toBe('glm-4.6');
    expect(getValueKey('glm-4.5')).toBe('glm-4.5');
    expect(getValueKey('glm-4.5v')).toBe('glm-4.5v');
    expect(getValueKey('glm-4.5-air')).toBe('glm-4.5-air');
    expect(getValueKey('glm-4-32b')).toBe('glm-4-32b');
    expect(getValueKey('glm-4')).toBe('glm-4');
    expect(getValueKey('glm4')).toBe('glm4');
  });

  it('should match GLM model variations with provider prefixes', () => {
    expect(getValueKey('z-ai/glm-4.6')).toBe('glm-4.6');
    expect(getValueKey('z-ai/glm-4.5')).toBe('glm-4.5');
    expect(getValueKey('z-ai/glm-4.5-air')).toBe('glm-4.5-air');
    expect(getValueKey('z-ai/glm-4.5v')).toBe('glm-4.5v');
    expect(getValueKey('z-ai/glm-4-32b')).toBe('glm-4-32b');

    expect(getValueKey('zai/glm-4.6')).toBe('glm-4.6');
    expect(getValueKey('zai/glm-4.5')).toBe('glm-4.5');
    expect(getValueKey('zai/glm-4.5-air')).toBe('glm-4.5-air');
    expect(getValueKey('zai/glm-4.5v')).toBe('glm-4.5v');

    expect(getValueKey('zai-org/GLM-4.6')).toBe('glm-4.6');
    expect(getValueKey('zai-org/GLM-4.5')).toBe('glm-4.5');
    expect(getValueKey('zai-org/GLM-4.5-Air')).toBe('glm-4.5-air');
    expect(getValueKey('zai-org/GLM-4.5V')).toBe('glm-4.5v');
    expect(getValueKey('zai-org/GLM-4-32B-0414')).toBe('glm-4-32b');
  });

  it('should match GLM model variations with suffixes', () => {
    expect(getValueKey('glm-4.6-fp8')).toBe('glm-4.6');
    expect(getValueKey('zai-org/GLM-4.6-FP8')).toBe('glm-4.6');
    expect(getValueKey('zai-org/GLM-4.5-Air-FP8')).toBe('glm-4.5-air');
  });

  it('should prioritize more specific GLM model patterns', () => {
    expect(getValueKey('glm-4.5-air-something')).toBe('glm-4.5-air');
    expect(getValueKey('glm-4.5-something')).toBe('glm-4.5');
    expect(getValueKey('glm-4.5v-something')).toBe('glm-4.5v');
  });

  it('should return correct multipliers for all GLM models', () => {
    expect(getMultiplier({ model: 'glm-4.6', tokenType: 'prompt' })).toBe(
      tokenValues['glm-4.6'].prompt,
    );
    expect(getMultiplier({ model: 'glm-4.6', tokenType: 'completion' })).toBe(
      tokenValues['glm-4.6'].completion,
    );

    expect(getMultiplier({ model: 'glm-4.5v', tokenType: 'prompt' })).toBe(
      tokenValues['glm-4.5v'].prompt,
    );
    expect(getMultiplier({ model: 'glm-4.5v', tokenType: 'completion' })).toBe(
      tokenValues['glm-4.5v'].completion,
    );

    expect(getMultiplier({ model: 'glm-4.5-air', tokenType: 'prompt' })).toBe(
      tokenValues['glm-4.5-air'].prompt,
    );
    expect(getMultiplier({ model: 'glm-4.5-air', tokenType: 'completion' })).toBe(
      tokenValues['glm-4.5-air'].completion,
    );

    expect(getMultiplier({ model: 'glm-4.5', tokenType: 'prompt' })).toBe(
      tokenValues['glm-4.5'].prompt,
    );
    expect(getMultiplier({ model: 'glm-4.5', tokenType: 'completion' })).toBe(
      tokenValues['glm-4.5'].completion,
    );

    expect(getMultiplier({ model: 'glm-4-32b', tokenType: 'prompt' })).toBe(
      tokenValues['glm-4-32b'].prompt,
    );
    expect(getMultiplier({ model: 'glm-4-32b', tokenType: 'completion' })).toBe(
      tokenValues['glm-4-32b'].completion,
    );

    expect(getMultiplier({ model: 'glm-4', tokenType: 'prompt' })).toBe(
      tokenValues['glm-4'].prompt,
    );
    expect(getMultiplier({ model: 'glm-4', tokenType: 'completion' })).toBe(
      tokenValues['glm-4'].completion,
    );

    expect(getMultiplier({ model: 'glm4', tokenType: 'prompt' })).toBe(tokenValues['glm4'].prompt);
    expect(getMultiplier({ model: 'glm4', tokenType: 'completion' })).toBe(
      tokenValues['glm4'].completion,
    );
  });

  it('should return correct multipliers for GLM models with provider prefixes', () => {
    expect(getMultiplier({ model: 'z-ai/glm-4.6', tokenType: 'prompt' })).toBe(
      tokenValues['glm-4.6'].prompt,
    );
    expect(getMultiplier({ model: 'zai/glm-4.5-air', tokenType: 'completion' })).toBe(
      tokenValues['glm-4.5-air'].completion,
    );
    expect(getMultiplier({ model: 'zai-org/GLM-4.5V', tokenType: 'prompt' })).toBe(
      tokenValues['glm-4.5v'].prompt,
    );
  });
});

describe('Claude Model Tests', () => {
  it('should return correct prompt and completion rates for Claude 4 models', () => {
    expect(getMultiplier({ model: 'claude-sonnet-4', tokenType: 'prompt' })).toBe(
      tokenValues['claude-sonnet-4'].prompt,
    );
    expect(getMultiplier({ model: 'claude-sonnet-4', tokenType: 'completion' })).toBe(
      tokenValues['claude-sonnet-4'].completion,
    );
    expect(getMultiplier({ model: 'claude-opus-4', tokenType: 'prompt' })).toBe(
      tokenValues['claude-opus-4'].prompt,
    );
    expect(getMultiplier({ model: 'claude-opus-4', tokenType: 'completion' })).toBe(
      tokenValues['claude-opus-4'].completion,
    );
  });

  it('should return correct prompt and completion rates for Claude Haiku 4.5', () => {
    expect(getMultiplier({ model: 'claude-haiku-4-5', tokenType: 'prompt' })).toBe(
      tokenValues['claude-haiku-4-5'].prompt,
    );
    expect(getMultiplier({ model: 'claude-haiku-4-5', tokenType: 'completion' })).toBe(
      tokenValues['claude-haiku-4-5'].completion,
    );
  });

  it('should return correct prompt and completion rates for Claude Opus 4.5', () => {
    expect(getMultiplier({ model: 'claude-opus-4-5', tokenType: 'prompt' })).toBe(
      tokenValues['claude-opus-4-5'].prompt,
    );
    expect(getMultiplier({ model: 'claude-opus-4-5', tokenType: 'completion' })).toBe(
      tokenValues['claude-opus-4-5'].completion,
    );
  });

  it('should handle Claude Haiku 4.5 model name variations', () => {
    const modelVariations = [
      'claude-haiku-4-5',
      'claude-haiku-4-5-20250420',
      'claude-haiku-4-5-latest',
      'anthropic/claude-haiku-4-5',
      'claude-haiku-4-5/anthropic',
      'claude-haiku-4-5-preview',
    ];

    modelVariations.forEach((model) => {
      const valueKey = getValueKey(model);
      expect(valueKey).toBe('claude-haiku-4-5');
      expect(getMultiplier({ model, tokenType: 'prompt' })).toBe(
        tokenValues['claude-haiku-4-5'].prompt,
      );
      expect(getMultiplier({ model, tokenType: 'completion' })).toBe(
        tokenValues['claude-haiku-4-5'].completion,
      );
    });
  });

  it('should handle Claude Opus 4.5 model name variations', () => {
    const modelVariations = [
      'claude-opus-4-5',
      'claude-opus-4-5-20250420',
      'claude-opus-4-5-latest',
      'anthropic/claude-opus-4-5',
      'claude-opus-4-5/anthropic',
      'claude-opus-4-5-preview',
    ];

    modelVariations.forEach((model) => {
      const valueKey = getValueKey(model);
      expect(valueKey).toBe('claude-opus-4-5');
      expect(getMultiplier({ model, tokenType: 'prompt' })).toBe(
        tokenValues['claude-opus-4-5'].prompt,
      );
      expect(getMultiplier({ model, tokenType: 'completion' })).toBe(
        tokenValues['claude-opus-4-5'].completion,
      );
    });
  });

  it('should handle Claude 4 model name variations with different prefixes and suffixes', () => {
    const modelVariations = [
      'claude-sonnet-4',
      'claude-sonnet-4-20240229',
      'claude-sonnet-4-latest',
      'anthropic/claude-sonnet-4',
      'claude-sonnet-4/anthropic',
      'claude-sonnet-4-preview',
      'claude-sonnet-4-20240229-preview',
      'claude-opus-4',
      'claude-opus-4-20240229',
      'claude-opus-4-latest',
      'anthropic/claude-opus-4',
      'claude-opus-4/anthropic',
      'claude-opus-4-preview',
      'claude-opus-4-20240229-preview',
    ];

    modelVariations.forEach((model) => {
      const valueKey = getValueKey(model);
      const isSonnet = model.includes('sonnet');
      const expectedKey = isSonnet ? 'claude-sonnet-4' : 'claude-opus-4';

      expect(valueKey).toBe(expectedKey);
      expect(getMultiplier({ model, tokenType: 'prompt' })).toBe(tokenValues[expectedKey].prompt);
      expect(getMultiplier({ model, tokenType: 'completion' })).toBe(
        tokenValues[expectedKey].completion,
      );
    });
  });

  it('should return correct cache rates for Claude 4 models', () => {
    expect(getCacheMultiplier({ model: 'claude-sonnet-4', cacheType: 'write' })).toBe(
      cacheTokenValues['claude-sonnet-4'].write,
    );
    expect(getCacheMultiplier({ model: 'claude-sonnet-4', cacheType: 'read' })).toBe(
      cacheTokenValues['claude-sonnet-4'].read,
    );
    expect(getCacheMultiplier({ model: 'claude-opus-4', cacheType: 'write' })).toBe(
      cacheTokenValues['claude-opus-4'].write,
    );
    expect(getCacheMultiplier({ model: 'claude-opus-4', cacheType: 'read' })).toBe(
      cacheTokenValues['claude-opus-4'].read,
    );
  });

  it('should return correct cache rates for Claude Opus 4.5', () => {
    expect(getCacheMultiplier({ model: 'claude-opus-4-5', cacheType: 'write' })).toBe(
      cacheTokenValues['claude-opus-4-5'].write,
    );
    expect(getCacheMultiplier({ model: 'claude-opus-4-5', cacheType: 'read' })).toBe(
      cacheTokenValues['claude-opus-4-5'].read,
    );
  });

  it('should handle Claude 4 model cache rates with different prefixes and suffixes', () => {
    const modelVariations = [
      'claude-sonnet-4',
      'claude-sonnet-4-20240229',
      'claude-sonnet-4-latest',
      'anthropic/claude-sonnet-4',
      'claude-sonnet-4/anthropic',
      'claude-sonnet-4-preview',
      'claude-sonnet-4-20240229-preview',
      'claude-opus-4',
      'claude-opus-4-20240229',
      'claude-opus-4-latest',
      'anthropic/claude-opus-4',
      'claude-opus-4/anthropic',
      'claude-opus-4-preview',
      'claude-opus-4-20240229-preview',
    ];

    modelVariations.forEach((model) => {
      const isSonnet = model.includes('sonnet');
      const expectedKey = isSonnet ? 'claude-sonnet-4' : 'claude-opus-4';

      expect(getCacheMultiplier({ model, cacheType: 'write' })).toBe(
        cacheTokenValues[expectedKey].write,
      );
      expect(getCacheMultiplier({ model, cacheType: 'read' })).toBe(
        cacheTokenValues[expectedKey].read,
      );
    });
  });
});

describe('tokens.ts and tx.js sync validation', () => {
  it('should resolve all models in maxTokensMap to pricing via getValueKey', () => {
    const tokensKeys = Object.keys(maxTokensMap[EModelEndpoint.openAI]);
    const txKeys = Object.keys(tokenValues);

    const unresolved = [];

    tokensKeys.forEach((key) => {
      // Skip legacy token size mappings (e.g., '4k', '8k', '16k', '32k')
      if (/^\d+k$/.test(key)) return;

      // Skip generic pattern keys (end with '-' or ':')
      if (key.endsWith('-') || key.endsWith(':')) return;

      // Try to resolve via getValueKey
      const resolvedKey = getValueKey(key);

      // If it resolves and the resolved key has pricing, success
      if (resolvedKey && txKeys.includes(resolvedKey)) return;

      // If it resolves to a legacy key (4k, 8k, etc), also OK
      if (resolvedKey && /^\d+k$/.test(resolvedKey)) return;

      // If we get here, this model can't get pricing - flag it
      unresolved.push({
        key,
        resolvedKey: resolvedKey || 'undefined',
        context: maxTokensMap[EModelEndpoint.openAI][key],
      });
    });

    if (unresolved.length > 0) {
      console.log('\nModels that cannot resolve to pricing via getValueKey:');
      unresolved.forEach(({ key, resolvedKey, context }) => {
        console.log(`  - '${key}' → '${resolvedKey}' (context: ${context})`);
      });
    }

    expect(unresolved).toEqual([]);
  });

  it('should not have redundant dated variants with same pricing and context as base model', () => {
    const txKeys = Object.keys(tokenValues);
    const redundant = [];

    txKeys.forEach((key) => {
      // Check if this is a dated variant (ends with -YYYY-MM-DD)
      if (key.match(/.*-\d{4}-\d{2}-\d{2}$/)) {
        const baseKey = key.replace(/-\d{4}-\d{2}-\d{2}$/, '');

        if (txKeys.includes(baseKey)) {
          const variantPricing = tokenValues[key];
          const basePricing = tokenValues[baseKey];
          const variantContext = maxTokensMap[EModelEndpoint.openAI][key];
          const baseContext = maxTokensMap[EModelEndpoint.openAI][baseKey];

          const samePricing =
            variantPricing.prompt === basePricing.prompt &&
            variantPricing.completion === basePricing.completion;
          const sameContext = variantContext === baseContext;

          if (samePricing && sameContext) {
            redundant.push({
              key,
              baseKey,
              pricing: `${variantPricing.prompt}/${variantPricing.completion}`,
              context: variantContext,
            });
          }
        }
      }
    });

    if (redundant.length > 0) {
      console.log('\nRedundant dated variants found (same pricing and context as base):');
      redundant.forEach(({ key, baseKey, pricing, context }) => {
        console.log(`  - '${key}' → '${baseKey}' (pricing: ${pricing}, context: ${context})`);
        console.log(`    Can be removed - pattern matching will handle it`);
      });
    }

    expect(redundant).toEqual([]);
  });

  it('should have context windows in tokens.ts for all models with pricing in tx.js (openAI catch-all)', () => {
    const txKeys = Object.keys(tokenValues);
    const missingContext = [];

    txKeys.forEach((key) => {
      // Skip legacy token size mappings (4k, 8k, 16k, 32k)
      if (/^\d+k$/.test(key)) return;

      // Check if this model has a context window defined
      const context = maxTokensMap[EModelEndpoint.openAI][key];

      if (!context) {
        const pricing = tokenValues[key];
        missingContext.push({
          key,
          pricing: `${pricing.prompt}/${pricing.completion}`,
        });
      }
    });

    if (missingContext.length > 0) {
      console.log('\nModels with pricing but missing context in tokens.ts:');
      missingContext.forEach(({ key, pricing }) => {
        console.log(`  - '${key}' (pricing: ${pricing})`);
        console.log(`    Add to tokens.ts openAIModels/bedrockModels/etc.`);
      });
    }

    expect(missingContext).toEqual([]);
  });
});
