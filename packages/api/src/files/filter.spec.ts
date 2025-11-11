import { Types } from 'mongoose';
import { Providers } from '@librechat/agents';
import { EModelEndpoint } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type { ServerRequest } from '~/types';
import { filterFilesByEndpointConfig } from './filter';

describe('filterFilesByEndpointConfig', () => {
  /** Helper to create a mock file */
  const createMockFile = (filename: string): IMongoFile =>
    ({
      _id: new Types.ObjectId(),
      user: new Types.ObjectId(),
      file_id: new Types.ObjectId().toString(),
      filename,
      type: 'application/pdf',
      bytes: 1024,
      object: 'file',
      usage: 0,
      source: 'test',
      filepath: `/test/${filename}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    }) as unknown as IMongoFile;

  describe('when files are disabled for endpoint', () => {
    it('should return empty array when endpoint has disabled: true', () => {
      const req = {
        config: {
          fileConfig: {
            endpoints: {
              [Providers.OPENAI]: {
                disabled: true,
              },
            },
          },
        },
      } as unknown as ServerRequest;

      const files = [createMockFile('test1.pdf'), createMockFile('test2.pdf')];

      const result = filterFilesByEndpointConfig(req, {
        files,
        endpoint: Providers.OPENAI,
      });

      expect(result).toEqual([]);
    });

    it('should return empty array when default endpoint has disabled: true and provider not found', () => {
      const req = {
        config: {
          fileConfig: {
            endpoints: {
              default: {
                disabled: true,
              },
            },
          },
        },
      } as unknown as ServerRequest;

      const files = [createMockFile('test.pdf')];

      const result = filterFilesByEndpointConfig(req, {
        files,
        endpoint: Providers.OPENAI,
      });

      expect(result).toEqual([]);
    });

    it('should return empty array for disabled Anthropic endpoint', () => {
      const req = {
        config: {
          fileConfig: {
            endpoints: {
              [Providers.ANTHROPIC]: {
                disabled: true,
              },
            },
          },
        },
      } as unknown as ServerRequest;

      const files = [createMockFile('doc.pdf')];

      const result = filterFilesByEndpointConfig(req, {
        files,
        endpoint: Providers.ANTHROPIC,
      });

      expect(result).toEqual([]);
    });

    it('should return empty array for disabled Google endpoint', () => {
      const req = {
        config: {
          fileConfig: {
            endpoints: {
              [Providers.GOOGLE]: {
                disabled: true,
              },
            },
          },
        },
      } as unknown as ServerRequest;

      const files = [createMockFile('video.mp4')];

      const result = filterFilesByEndpointConfig(req, {
        files,
        endpoint: Providers.GOOGLE,
      });

      expect(result).toEqual([]);
    });
  });

  describe('when files are enabled for endpoint', () => {
    it('should return all files when endpoint has disabled: false', () => {
      const req = {
        config: {
          fileConfig: {
            endpoints: {
              [Providers.OPENAI]: {
                disabled: false,
              },
            },
          },
        },
      } as unknown as ServerRequest;

      const files = [createMockFile('test1.pdf'), createMockFile('test2.pdf')];

      const result = filterFilesByEndpointConfig(req, {
        files,
        endpoint: Providers.OPENAI,
      });

      expect(result).toEqual(files);
    });

    it('should return all files when endpoint config exists but disabled is not set', () => {
      const req = {
        config: {
          fileConfig: {
            endpoints: {
              [Providers.OPENAI]: {
                fileSizeLimit: 10,
              },
            },
          },
        },
      } as unknown as ServerRequest;

      const files = [createMockFile('test.pdf')];

      const result = filterFilesByEndpointConfig(req, {
        files,
        endpoint: Providers.OPENAI,
      });

      expect(result).toEqual(files);
    });

    it('should return all files when no fileConfig exists', () => {
      const req = {} as ServerRequest;

      const files = [createMockFile('test1.pdf'), createMockFile('test2.pdf')];

      const result = filterFilesByEndpointConfig(req, {
        files,
        endpoint: Providers.OPENAI,
      });

      expect(result).toEqual(files);
    });

    it('should return all files when endpoint not in config and no default', () => {
      const req = {
        config: {
          fileConfig: {
            endpoints: {
              [Providers.ANTHROPIC]: {
                disabled: true,
              },
            },
          },
        },
      } as unknown as ServerRequest;

      const files = [createMockFile('test.pdf')];

      /** OpenAI not configured, should use base defaults which allow files */
      const result = filterFilesByEndpointConfig(req, {
        files,
        endpoint: Providers.OPENAI,
      });

      expect(result).toEqual(files);
    });
  });

  describe('custom endpoint configuration', () => {
    it('should use direct endpoint lookup when endpointType is custom', () => {
      const req = {
        config: {
          fileConfig: {
            endpoints: {
              ollama: {
                disabled: true,
              },
            },
          },
        },
      } as unknown as ServerRequest;

      const files = [createMockFile('test.pdf')];

      const result = filterFilesByEndpointConfig(req, {
        files,
        endpoint: 'ollama',
        endpointType: EModelEndpoint.custom,
      });

      expect(result).toEqual([]);
    });

    it('should use normalized endpoint lookup for custom endpoints', () => {
      const req = {
        config: {
          fileConfig: {
            endpoints: {
              ollama: {
                disabled: true,
              },
            },
          },
        },
      } as unknown as ServerRequest;

      const files = [createMockFile('test.pdf')];

      /** Test with non-normalized endpoint name (e.g., "Ollama" vs "ollama") */
      const result = filterFilesByEndpointConfig(req, {
        files,
        endpoint: 'Ollama',
        endpointType: EModelEndpoint.custom,
      });

      expect(result).toEqual([]);
    });

    it('should fallback to "custom" config when specific custom endpoint not found', () => {
      const req = {
        config: {
          fileConfig: {
            endpoints: {
              [EModelEndpoint.custom]: {
                disabled: true,
              },
            },
          },
        },
      } as unknown as ServerRequest;

      const files = [createMockFile('test.pdf')];

      const result = filterFilesByEndpointConfig(req, {
        files,
        endpoint: 'unknownCustomEndpoint',
        endpointType: EModelEndpoint.custom,
      });

      expect(result).toEqual([]);
    });

    it('should return files when custom endpoint has disabled: false', () => {
      const req = {
        config: {
          fileConfig: {
            endpoints: {
              ollama: {
                disabled: false,
              },
            },
          },
        },
      } as unknown as ServerRequest;

      const files = [createMockFile('test1.pdf'), createMockFile('test2.pdf')];

      const result = filterFilesByEndpointConfig(req, {
        files,
        endpoint: 'ollama',
        endpointType: EModelEndpoint.custom,
      });

      expect(result).toEqual(files);
    });

    it('should use agents config as fallback for custom endpoints', () => {
      const req = {
        config: {
          fileConfig: {
            endpoints: {
              [EModelEndpoint.agents]: {
                disabled: false,
              },
            },
          },
        },
      } as unknown as ServerRequest;

      const files = [createMockFile('test.pdf')];

      /**
       * Lookup order for custom endpoint: explicitConfig -> custom -> agents -> default
       * Should find and use agents config
       */
      const result = filterFilesByEndpointConfig(req, {
        files,
        endpoint: 'ollama',
        endpointType: EModelEndpoint.custom,
      });

      expect(result).toEqual(files);
    });

    it('should fallback to default when agents is not configured for custom endpoint', () => {
      const req = {
        config: {
          fileConfig: {
            endpoints: {
              /** Only default configured, no agents or custom */
              default: {
                disabled: false,
                fileLimit: 10,
                fileSizeLimit: 20,
                totalSizeLimit: 50,
              },
            },
          },
        },
      } as unknown as ServerRequest;

      const files = [createMockFile('test.pdf')];

      /**
       * Lookup order: explicitConfig -> custom -> agents -> default
       * Since none of first three exist, should fall back to default
       */
      const result = filterFilesByEndpointConfig(req, {
        files,
        endpoint: 'ollama',
        endpointType: EModelEndpoint.custom,
      });

      expect(result).toEqual(files);
    });

    it('should use default when agents is not configured for custom endpoint', () => {
      const req = {
        config: {
          fileConfig: {
            endpoints: {
              /** NO agents config - should skip to default */
              default: {
                disabled: false,
                fileLimit: 15,
              },
            },
          },
        },
      } as unknown as ServerRequest;

      const files = [createMockFile('test.pdf')];

      /**
       * Lookup order: explicitConfig -> custom -> agents -> default
       * Since agents is not configured, should fall back to default
       */
      const result = filterFilesByEndpointConfig(req, {
        files,
        endpoint: 'ollama',
        endpointType: EModelEndpoint.custom,
      });

      expect(result).toEqual(files);
    });

    it('should block files when agents is disabled for unconfigured custom endpoint', () => {
      const req = {
        config: {
          fileConfig: {
            endpoints: {
              agents: {
                disabled: true,
              },
              default: {
                disabled: false,
              },
            },
          },
        },
      } as unknown as ServerRequest;

      const files = [createMockFile('test.pdf')];

      /**
       * Lookup order: explicitConfig -> custom -> agents -> default
       * Should use agents config which is disabled: true
       */
      const result = filterFilesByEndpointConfig(req, {
        files,
        endpoint: 'ollama',
        endpointType: EModelEndpoint.custom,
      });

      expect(result).toEqual([]);
    });

    it('should prioritize specific custom endpoint over generic custom config', () => {
      const req = {
        config: {
          fileConfig: {
            endpoints: {
              [EModelEndpoint.custom]: {
                disabled: false,
              },
              ollama: {
                disabled: true,
              },
            },
          },
        },
      } as unknown as ServerRequest;

      const files = [createMockFile('test.pdf')];

      /** Should use ollama config (disabled: true), not custom config (disabled: false) */
      const result = filterFilesByEndpointConfig(req, {
        files,
        endpoint: 'ollama',
        endpointType: EModelEndpoint.custom,
      });

      expect(result).toEqual([]);
    });

    it('should handle case-insensitive custom endpoint names', () => {
      const req = {
        config: {
          fileConfig: {
            endpoints: {
              ollama: {
                disabled: true,
              },
            },
          },
        },
      } as unknown as ServerRequest;

      const files = [createMockFile('test.pdf')];

      /** Test various case combinations */
      const result1 = filterFilesByEndpointConfig(req, {
        files,
        endpoint: 'OLLAMA',
        endpointType: EModelEndpoint.custom,
      });

      const result2 = filterFilesByEndpointConfig(req, {
        files,
        endpoint: 'OlLaMa',
        endpointType: EModelEndpoint.custom,
      });

      expect(result1).toEqual([]);
      expect(result2).toEqual([]);
    });

    it('should work without endpointType for standard endpoints but require it for custom', () => {
      const req = {
        config: {
          fileConfig: {
            endpoints: {
              [Providers.OPENAI]: {
                disabled: true,
              },
              ollama: {
                disabled: true,
              },
              default: {
                disabled: false,
                fileLimit: 10,
                fileSizeLimit: 20,
                totalSizeLimit: 50,
              },
            },
          },
        },
      } as unknown as ServerRequest;

      const files = [createMockFile('test.pdf')];

      /** Standard endpoint works without endpointType */
      const openaiResult = filterFilesByEndpointConfig(req, {
        files,
        endpoint: Providers.OPENAI,
      });
      expect(openaiResult).toEqual([]);

      /** Custom endpoint with endpointType uses specific config */
      const customWithTypeResult = filterFilesByEndpointConfig(req, {
        files,
        endpoint: 'ollama',
        endpointType: EModelEndpoint.custom,
      });
      expect(customWithTypeResult).toEqual([]);

      /** Custom endpoint without endpointType tries direct lookup, falls back to default */
      const customWithoutTypeResult = filterFilesByEndpointConfig(req, {
        files,
        endpoint: 'unknownCustom',
      });
      expect(customWithoutTypeResult).toEqual(files);
    });
  });

  describe('edge cases', () => {
    it('should return empty array when files input is undefined', () => {
      const req = {
        config: {
          fileConfig: {
            endpoints: {
              [Providers.OPENAI]: {
                disabled: false,
              },
            },
          },
        },
      } as unknown as ServerRequest;

      const result = filterFilesByEndpointConfig(req, {
        files: undefined,
        endpoint: Providers.OPENAI,
      });

      expect(result).toEqual([]);
    });

    it('should return empty array when files input is empty array', () => {
      const req = {
        config: {
          fileConfig: {
            endpoints: {
              [Providers.OPENAI]: {
                disabled: false,
              },
            },
          },
        },
      } as unknown as ServerRequest;

      const result = filterFilesByEndpointConfig(req, {
        files: [],
        endpoint: Providers.OPENAI,
      });

      expect(result).toEqual([]);
    });

    it('should handle custom provider strings', () => {
      const req = {
        config: {
          fileConfig: {
            endpoints: {
              customProvider: {
                disabled: true,
              },
            },
          },
        },
      } as unknown as ServerRequest;

      const files = [createMockFile('test.pdf')];

      const result = filterFilesByEndpointConfig(req, {
        files,
        endpoint: 'customProvider',
        endpointType: EModelEndpoint.custom,
      });

      expect(result).toEqual([]);
    });
  });

  describe('bypass scenarios from bug report', () => {
    it('should block files when switching from enabled to disabled endpoint', () => {
      /**
       * Scenario: User attaches files under Anthropic (enabled),
       * then switches to OpenAI (disabled)
       */
      const req = {
        config: {
          fileConfig: {
            endpoints: {
              [Providers.OPENAI]: {
                disabled: true,
              },
              [Providers.ANTHROPIC]: {
                disabled: false,
              },
            },
          },
        },
      } as unknown as ServerRequest;

      const files = [createMockFile('document.pdf')];

      /** Files were attached under Anthropic */
      const anthropicResult = filterFilesByEndpointConfig(req, {
        files,
        endpoint: Providers.ANTHROPIC,
      });
      expect(anthropicResult).toEqual(files);

      /** User switches to OpenAI - files should be filtered out */
      const openaiResult = filterFilesByEndpointConfig(req, {
        files,
        endpoint: Providers.OPENAI,
      });
      expect(openaiResult).toEqual([]);
    });

    it('should prevent drag-and-drop bypass by filtering at agent initialization', () => {
      /**
       * Scenario: User drags file into disabled endpoint
       * Server processes it but filter should remove it
       */
      const req = {
        config: {
          fileConfig: {
            endpoints: {
              [Providers.OPENAI]: {
                disabled: true,
              },
            },
          },
        },
      } as unknown as ServerRequest;

      const draggedFiles = [createMockFile('dragged.pdf')];

      const result = filterFilesByEndpointConfig(req, {
        files: draggedFiles,
        endpoint: Providers.OPENAI,
      });

      expect(result).toEqual([]);
    });

    it('should filter multiple files when endpoint disabled', () => {
      const req = {
        config: {
          fileConfig: {
            endpoints: {
              [Providers.OPENAI]: {
                disabled: true,
              },
            },
          },
        },
      } as unknown as ServerRequest;

      const files = [
        createMockFile('file1.pdf'),
        createMockFile('file2.pdf'),
        createMockFile('file3.pdf'),
      ];

      const result = filterFilesByEndpointConfig(req, {
        files,
        endpoint: Providers.OPENAI,
      });

      expect(result).toEqual([]);
    });
  });
});
