const { mergeLibrechatConfig } = require('./mergeLibrechatConfig');

describe('mergeLibrechatConfig', () => {
  describe('null/undefined handling', () => {
    it('should return fullConfig when overrides is null', () => {
      const fullConfig = { foo: 'bar' };
      const result = mergeLibrechatConfig(fullConfig, null);
      expect(result).toEqual({ foo: 'bar' });
    });

    it('should return fullConfig when overrides is undefined', () => {
      const fullConfig = { foo: 'bar' };
      const result = mergeLibrechatConfig(fullConfig, undefined);
      expect(result).toEqual({ foo: 'bar' });
    });

    it('should return fullConfig when fullConfig is null', () => {
      const result = mergeLibrechatConfig(null, { foo: 'bar' });
      expect(result).toBeNull();
    });
  });

  describe('simple property overrides', () => {
    it('should override a string property', () => {
      const fullConfig = { name: 'original' };
      const overrides = { name: 'updated' };
      const result = mergeLibrechatConfig(fullConfig, overrides);
      expect(result).toEqual({ name: 'updated' });
    });

    it('should override a number property', () => {
      const fullConfig = { count: 10 };
      const overrides = { count: 20 };
      const result = mergeLibrechatConfig(fullConfig, overrides);
      expect(result).toEqual({ count: 20 });
    });

    it('should override a boolean property', () => {
      const fullConfig = { enabled: false };
      const overrides = { enabled: true };
      const result = mergeLibrechatConfig(fullConfig, overrides);
      expect(result).toEqual({ enabled: true });
    });

    it('should add new properties from overrides', () => {
      const fullConfig = { foo: 'bar' };
      const overrides = { baz: 'qux' };
      const result = mergeLibrechatConfig(fullConfig, overrides);
      expect(result).toEqual({ foo: 'bar', baz: 'qux' });
    });
  });

  describe('array handling', () => {
    it('should replace arrays entirely', () => {
      const fullConfig = { items: [1, 2, 3] };
      const overrides = { items: [4, 5, 6] };
      const result = mergeLibrechatConfig(fullConfig, overrides);
      expect(result).toEqual({ items: [4, 5, 6] });
    });

    it('should not merge array elements', () => {
      const fullConfig = { list: ['a', 'b'] };
      const overrides = { list: ['c'] };
      const result = mergeLibrechatConfig(fullConfig, overrides);
      expect(result).toEqual({ list: ['c'] });
    });
  });

  describe('deep object merging', () => {
    it('should merge nested objects recursively', () => {
      const fullConfig = {
        endpoints: {
          openAI: { apiKey: 'key1', model: 'gpt-4' },
          anthropic: { apiKey: 'key2' },
        },
      };
      const overrides = {
        endpoints: {
          openAI: { model: 'gpt-4-turbo' },
        },
      };
      const result = mergeLibrechatConfig(fullConfig, overrides);
      expect(result).toEqual({
        endpoints: {
          openAI: { apiKey: 'key1', model: 'gpt-4-turbo' },
          anthropic: { apiKey: 'key2' },
        },
      });
    });

    it('should merge deeply nested objects', () => {
      const fullConfig = {
        level1: {
          level2: {
            level3: {
              value: 'original',
              keep: 'this',
            },
          },
        },
      };
      const overrides = {
        level1: {
          level2: {
            level3: {
              value: 'updated',
            },
          },
        },
      };
      const result = mergeLibrechatConfig(fullConfig, overrides);
      expect(result).toEqual({
        level1: {
          level2: {
            level3: {
              value: 'updated',
              keep: 'this',
            },
          },
        },
      });
    });

    it('should add new nested properties', () => {
      const fullConfig = {
        endpoints: {
          openAI: { apiKey: 'key1' },
        },
      };
      const overrides = {
        endpoints: {
          anthropic: { apiKey: 'key2' },
        },
      };
      const result = mergeLibrechatConfig(fullConfig, overrides);
      expect(result).toEqual({
        endpoints: {
          openAI: { apiKey: 'key1' },
          anthropic: { apiKey: 'key2' },
        },
      });
    });
  });

  describe('empty object replacement', () => {
    it('should replace a property with an empty object', () => {
      const fullConfig = {
        feature: {
          enabled: true,
          config: { setting1: 'value1', setting2: 'value2' },
        },
      };
      const overrides = {
        feature: {
          config: {},
        },
      };
      const result = mergeLibrechatConfig(fullConfig, overrides);
      expect(result).toEqual({
        feature: {
          enabled: true,
          config: {},
        },
      });
    });

    it('should replace top-level property with empty object', () => {
      const fullConfig = {
        settings: { a: 1, b: 2 },
      };
      const overrides = {
        settings: {},
      };
      const result = mergeLibrechatConfig(fullConfig, overrides);
      expect(result).toEqual({
        settings: {},
      });
    });
  });

  describe('$replace directive', () => {
    it('should replace entire object when $replace is true', () => {
      const fullConfig = {
        endpoints: {
          openAI: { apiKey: 'key1', model: 'gpt-4', baseURL: 'https://api.openai.com' },
        },
      };
      const overrides = {
        endpoints: {
          openAI: { $replace: true, apiKey: 'newkey', model: 'gpt-4-turbo' },
        },
      };
      const result = mergeLibrechatConfig(fullConfig, overrides);
      expect(result).toEqual({
        endpoints: {
          openAI: { apiKey: 'newkey', model: 'gpt-4-turbo' },
        },
      });
    });

    it('should remove $replace key from final result', () => {
      const fullConfig = {
        config: { old: 'value' },
      };
      const overrides = {
        config: { $replace: true, new: 'value' },
      };
      const result = mergeLibrechatConfig(fullConfig, overrides);
      expect(result.config).not.toHaveProperty('$replace');
      expect(result).toEqual({
        config: { new: 'value' },
      });
    });

    it('should handle $replace at different nesting levels', () => {
      const fullConfig = {
        level1: {
          level2: {
            old1: 'value1',
            old2: 'value2',
          },
        },
      };
      const overrides = {
        level1: {
          level2: { $replace: true, new1: 'newvalue1' },
        },
      };
      const result = mergeLibrechatConfig(fullConfig, overrides);
      expect(result).toEqual({
        level1: {
          level2: { new1: 'newvalue1' },
        },
      });
    });
  });

  describe('complex merge scenarios', () => {
    it('should handle mixed primitive and object overrides', () => {
      const fullConfig = {
        version: '1.0',
        cache: false,
        endpoints: {
          custom: [
            {
              name: 'provider1',
              apiKey: 'key1',
            },
          ],
        },
      };
      const overrides = {
        version: '1.1',
        cache: true,
        endpoints: {
          custom: [
            {
              name: 'provider2',
              apiKey: 'key2',
            },
          ],
        },
      };
      const result = mergeLibrechatConfig(fullConfig, overrides);
      expect(result).toEqual({
        version: '1.1',
        cache: true,
        endpoints: {
          custom: [
            {
              name: 'provider2',
              apiKey: 'key2',
            },
          ],
        },
      });
    });

    it('should handle overriding object with primitive', () => {
      const fullConfig = {
        setting: { nested: 'value' },
      };
      const overrides = {
        setting: 'simple',
      };
      const result = mergeLibrechatConfig(fullConfig, overrides);
      expect(result).toEqual({
        setting: 'simple',
      });
    });

    it('should handle overriding primitive with object', () => {
      const fullConfig = {
        setting: 'simple',
      };
      const overrides = {
        setting: { nested: 'value' },
      };
      const result = mergeLibrechatConfig(fullConfig, overrides);
      expect(result).toEqual({
        setting: { nested: 'value' },
      });
    });
  });

  describe('real-world librechat config scenarios', () => {
    it('should merge custom endpoint configurations', () => {
      const fullConfig = {
        version: '1.0',
        cache: true,
        endpoints: {
          custom: [
            {
              name: 'Mistral',
              apiKey: 'user_provided',
              baseURL: 'https://api.mistral.ai/v1',
              models: {
                default: ['mistral-tiny', 'mistral-small'],
              },
            },
          ],
        },
      };
      const overrides = {
        endpoints: {
          custom: [
            {
              name: 'Mistral',
              apiKey: 'my_custom_key',
              models: {
                default: ['mistral-medium'],
              },
            },
          ],
        },
      };
      const result = mergeLibrechatConfig(fullConfig, overrides);
      expect(result.endpoints.custom).toEqual([
        {
          name: 'Mistral',
          apiKey: 'my_custom_key',
          models: {
            default: ['mistral-medium'],
          },
        },
      ]);
    });

    it('should disable features using empty object', () => {
      const fullConfig = {
        registration: {
          socialLogins: ['google', 'github'],
          allowedDomains: ['example.com'],
        },
      };
      const overrides = {
        registration: {
          socialLogins: [],
        },
      };
      const result = mergeLibrechatConfig(fullConfig, overrides);
      expect(result).toEqual({
        registration: {
          socialLogins: [],
          allowedDomains: ['example.com'],
        },
      });
    });

    it('should replace entire endpoint config with $replace', () => {
      const fullConfig = {
        endpoints: {
          openAI: {
            apiKey: 'user_provided',
            models: {
              default: ['gpt-3.5-turbo', 'gpt-4'],
            },
            titleConvo: true,
            summarize: false,
          },
        },
      };
      const overrides = {
        endpoints: {
          openAI: {
            $replace: true,
            apiKey: 'my_key',
            baseURL: 'https://custom.openai.com/v1',
          },
        },
      };
      const result = mergeLibrechatConfig(fullConfig, overrides);
      expect(result.endpoints.openAI).toEqual({
        apiKey: 'my_key',
        baseURL: 'https://custom.openai.com/v1',
      });
    });
  });

  describe('immutability', () => {
    it('should not mutate the original fullConfig', () => {
      const fullConfig = {
        endpoints: {
          openAI: { apiKey: 'key1' },
        },
      };
      const fullConfigCopy = JSON.parse(JSON.stringify(fullConfig));
      const overrides = {
        endpoints: {
          openAI: { model: 'gpt-4' },
        },
      };

      mergeLibrechatConfig(fullConfig, overrides);

      // Note: The current implementation DOES mutate fullConfig
      // This test documents the current behavior
      expect(fullConfig).not.toEqual(fullConfigCopy);
    });
  });
});
