const { parseGptModel, rankModelsByCost, selectTitleModels } = require('./titleModelSelector');
const { EModelEndpoint } = require('librechat-data-provider');

describe('titleModelSelector', () => {
  describe('parseGptModel', () => {
    it('should parse gpt-4o correctly', () => {
      expect(parseGptModel('gpt-4o')).toEqual({
        version: 4,
        variant: 'o',
        tier: 'standard',
      });
    });

    it('should parse gpt-4o-mini correctly', () => {
      expect(parseGptModel('gpt-4o-mini')).toEqual({
        version: 4,
        variant: 'o',
        tier: 'mini',
      });
    });

    it('should parse gpt-41 correctly', () => {
      expect(parseGptModel('gpt-41')).toEqual({
        version: 41,
        variant: '',
        tier: 'standard',
      });
    });

    it('should parse gpt-41-mini correctly', () => {
      expect(parseGptModel('gpt-41-mini')).toEqual({
        version: 41,
        variant: '',
        tier: 'mini',
      });
    });

    it('should parse gpt-41-nano correctly', () => {
      expect(parseGptModel('gpt-41-nano')).toEqual({
        version: 41,
        variant: '',
        tier: 'nano',
      });
    });

    it('should parse gpt-4.1-nano correctly', () => {
      expect(parseGptModel('gpt-4.1-nano')).toEqual({
        version: 4.1,
        variant: '',
        tier: 'nano',
      });
    });

    it('should parse gpt-4.1-mini correctly', () => {
      expect(parseGptModel('gpt-4.1-mini')).toEqual({
        version: 4.1,
        variant: '',
        tier: 'mini',
      });
    });

    it('should parse gpt-4 (no variant, no tier) correctly', () => {
      expect(parseGptModel('gpt-4')).toEqual({
        version: 4,
        variant: '',
        tier: 'standard',
      });
    });

    it('should return null for non-GPT models', () => {
      expect(parseGptModel('claude-3-haiku')).toBeNull();
      expect(parseGptModel('gemini-2.5-pro')).toBeNull();
      expect(parseGptModel('llama-3-70b')).toBeNull();
    });

    it('should return null for empty or invalid input', () => {
      expect(parseGptModel('')).toBeNull();
      expect(parseGptModel(null)).toBeNull();
      expect(parseGptModel(undefined)).toBeNull();
    });

    it('should handle gpt-4o-nano if it ever exists', () => {
      expect(parseGptModel('gpt-4o-nano')).toEqual({
        version: 4,
        variant: 'o',
        tier: 'nano',
      });
    });

    it('should parse gpt-5 style future models', () => {
      expect(parseGptModel('gpt-5')).toEqual({
        version: 5,
        variant: '',
        tier: 'standard',
      });
    });

    it('should parse gpt-5-mini style future models', () => {
      expect(parseGptModel('gpt-5-mini')).toEqual({
        version: 5,
        variant: '',
        tier: 'mini',
      });
    });
  });

  describe('rankModelsByCost', () => {
    it('should rank models cheapest first: tier then version', () => {
      const models = ['gpt-4o', 'gpt-41', 'gpt-4o-mini', 'gpt-41-mini'];
      const ranked = rankModelsByCost(models);
      expect(ranked).toEqual(['gpt-41-mini', 'gpt-4o-mini', 'gpt-41', 'gpt-4o']);
    });

    it('should rank nano < mini < standard', () => {
      const models = ['gpt-41', 'gpt-41-mini', 'gpt-41-nano'];
      const ranked = rankModelsByCost(models);
      expect(ranked).toEqual(['gpt-41-nano', 'gpt-41-mini', 'gpt-41']);
    });

    it('should prefer newer versions within same tier', () => {
      const models = ['gpt-4o-mini', 'gpt-41-mini', 'gpt-4.1-mini'];
      const ranked = rankModelsByCost(models);
      // gpt-41 (version 41) > gpt-4.1 (version 4.1) > gpt-4o (version 4)
      expect(ranked).toEqual(['gpt-41-mini', 'gpt-4.1-mini', 'gpt-4o-mini']);
    });

    it('should filter out non-GPT models', () => {
      const models = ['claude-3-haiku', 'gpt-41-mini', 'gemini-pro', 'gpt-4o'];
      const ranked = rankModelsByCost(models);
      expect(ranked).toEqual(['gpt-41-mini', 'gpt-4o']);
    });

    it('should return empty array for no GPT models', () => {
      const models = ['claude-3-haiku', 'gemini-pro'];
      const ranked = rankModelsByCost(models);
      expect(ranked).toEqual([]);
    });

    it('should return empty array for empty input', () => {
      expect(rankModelsByCost([])).toEqual([]);
    });

    it('should handle single model', () => {
      expect(rankModelsByCost(['gpt-4o-mini'])).toEqual(['gpt-4o-mini']);
    });

    it('should rank a realistic Azure deployment set', () => {
      const models = ['gpt-4o', 'gpt-4o-mini', 'gpt-41', 'gpt-41-mini'];
      const ranked = rankModelsByCost(models);
      // mini tier first (newer version first), then standard tier (newer version first)
      expect(ranked).toEqual(['gpt-41-mini', 'gpt-4o-mini', 'gpt-41', 'gpt-4o']);
    });

    it('should handle future model set with nano tier', () => {
      const models = ['gpt-4o', 'gpt-4o-mini', 'gpt-41', 'gpt-41-mini', 'gpt-41-nano'];
      const ranked = rankModelsByCost(models);
      expect(ranked).toEqual([
        'gpt-41-nano',
        'gpt-41-mini',
        'gpt-4o-mini',
        'gpt-41',
        'gpt-4o',
      ]);
    });
  });

  describe('selectTitleModels', () => {
    it('should return ranked models from Azure config', () => {
      const appConfig = {
        endpoints: {
          [EModelEndpoint.azureOpenAI]: {
            modelNames: ['gpt-4o', 'gpt-4o-mini', 'gpt-41', 'gpt-41-mini'],
          },
        },
      };
      const result = selectTitleModels(appConfig, EModelEndpoint.azureOpenAI);
      expect(result).toEqual(['gpt-41-mini', 'gpt-4o-mini', 'gpt-41', 'gpt-4o']);
    });

    it('should return empty array when no models configured', () => {
      const appConfig = { endpoints: {} };
      const result = selectTitleModels(appConfig, EModelEndpoint.azureOpenAI);
      expect(result).toEqual([]);
    });

    it('should return empty array when endpoint has no modelNames', () => {
      const appConfig = {
        endpoints: {
          [EModelEndpoint.azureOpenAI]: {},
        },
      };
      const result = selectTitleModels(appConfig, EModelEndpoint.azureOpenAI);
      expect(result).toEqual([]);
    });

    it('should return empty array when all models are non-GPT', () => {
      const appConfig = {
        endpoints: {
          [EModelEndpoint.azureOpenAI]: {
            modelNames: ['claude-3-haiku', 'gemini-pro'],
          },
        },
      };
      const result = selectTitleModels(appConfig, EModelEndpoint.azureOpenAI);
      expect(result).toEqual([]);
    });

    it('should handle null appConfig gracefully', () => {
      expect(selectTitleModels(null, EModelEndpoint.azureOpenAI)).toEqual([]);
      expect(selectTitleModels(undefined, EModelEndpoint.azureOpenAI)).toEqual([]);
    });

    it('should handle null endpoint gracefully', () => {
      const appConfig = {
        endpoints: {
          [EModelEndpoint.azureOpenAI]: {
            modelNames: ['gpt-4o-mini'],
          },
        },
      };
      expect(selectTitleModels(appConfig, null)).toEqual([]);
    });
  });
});
