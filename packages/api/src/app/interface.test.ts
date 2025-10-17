import { logger, loadDefaultInterface } from '@librechat/data-schemas';
import type { TCustomConfig, TConfigDefaults } from 'librechat-data-provider';

// Mock the logger
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
  },
  loadDefaultInterface: jest.requireActual('@librechat/data-schemas').loadDefaultInterface,
}));

// Mock isMemoryEnabled
jest.mock('@librechat/data-schemas/dist/app/memory', () => ({
  isMemoryEnabled: jest.fn((config) => !!config?.agent),
}));

describe('loadDefaultInterface', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fileSearchSelected configuration', () => {
    it('should include fileSearchSelected when explicitly set to true', async () => {
      const config: Partial<TCustomConfig> = {
        interface: {
          fileSearch: true,
          fileSearchSelected: true,
        },
      };
      const configDefaults: TConfigDefaults = {
        interface: {
          fileSearch: true,
          fileSearchSelected: false,
        },
      };

      const result = await loadDefaultInterface({ config, configDefaults });

      expect(result.fileSearchSelected).toBe(true);
    });

    it('should include fileSearchSelected when explicitly set to false', async () => {
      const config: Partial<TCustomConfig> = {
        interface: {
          fileSearch: true,
          fileSearchSelected: false,
        },
      };
      const configDefaults: TConfigDefaults = {
        interface: {
          fileSearch: true,
          fileSearchSelected: true,
        },
      };

      const result = await loadDefaultInterface({ config, configDefaults });

      expect(result.fileSearchSelected).toBe(false);
    });

    it('should not include fileSearchSelected when not configured', async () => {
      const config: Partial<TCustomConfig> = {
        interface: {
          fileSearch: true,
        },
      };
      const configDefaults: TConfigDefaults = {
        interface: {
          fileSearch: true,
        },
      };

      const result = await loadDefaultInterface({ config, configDefaults });

      expect(result.fileSearchSelected).toBeUndefined();
    });

    it('should handle fileSearchSelected when fileSearch is false', async () => {
      const config: Partial<TCustomConfig> = {
        interface: {
          fileSearch: false,
          fileSearchSelected: false,
        },
      };
      const configDefaults: TConfigDefaults = {
        interface: {
          fileSearch: false,
          fileSearchSelected: false,
        },
      };

      const result = await loadDefaultInterface({ config, configDefaults });

      expect(result.fileSearchSelected).toBe(false);
    });
  });

  describe('fileSearchSelected validation', () => {
    it('should throw error when fileSearch is false but fileSearchSelected is true', async () => {
      const config: Partial<TCustomConfig> = {
        interface: {
          fileSearch: false,
          fileSearchSelected: true,
        },
      };
      const configDefaults: TConfigDefaults = {
        interface: {
          fileSearch: true,
          fileSearchSelected: false,
        },
      };

      await expect(loadDefaultInterface({ config, configDefaults })).rejects.toThrow(
        'Configuration error: fileSearchSelected cannot be enabled when fileSearch is disabled',
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Invalid configuration: fileSearchSelected cannot be true when fileSearch is false. ' +
          'Either enable fileSearch or disable fileSearchSelected.',
      );
    });

    it('should not throw error when fileSearch is true and fileSearchSelected is true', async () => {
      const config: Partial<TCustomConfig> = {
        interface: {
          fileSearch: true,
          fileSearchSelected: true,
        },
      };
      const configDefaults: TConfigDefaults = {
        interface: {
          fileSearch: true,
          fileSearchSelected: false,
        },
      };

      await expect(loadDefaultInterface({ config, configDefaults })).resolves.not.toThrow();

      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should not throw error when fileSearch is true and fileSearchSelected is false', async () => {
      const config: Partial<TCustomConfig> = {
        interface: {
          fileSearch: true,
          fileSearchSelected: false,
        },
      };
      const configDefaults: TConfigDefaults = {
        interface: {
          fileSearch: true,
          fileSearchSelected: true,
        },
      };

      await expect(loadDefaultInterface({ config, configDefaults })).resolves.not.toThrow();

      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should not throw error when both fileSearch and fileSearchSelected are false', async () => {
      const config: Partial<TCustomConfig> = {
        interface: {
          fileSearch: false,
          fileSearchSelected: false,
        },
      };
      const configDefaults: TConfigDefaults = {
        interface: {
          fileSearch: false,
          fileSearchSelected: false,
        },
      };

      await expect(loadDefaultInterface({ config, configDefaults })).resolves.not.toThrow();

      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should not throw error when fileSearch is undefined and fileSearchSelected is true', async () => {
      const config: Partial<TCustomConfig> = {
        interface: {
          fileSearchSelected: true,
        },
      };
      const configDefaults: TConfigDefaults = {
        interface: {
          fileSearch: true,
          fileSearchSelected: false,
        },
      };

      await expect(loadDefaultInterface({ config, configDefaults })).resolves.not.toThrow();

      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should throw error when fileSearch is explicitly false and fileSearchSelected is true (from defaults)', async () => {
      const config: Partial<TCustomConfig> = {
        interface: {
          fileSearch: false,
        },
      };
      const configDefaults: TConfigDefaults = {
        interface: {
          fileSearch: false,
          fileSearchSelected: true, // This should cause validation error
        },
      };

      // Since fileSearchSelected comes from defaults but fileSearch is explicitly false in config,
      // this should trigger validation error
      await expect(loadDefaultInterface({ config, configDefaults })).rejects.toThrow(
        'Configuration error: fileSearchSelected cannot be enabled when fileSearch is disabled',
      );
    });
  });

  describe('complex configuration scenarios', () => {
    it('should handle complex interface configuration with fileSearchSelected', async () => {
      const config: Partial<TCustomConfig> = {
        interface: {
          endpointsMenu: true,
          modelSelect: true,
          parameters: true,
          fileSearch: true,
          fileSearchSelected: true,
          prompts: true,
          bookmarks: true,
        },
      };
      const configDefaults: TConfigDefaults = {
        interface: {
          endpointsMenu: false,
          modelSelect: false,
          parameters: false,
          fileSearch: false,
          fileSearchSelected: false,
          prompts: false,
          bookmarks: false,
        },
      };

      const result = await loadDefaultInterface({ config, configDefaults });

      expect(result.endpointsMenu).toBe(true);
      expect(result.modelSelect).toBe(true);
      expect(result.parameters).toBe(true);
      expect(result.fileSearch).toBe(true);
      expect(result.fileSearchSelected).toBe(true);
      expect(result.prompts).toBe(true);
      expect(result.bookmarks).toBe(true);
    });

    it('should use defaults when config is empty', async () => {
      const config: Partial<TCustomConfig> = {};
      const configDefaults: TConfigDefaults = {
        interface: {
          fileSearch: true,
          fileSearchSelected: true,
        },
      };

      const result = await loadDefaultInterface({ config, configDefaults });

      expect(result.fileSearch).toBe(true);
      expect(result.fileSearchSelected).toBe(true);
    });

    it('should handle undefined config', async () => {
      const config = undefined;
      const configDefaults: TConfigDefaults = {
        interface: {
          fileSearch: true,
          fileSearchSelected: false,
        },
      };

      const result = await loadDefaultInterface({ config, configDefaults });

      expect(result.fileSearch).toBe(true);
      expect(result.fileSearchSelected).toBe(false);
    });
  });

  describe('integration with modelSpecs', () => {
    it('should respect modelSpecs settings while preserving fileSearchSelected', async () => {
      const config: Partial<TCustomConfig> = {
        interface: {
          fileSearch: true,
          fileSearchSelected: true,
        },
        modelSpecs: {
          list: [
            {
              name: 'test-spec',
              preset: {
                endpoint: 'openAI',
                model: 'gpt-4',
              },
            },
          ],
        },
      };
      const configDefaults: TConfigDefaults = {
        interface: {
          endpointsMenu: true,
          modelSelect: true,
          parameters: true,
          presets: true,
          fileSearch: false,
          fileSearchSelected: false,
        },
      };

      const result = await loadDefaultInterface({ config, configDefaults });

      // These should be influenced by modelSpecs
      expect(result.endpointsMenu).toBe(false);
      expect(result.parameters).toBe(false);
      expect(result.presets).toBe(false);

      // These should preserve explicit configuration
      expect(result.fileSearch).toBe(true);
      expect(result.fileSearchSelected).toBe(true);
    });
  });

  describe('removeNullishValues behavior', () => {
    it('should exclude fileSearchSelected when it is undefined', async () => {
      const config: Partial<TCustomConfig> = {
        interface: {
          fileSearch: true,
          // fileSearchSelected is undefined
        },
      };
      const configDefaults: TConfigDefaults = {
        interface: {
          fileSearch: true,
          // fileSearchSelected not in defaults either
        },
      };

      const result = await loadDefaultInterface({ config, configDefaults });

      expect(result).not.toHaveProperty('fileSearchSelected');
    });

    it('should include fileSearchSelected when it is false (not nullish)', async () => {
      const config: Partial<TCustomConfig> = {
        interface: {
          fileSearch: true,
          fileSearchSelected: false,
        },
      };
      const configDefaults: TConfigDefaults = {
        interface: {
          fileSearch: true,
          fileSearchSelected: true,
        },
      };

      const result = await loadDefaultInterface({ config, configDefaults });

      expect(result).toHaveProperty('fileSearchSelected', false);
    });
  });
});
