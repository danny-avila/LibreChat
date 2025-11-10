import type { FileConfig } from './types/files';
import {
  fileConfig as baseFileConfig,
  getEndpointFileConfig,
  mergeFileConfig,
} from './file-config';
import { EModelEndpoint } from './schemas';

describe('getEndpointFileConfig', () => {
  describe('custom endpoint lookup', () => {
    it('should find custom endpoint by direct lookup', () => {
      const fileConfig: FileConfig = {
        ...baseFileConfig,
        endpoints: {
          ...baseFileConfig.endpoints,
          ollama: {
            disabled: true,
            fileLimit: 5,
          },
        },
      };

      const result = getEndpointFileConfig({
        fileConfig,
        endpoint: 'ollama',
        endpointType: EModelEndpoint.custom,
      });

      expect(result.disabled).toBe(true);
      expect(result.fileLimit).toBe(5);
    });

    it('should find custom endpoint by normalized lookup', () => {
      const fileConfig: FileConfig = {
        ...baseFileConfig,
        endpoints: {
          ...baseFileConfig.endpoints,
          ollama: {
            disabled: true,
            fileLimit: 7,
          },
        },
      };

      /** Test with non-normalized name */
      const result = getEndpointFileConfig({
        fileConfig,
        endpoint: 'Ollama',
        endpointType: EModelEndpoint.custom,
      });

      expect(result.disabled).toBe(true);
      expect(result.fileLimit).toBe(7);
    });

    it('should fallback to generic custom config when specific endpoint not found', () => {
      const fileConfig: FileConfig = {
        ...baseFileConfig,
        endpoints: {
          ...baseFileConfig.endpoints,
          [EModelEndpoint.custom]: {
            disabled: false,
            fileLimit: 3,
          },
        },
      };

      const result = getEndpointFileConfig({
        fileConfig,
        endpoint: 'unknownCustomEndpoint',
        endpointType: EModelEndpoint.custom,
      });

      expect(result.disabled).toBe(false);
      expect(result.fileLimit).toBe(3);
    });

    it('should fallback to agents config when custom and specific endpoint not found', () => {
      const fileConfig: FileConfig = {
        ...baseFileConfig,
        endpoints: {
          ...baseFileConfig.endpoints,
          [EModelEndpoint.agents]: {
            disabled: false,
            fileLimit: 8,
          },
        },
      };

      const result = getEndpointFileConfig({
        fileConfig,
        endpoint: 'unknownCustomEndpoint',
        endpointType: EModelEndpoint.custom,
      });

      expect(result.disabled).toBe(false);
      expect(result.fileLimit).toBe(8);
    });

    it('should use base agents config when only default is dynamically configured', () => {
      const dynamicConfig = {
        endpoints: {
          default: {
            disabled: false,
            fileLimit: 12,
          },
        },
      };

      const merged = mergeFileConfig(dynamicConfig);
      const result = getEndpointFileConfig({
        fileConfig: merged,
        endpoint: 'unknownCustomEndpoint',
        endpointType: EModelEndpoint.custom,
      });

      /**
       * Should use base agents config (fileLimit: 10) since it exists in baseFileConfig
       * and custom endpoints fall back to agents
       */
      expect(result.disabled).toBe(false);
      expect(result.fileLimit).toBe(10); /** From baseFileConfig.endpoints.agents */
    });

    it('should prioritize specific custom endpoint over generic custom config', () => {
      const fileConfig: FileConfig = {
        ...baseFileConfig,
        endpoints: {
          ...baseFileConfig.endpoints,
          [EModelEndpoint.custom]: {
            disabled: false,
            fileLimit: 20,
          },
          ollama: {
            disabled: true,
            fileLimit: 3,
          },
        },
      };

      const result = getEndpointFileConfig({
        fileConfig,
        endpoint: 'ollama',
        endpointType: EModelEndpoint.custom,
      });

      /** Should use ollama config, not generic custom */
      expect(result.disabled).toBe(true);
      expect(result.fileLimit).toBe(3);
    });

    it('should skip standard endpoint keys in normalized lookup', () => {
      const fileConfig: FileConfig = {
        ...baseFileConfig,
        endpoints: {
          ...baseFileConfig.endpoints,
          default: {
            disabled: false,
            fileLimit: 99,
          },
        },
      };

      /** "default" should not match via normalized lookup for custom endpoints */
      const result = getEndpointFileConfig({
        fileConfig,
        endpoint: 'default',
        endpointType: EModelEndpoint.custom,
      });

      /** Should not use direct lookup, should fall back to default */
      expect(result.fileLimit).toBe(99);
    });

    it('should handle complete fallback chain: specific -> custom -> agents -> default', () => {
      const customConfig: FileConfig = {
        ...baseFileConfig,
        endpoints: {
          ...baseFileConfig.endpoints,
          myOllama: {
            disabled: true,
            fileLimit: 1,
          },
          [EModelEndpoint.custom]: {
            disabled: false,
            fileLimit: 2,
          },
          [EModelEndpoint.agents]: {
            disabled: false,
            fileLimit: 3,
          },
          default: {
            disabled: false,
            fileLimit: 4,
          },
        },
      };

      /** 1. Should find specific config */
      const specific = getEndpointFileConfig({
        fileConfig: customConfig,
        endpoint: 'myOllama',
        endpointType: EModelEndpoint.custom,
      });
      expect(specific.fileLimit).toBe(1);

      /** 2. Should fallback to custom when specific not found */
      const customOnlyConfig: FileConfig = {
        ...baseFileConfig,
        endpoints: {
          ...baseFileConfig.endpoints,
          [EModelEndpoint.custom]: {
            disabled: false,
            fileLimit: 2,
          },
          [EModelEndpoint.agents]: {
            disabled: false,
            fileLimit: 3,
          },
          default: {
            disabled: false,
            fileLimit: 4,
          },
        },
      };
      const customFallback = getEndpointFileConfig({
        fileConfig: customOnlyConfig,
        endpoint: 'unknownCustom',
        endpointType: EModelEndpoint.custom,
      });
      expect(customFallback.fileLimit).toBe(2);

      /** 3. Should fallback to agents */
      const agentsFallback = getEndpointFileConfig({
        fileConfig: {
          ...baseFileConfig,
          endpoints: {
            ...baseFileConfig.endpoints,
            [EModelEndpoint.agents]: {
              disabled: false,
              fileLimit: 3,
            },
            default: {
              disabled: false,
              fileLimit: 4,
            },
          },
        },
        endpoint: 'unknownCustom',
        endpointType: EModelEndpoint.custom,
      });
      expect(agentsFallback.fileLimit).toBe(3);

      /**
       * 4. Should use agents even if disabled (caller decides based on disabled flag)
       * getEndpointFileConfig returns the config, doesn't filter based on disabled
       */
      const agentsDisabledConfig = mergeFileConfig({
        endpoints: {
          [EModelEndpoint.agents]: {
            disabled: true,
          },
          default: {
            disabled: false,
            fileLimit: 4,
          },
        },
      });
      const agentsDisabled = getEndpointFileConfig({
        fileConfig: agentsDisabledConfig,
        endpoint: 'unknownCustom',
        endpointType: EModelEndpoint.custom,
      });
      /** Should return agents config (disabled: true), not skip to default */
      expect(agentsDisabled.disabled).toBe(true);
      expect(agentsDisabled.fileLimit).toBe(0); /** disabled: true sets fileLimit to 0 */
    });
  });

  describe('standard endpoint lookup', () => {
    it('should find endpoint by endpointType', () => {
      const fileConfig: FileConfig = {
        ...baseFileConfig,
        endpoints: {
          ...baseFileConfig.endpoints,
          [EModelEndpoint.openAI]: {
            disabled: true,
            fileLimit: 15,
          },
        },
      };

      const result = getEndpointFileConfig({
        fileConfig,
        endpoint: 'someOtherName',
        endpointType: EModelEndpoint.openAI,
      });

      expect(result.disabled).toBe(true);
      expect(result.fileLimit).toBe(15);
    });

    it('should find endpoint by direct endpoint name', () => {
      const fileConfig: FileConfig = {
        ...baseFileConfig,
        endpoints: {
          ...baseFileConfig.endpoints,
          [EModelEndpoint.anthropic]: {
            disabled: false,
            fileLimit: 25,
          },
        },
      };

      const result = getEndpointFileConfig({
        fileConfig,
        endpoint: EModelEndpoint.anthropic,
      });

      expect(result.disabled).toBe(false);
      expect(result.fileLimit).toBe(25);
    });

    it('should find endpoint by normalized name', () => {
      const fileConfig: FileConfig = {
        ...baseFileConfig,
        endpoints: {
          ...baseFileConfig.endpoints,
          ollama: {
            disabled: true,
            fileLimit: 6,
          },
        },
      };

      /** Test normalization (Ollama -> ollama) */
      const result = getEndpointFileConfig({
        fileConfig,
        endpoint: 'Ollama',
      });

      expect(result.disabled).toBe(true);
      expect(result.fileLimit).toBe(6);
    });

    it('should use agents fallback for explicitly agents endpoint', () => {
      const fileConfig: FileConfig = {
        ...baseFileConfig,
        endpoints: {
          ...baseFileConfig.endpoints,
          [EModelEndpoint.agents]: {
            disabled: false,
            fileLimit: 11,
          },
        },
      };

      const result = getEndpointFileConfig({
        fileConfig,
        endpoint: EModelEndpoint.agents,
      });

      expect(result.disabled).toBe(false);
      expect(result.fileLimit).toBe(11);
    });

    it('should use agents fallback for unconfigured non-standard endpoint', () => {
      const fileConfig: FileConfig = {
        ...baseFileConfig,
        endpoints: {
          ...baseFileConfig.endpoints,
          [EModelEndpoint.agents]: {
            disabled: false,
            fileLimit: 10,
          },
          default: {
            disabled: false,
            fileLimit: 100,
          },
        },
      };

      const result = getEndpointFileConfig({
        fileConfig,
        endpoint: 'unconfiguredEndpoint',
      });

      /**
       * With new logic, unconfigured endpoints are treated as custom
       * and fall back through: specific -> custom -> agents -> default
       * So this should use agents (fileLimit: 10), not default
       */
      expect(result.disabled).toBe(false);
      expect(result.fileLimit).toBe(10);
    });

    it('should prioritize endpointType over endpoint name', () => {
      const fileConfig: FileConfig = {
        ...baseFileConfig,
        endpoints: {
          ...baseFileConfig.endpoints,
          [EModelEndpoint.openAI]: {
            disabled: true,
            fileLimit: 5,
          },
          [EModelEndpoint.anthropic]: {
            disabled: false,
            fileLimit: 10,
          },
        },
      };

      /** endpointType should take priority */
      const result = getEndpointFileConfig({
        fileConfig,
        endpoint: EModelEndpoint.openAI,
        endpointType: EModelEndpoint.anthropic,
      });

      expect(result.disabled).toBe(false);
      expect(result.fileLimit).toBe(10);
    });
  });

  describe('edge cases', () => {
    it('should return default when fileConfig is null', () => {
      const result = getEndpointFileConfig({
        fileConfig: null,
        endpoint: EModelEndpoint.openAI,
      });

      expect(result).toBeDefined();
      expect(result.disabled).toBe(false);
    });

    it('should return default when fileConfig is undefined', () => {
      const result = getEndpointFileConfig({
        fileConfig: undefined,
        endpoint: EModelEndpoint.openAI,
      });

      expect(result).toBeDefined();
      expect(result.disabled).toBe(false);
    });

    it('should handle empty endpoint gracefully', () => {
      const fileConfig: FileConfig = {
        ...baseFileConfig,
        endpoints: {
          ...baseFileConfig.endpoints,
          default: {
            disabled: false,
            fileLimit: 50,
          },
        },
      };

      const result = getEndpointFileConfig({
        fileConfig,
        endpoint: '',
      });

      expect(result.disabled).toBe(false);
      expect(result.fileLimit).toBe(50);
    });

    it('should handle null endpoint gracefully', () => {
      const fileConfig: FileConfig = {
        ...baseFileConfig,
        endpoints: {
          ...baseFileConfig.endpoints,
          default: {
            disabled: false,
            fileLimit: 50,
          },
        },
      };

      const result = getEndpointFileConfig({
        fileConfig,
        endpoint: null,
      });

      expect(result.disabled).toBe(false);
      expect(result.fileLimit).toBe(50);
    });

    it('should handle undefined endpoint gracefully', () => {
      const fileConfig: FileConfig = {
        ...baseFileConfig,
        endpoints: {
          ...baseFileConfig.endpoints,
          default: {
            disabled: false,
            fileLimit: 50,
          },
        },
      };

      const result = getEndpointFileConfig({
        fileConfig,
        endpoint: undefined,
      });

      expect(result.disabled).toBe(false);
      expect(result.fileLimit).toBe(50);
    });

    it('should not mutate the input fileConfig', () => {
      const fileConfig: FileConfig = {
        ...baseFileConfig,
        endpoints: {
          ...baseFileConfig.endpoints,
          [EModelEndpoint.openAI]: {
            disabled: false,
            fileLimit: 10,
          },
        },
      };

      const originalDisabled = fileConfig.endpoints[EModelEndpoint.openAI]!.disabled;

      getEndpointFileConfig({
        fileConfig,
        endpoint: EModelEndpoint.openAI,
      });

      /** Config should not be mutated */
      expect(fileConfig.endpoints[EModelEndpoint.openAI]!.disabled).toBe(originalDisabled);
    });
  });

  describe('assistants endpoint handling', () => {
    it('should find assistants endpoint config', () => {
      const fileConfig: FileConfig = {
        ...baseFileConfig,
        endpoints: {
          ...baseFileConfig.endpoints,
          [EModelEndpoint.assistants]: {
            disabled: false,
            fileLimit: 20,
          },
        },
      };

      const result = getEndpointFileConfig({
        fileConfig,
        endpoint: EModelEndpoint.assistants,
      });

      expect(result.disabled).toBe(false);
      expect(result.fileLimit).toBe(20);
    });

    it('should find azureAssistants endpoint config', () => {
      const fileConfig: FileConfig = {
        ...baseFileConfig,
        endpoints: {
          ...baseFileConfig.endpoints,
          [EModelEndpoint.azureAssistants]: {
            disabled: true,
            fileLimit: 15,
          },
        },
      };

      const result = getEndpointFileConfig({
        fileConfig,
        endpoint: EModelEndpoint.azureAssistants,
      });

      expect(result.disabled).toBe(true);
      expect(result.fileLimit).toBe(15);
    });

    it('should not fallback to agents for assistants endpoints', () => {
      const fileConfig: FileConfig = {
        ...baseFileConfig,
        endpoints: {
          ...baseFileConfig.endpoints,
          [EModelEndpoint.agents]: {
            disabled: true,
            fileLimit: 5,
          },
          default: {
            disabled: false,
            fileLimit: 10,
          },
        },
      };

      const result = getEndpointFileConfig({
        fileConfig,
        endpoint: 'unknownAssistants',
        endpointType: EModelEndpoint.assistants,
      });

      /** Should use default, not agents */
      expect(result.fileLimit).toBe(10);
    });
  });

  describe('agents endpoint handling', () => {
    it('should find agents endpoint config', () => {
      const fileConfig: FileConfig = {
        ...baseFileConfig,
        endpoints: {
          ...baseFileConfig.endpoints,
          [EModelEndpoint.agents]: {
            disabled: false,
            fileLimit: 9,
          },
        },
      };

      const result = getEndpointFileConfig({
        fileConfig,
        endpoint: EModelEndpoint.agents,
      });

      expect(result.disabled).toBe(false);
      expect(result.fileLimit).toBe(9);
    });
  });

  describe('mergeFileConfig integration', () => {
    it('should work with mergeFileConfig output for disabled endpoint', () => {
      const dynamicConfig = {
        endpoints: {
          [EModelEndpoint.openAI]: {
            disabled: true,
          },
        },
      };

      const merged = mergeFileConfig(dynamicConfig);
      const result = getEndpointFileConfig({
        fileConfig: merged,
        endpoint: EModelEndpoint.openAI,
      });

      expect(result.disabled).toBe(true);
      /** When disabled: true, merge sets these to 0 */
      expect(result.fileLimit).toBe(0);
      expect(result.fileSizeLimit).toBe(0);
      expect(result.totalSizeLimit).toBe(0);
      expect(result.supportedMimeTypes).toEqual([]);
    });

    it('should work with mergeFileConfig output for enabled endpoint', () => {
      const dynamicConfig = {
        endpoints: {
          [EModelEndpoint.anthropic]: {
            disabled: false,
            fileLimit: 5,
            fileSizeLimit: 10,
          },
        },
      };

      const merged = mergeFileConfig(dynamicConfig);
      const result = getEndpointFileConfig({
        fileConfig: merged,
        endpoint: EModelEndpoint.anthropic,
      });

      expect(result.disabled).toBe(false);
      expect(result.fileLimit).toBe(5);
      /** Should convert MB to bytes */
      expect(result.fileSizeLimit).toBe(10 * 1024 * 1024);
    });

    it('should preserve disabled: false in merged config', () => {
      const dynamicConfig = {
        endpoints: {
          [EModelEndpoint.anthropic]: {
            disabled: false,
            fileLimit: 8,
          },
        },
      };

      const merged = mergeFileConfig(dynamicConfig);
      const result = getEndpointFileConfig({
        fileConfig: merged,
        endpoint: EModelEndpoint.anthropic,
      });

      expect(result.disabled).toBe(false);
      expect(result.fileLimit).toBe(8);
    });

    it('should not mutate base fileConfig during merge', () => {
      const originalBaseAgentsConfig = { ...baseFileConfig.endpoints.agents };

      const dynamicConfig = {
        endpoints: {
          [EModelEndpoint.agents]: {
            disabled: true,
            fileLimit: 1,
          },
        },
      };

      mergeFileConfig(dynamicConfig);

      /** Base config should not be mutated */
      expect(baseFileConfig.endpoints.agents).toEqual(originalBaseAgentsConfig);
    });
  });

  describe('lookup priority verification', () => {
    it('should check endpointType before endpoint for standard endpoints', () => {
      const fileConfig: FileConfig = {
        ...baseFileConfig,
        endpoints: {
          ...baseFileConfig.endpoints,
          [EModelEndpoint.openAI]: {
            disabled: true,
            fileLimit: 1,
          },
          wrongEndpoint: {
            disabled: false,
            fileLimit: 99,
          },
        },
      };

      const result = getEndpointFileConfig({
        fileConfig,
        endpoint: 'wrongEndpoint',
        endpointType: EModelEndpoint.openAI,
      });

      /** Should use endpointType config, not endpoint */
      expect(result.fileLimit).toBe(1);
    });

    it('should check endpoint when endpointType not found', () => {
      const fileConfig: FileConfig = {
        ...baseFileConfig,
        endpoints: {
          ...baseFileConfig.endpoints,
          myCustomEndpoint: {
            disabled: true,
            fileLimit: 7,
          },
        },
      };

      const result = getEndpointFileConfig({
        fileConfig,
        endpoint: 'myCustomEndpoint',
        endpointType: 'notFound',
      });

      expect(result.fileLimit).toBe(7);
    });
  });

  describe('disabled handling', () => {
    it('should properly handle disabled: true', () => {
      const fileConfig: FileConfig = {
        ...baseFileConfig,
        endpoints: {
          ...baseFileConfig.endpoints,
          [EModelEndpoint.openAI]: {
            disabled: true,
            fileLimit: 0,
            fileSizeLimit: 0,
            totalSizeLimit: 0,
            supportedMimeTypes: [],
          },
        },
      };

      const result = getEndpointFileConfig({
        fileConfig,
        endpoint: EModelEndpoint.openAI,
      });

      expect(result.disabled).toBe(true);
      expect(result.fileLimit).toBe(0);
      expect(result.fileSizeLimit).toBe(0);
      expect(result.totalSizeLimit).toBe(0);
      expect(result.supportedMimeTypes).toEqual([]);
    });

    it('should properly handle disabled: false', () => {
      const fileConfig: FileConfig = {
        ...baseFileConfig,
        endpoints: {
          ...baseFileConfig.endpoints,
          [EModelEndpoint.anthropic]: {
            disabled: false,
            fileLimit: 10,
          },
        },
      };

      const result = getEndpointFileConfig({
        fileConfig,
        endpoint: EModelEndpoint.anthropic,
      });

      expect(result.disabled).toBe(false);
      expect(result.fileLimit).toBe(10);
    });

    it('should treat undefined disabled as enabled', () => {
      const fileConfig: FileConfig = {
        ...baseFileConfig,
        endpoints: {
          ...baseFileConfig.endpoints,
          [EModelEndpoint.google]: {
            fileLimit: 10,
          },
        },
      };

      const result = getEndpointFileConfig({
        fileConfig,
        endpoint: EModelEndpoint.google,
      });

      /** disabled should not be explicitly true */
      expect(result.disabled).not.toBe(true);
    });
  });

  describe('partial config merging', () => {
    it('should merge partial endpoint config with default config', () => {
      const dynamicConfig = {
        endpoints: {
          google: {
            fileSizeLimit: 500,
            /** Note: supportedMimeTypes not configured */
          },
        },
      };

      const merged = mergeFileConfig(dynamicConfig);
      const result = getEndpointFileConfig({
        fileConfig: merged,
        endpoint: EModelEndpoint.google,
      });

      /** Should have the configured fileSizeLimit */
      expect(result.fileSizeLimit).toBe(500 * 1024 * 1024);
      /** Should have supportedMimeTypes from default config */
      expect(result.supportedMimeTypes).toBeDefined();
      expect(Array.isArray(result.supportedMimeTypes)).toBe(true);
      expect(result.supportedMimeTypes!.length).toBeGreaterThan(0);
      /** Should have other fields from default */
      expect(result.fileLimit).toBeDefined();
      expect(result.totalSizeLimit).toBeDefined();
    });

    it('should not override explicitly set fields with default', () => {
      const dynamicConfig = {
        endpoints: {
          anthropic: {
            disabled: true,
            fileLimit: 3,
          },
        },
      };

      const merged = mergeFileConfig(dynamicConfig);
      const result = getEndpointFileConfig({
        fileConfig: merged,
        endpoint: EModelEndpoint.anthropic,
      });

      /** Should keep explicitly configured values */
      expect(result.disabled).toBe(true);
      expect(result.fileLimit).toBe(0); /** disabled: true sets to 0 in merge */
      /** But still get supportedMimeTypes from... wait, disabled: true clears this */
      expect(result.supportedMimeTypes).toEqual([]);
    });

    it('should handle endpoint with only fileSizeLimit configured', () => {
      const dynamicConfig = {
        endpoints: {
          openAI: {
            fileSizeLimit: 100,
          },
        },
      };

      const merged = mergeFileConfig(dynamicConfig);
      const result = getEndpointFileConfig({
        fileConfig: merged,
        endpoint: EModelEndpoint.openAI,
      });

      expect(result.fileSizeLimit).toBe(100 * 1024 * 1024);
      /** Should get these from default */
      expect(result.supportedMimeTypes).toBeDefined();
      expect(result.fileLimit).toBeDefined();
      expect(result.disabled).not.toBe(true);
    });

    it('should merge supportedMimeTypes from default when only fileSizeLimit is configured', () => {
      /** This tests the exact scenario from the issue */
      const dynamicConfig = {
        endpoints: {
          google: {
            fileSizeLimit: 1000000024,
          },
        },
      };

      const merged = mergeFileConfig(dynamicConfig);
      const result = getEndpointFileConfig({
        fileConfig: merged,
        endpoint: EModelEndpoint.google,
      });

      /** Should have the massive fileSizeLimit configured */
      expect(result.fileSizeLimit).toBe(1000000024 * 1024 * 1024);
      /** CRITICAL: Should have supportedMimeTypes from default, not undefined or [] */
      expect(result.supportedMimeTypes).toBeDefined();
      expect(Array.isArray(result.supportedMimeTypes)).toBe(true);
      expect(result.supportedMimeTypes!.length).toBeGreaterThan(0);
      /** Should have other default fields */
      expect(result.fileLimit).toBe(10);
      expect(result.disabled).toBe(false);
    });
  });

  describe('real-world scenarios', () => {
    it('should handle multi-provider custom endpoint configuration', () => {
      const fileConfig: FileConfig = {
        ...baseFileConfig,
        endpoints: {
          ...baseFileConfig.endpoints,
          ollama: {
            disabled: false,
            fileLimit: 5,
          },
          lmstudio: {
            disabled: true,
            fileLimit: 3,
          },
          [EModelEndpoint.custom]: {
            disabled: false,
            fileLimit: 10,
          },
        },
      };

      const ollamaResult = getEndpointFileConfig({
        fileConfig,
        endpoint: 'ollama',
        endpointType: EModelEndpoint.custom,
      });
      expect(ollamaResult.fileLimit).toBe(5);

      const lmstudioResult = getEndpointFileConfig({
        fileConfig,
        endpoint: 'lmstudio',
        endpointType: EModelEndpoint.custom,
      });
      expect(lmstudioResult.disabled).toBe(true);
      expect(lmstudioResult.fileLimit).toBe(3);

      const unknownResult = getEndpointFileConfig({
        fileConfig,
        endpoint: 'unknownProvider',
        endpointType: EModelEndpoint.custom,
      });
      expect(unknownResult.fileLimit).toBe(10);
    });

    it('should handle switching between endpoints correctly', () => {
      const fileConfig: FileConfig = {
        ...baseFileConfig,
        endpoints: {
          ...baseFileConfig.endpoints,
          [EModelEndpoint.openAI]: {
            disabled: true,
          },
          [EModelEndpoint.anthropic]: {
            disabled: false,
            fileLimit: 15,
          },
        },
      };

      const openaiResult = getEndpointFileConfig({
        fileConfig,
        endpoint: EModelEndpoint.openAI,
      });
      expect(openaiResult.disabled).toBe(true);

      const anthropicResult = getEndpointFileConfig({
        fileConfig,
        endpoint: EModelEndpoint.anthropic,
      });
      expect(anthropicResult.disabled).toBe(false);
      expect(anthropicResult.fileLimit).toBe(15);
    });
  });

  describe('user-configured default behavior', () => {
    it('should use user-configured default as effective default when endpoint not found', () => {
      const dynamicConfig = {
        endpoints: {
          default: {
            fileLimit: 7,
          },
        },
      };

      const merged = mergeFileConfig(dynamicConfig);
      const result = getEndpointFileConfig({
        fileConfig: merged,
        endpoint: EModelEndpoint.google,
      });

      expect(result.fileLimit).toBe(7);
      expect(result.disabled).toBe(false);
      expect(result.supportedMimeTypes).toBeDefined();
      expect(Array.isArray(result.supportedMimeTypes)).toBe(true);
      expect(result.supportedMimeTypes!.length).toBeGreaterThan(0);
    });

    it('should merge endpoint config against user default (not base default)', () => {
      const dynamicConfig = {
        endpoints: {
          default: {
            fileLimit: 7,
          },
          google: {
            fileSizeLimit: 123,
          },
        },
      };

      const merged = mergeFileConfig(dynamicConfig);
      const result = getEndpointFileConfig({
        fileConfig: merged,
        endpoint: EModelEndpoint.google,
      });

      /** fileLimit should come from user default */
      expect(result.fileLimit).toBe(7);
      /** fileSizeLimit should come from endpoint (converted to bytes) */
      expect(result.fileSizeLimit).toBe(123 * 1024 * 1024);
    });

    it('should respect user-configured default supportedMimeTypes override', () => {
      const dynamicConfig = {
        endpoints: {
          default: {
            supportedMimeTypes: ['^text\\/plain$'],
          },
        },
      };

      const merged = mergeFileConfig(dynamicConfig);
      const result = getEndpointFileConfig({
        fileConfig: merged,
      });

      /** Only text/plain should be allowed */
      expect(result.supportedMimeTypes).toBeDefined();
      expect(result.supportedMimeTypes!.length).toBe(1);
      const [onlyRegex] = result.supportedMimeTypes as RegExp[];
      expect(onlyRegex.test('text/plain')).toBe(true);
      expect(onlyRegex.test('image/png')).toBe(false);
    });

    it('should propagate disabled from user default across fallbacks', () => {
      const dynamicConfig = {
        endpoints: {
          default: {
            disabled: true,
          },
        },
      };

      const merged = mergeFileConfig(dynamicConfig);
      const result = getEndpointFileConfig({
        fileConfig: merged,
        endpoint: EModelEndpoint.google,
      });

      expect(result.disabled).toBe(true);
      expect(result.fileLimit).toBe(0);
      expect(result.fileSizeLimit).toBe(0);
      expect(result.totalSizeLimit).toBe(0);
      expect(result.supportedMimeTypes).toEqual([]);
    });
  });
});
