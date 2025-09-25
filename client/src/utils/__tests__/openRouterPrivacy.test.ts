import {
  extractProvider,
  mayTrainOnUserData,
  getModelPrivacyInfo,
  getProviderDisplayName,
  sortModels,
  filterModelsByPrivacy,
} from '../openRouterPrivacy';

describe('OpenRouter Privacy Utilities', () => {
  describe('extractProvider', () => {
    it('should extract provider from standard model ID', () => {
      expect(extractProvider('openai/gpt-4')).toBe('openai');
      expect(extractProvider('anthropic/claude-3-opus')).toBe('anthropic');
      expect(extractProvider('google/gemini-pro')).toBe('google');
    });

    it('should handle special cases', () => {
      expect(extractProvider('openrouter/auto')).toBe('openrouter');
    });

    it('should handle invalid or empty IDs', () => {
      expect(extractProvider('')).toBe('unknown');
      expect(extractProvider('single-part-id')).toBe('single-part-id');
    });
  });

  describe('mayTrainOnUserData', () => {
    it('should identify models that do not train on data', () => {
      expect(mayTrainOnUserData('anthropic/claude-3-opus')).toBe(false);
      expect(mayTrainOnUserData('mistral/mistral-7b')).toBe(false);
      expect(mayTrainOnUserData('deepseek/deepseek-coder')).toBe(false);
      expect(mayTrainOnUserData('perplexity/sonar')).toBe(false);
    });

    it('should identify models that may train on data', () => {
      expect(mayTrainOnUserData('openai/gpt-3.5-turbo')).toBe(true);
      expect(mayTrainOnUserData('google/gemini-pro')).toBe(true);
      expect(mayTrainOnUserData('meta/llama-3')).toBe(true);
    });

    it('should handle special cases correctly', () => {
      expect(mayTrainOnUserData('openrouter/auto')).toBe(false);
      expect(mayTrainOnUserData('openai/gpt-4o')).toBe(false);
    });

    it('should default to true for unknown providers', () => {
      expect(mayTrainOnUserData('unknown/model')).toBe(true);
    });
  });

  describe('getModelPrivacyInfo', () => {
    it('should return complete privacy information', () => {
      const info = getModelPrivacyInfo('anthropic/claude-3-opus');
      expect(info).toEqual({
        provider: 'anthropic',
        mayTrainOnData: false,
        hasZDR: true,
      });
    });

    it('should mark huggingface as not having ZDR', () => {
      const info = getModelPrivacyInfo('huggingface/model');
      expect(info.hasZDR).toBe(false);
    });
  });

  describe('getProviderDisplayName', () => {
    it('should return formatted provider names', () => {
      expect(getProviderDisplayName('anthropic')).toBe('Anthropic');
      expect(getProviderDisplayName('openai')).toBe('OpenAI');
      expect(getProviderDisplayName('mistral')).toBe('Mistral AI');
      expect(getProviderDisplayName('deepseek')).toBe('DeepSeek');
    });

    it('should handle unknown providers', () => {
      expect(getProviderDisplayName('unknown')).toBe('Unknown');
      expect(getProviderDisplayName('xyz')).toBe('Xyz');
    });
  });

  describe('sortModels', () => {
    const testModels = [
      { id: 'google/gemini-pro', name: 'Gemini Pro' },
      { id: 'anthropic/claude-3', name: 'Claude 3' },
      { id: 'openai/gpt-4', name: 'GPT-4' },
      { id: 'deepseek/coder', name: 'DeepSeek Coder' },
    ];

    it('should sort by provider ascending', () => {
      const sorted = sortModels(testModels, 'provider', 'asc');
      expect(sorted[0].id).toBe('anthropic/claude-3');
      expect(sorted[1].id).toBe('deepseek/coder');
      expect(sorted[2].id).toBe('google/gemini-pro');
      expect(sorted[3].id).toBe('openai/gpt-4');
    });

    it('should sort by provider descending', () => {
      const sorted = sortModels(testModels, 'provider', 'desc');
      expect(sorted[0].id).toBe('openai/gpt-4');
      expect(sorted[1].id).toBe('google/gemini-pro');
      expect(sorted[2].id).toBe('deepseek/coder');
      expect(sorted[3].id).toBe('anthropic/claude-3');
    });

    it('should sort by name ascending', () => {
      const sorted = sortModels(testModels, 'name', 'asc');
      expect(sorted[0].name).toBe('Claude 3');
      expect(sorted[1].name).toBe('DeepSeek Coder');
      expect(sorted[2].name).toBe('Gemini Pro');
      expect(sorted[3].name).toBe('GPT-4');
    });

    it('should not mutate original array', () => {
      const original = [...testModels];
      sortModels(testModels, 'provider', 'asc');
      expect(testModels).toEqual(original);
    });
  });

  describe('filterModelsByPrivacy', () => {
    const testModels = [
      { id: 'openrouter/auto' },
      { id: 'anthropic/claude-3' },
      { id: 'openai/gpt-4' },
      { id: 'google/gemini-pro' },
      { id: 'mistral/mistral-7b' },
    ];

    it('should return all models when filter is disabled', () => {
      const filtered = filterModelsByPrivacy(testModels, false);
      expect(filtered).toEqual(testModels);
    });

    it('should filter out models that train on data', () => {
      const filtered = filterModelsByPrivacy(testModels, true);
      expect(filtered).toContainEqual({ id: 'openrouter/auto' });
      expect(filtered).toContainEqual({ id: 'anthropic/claude-3' });
      expect(filtered).toContainEqual({ id: 'mistral/mistral-7b' });
      expect(filtered).not.toContainEqual({ id: 'openai/gpt-4' });
      expect(filtered).not.toContainEqual({ id: 'google/gemini-pro' });
    });

    it('should always include Auto Router', () => {
      const filtered = filterModelsByPrivacy([{ id: 'openrouter/auto' }], true);
      expect(filtered).toContainEqual({ id: 'openrouter/auto' });
    });

    it('should not mutate original array', () => {
      const original = [...testModels];
      filterModelsByPrivacy(testModels, true);
      expect(testModels).toEqual(original);
    });
  });
});