import { Providers } from '@librechat/agents';
import type { IMongoFile } from '@librechat/data-schemas';
import type { ServerRequest } from '~/types';
import { filterFilesByEndpointConfig } from './filter';
import { Types } from 'mongoose';

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

      const result = filterFilesByEndpointConfig(req, files, Providers.OPENAI);

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

      const result = filterFilesByEndpointConfig(req, files, Providers.OPENAI);

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

      const result = filterFilesByEndpointConfig(req, files, Providers.ANTHROPIC);

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

      const result = filterFilesByEndpointConfig(req, files, Providers.GOOGLE);

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

      const result = filterFilesByEndpointConfig(req, files, Providers.OPENAI);

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

      const result = filterFilesByEndpointConfig(req, files, Providers.OPENAI);

      expect(result).toEqual(files);
    });

    it('should return all files when no fileConfig exists', () => {
      const req = {} as ServerRequest;

      const files = [createMockFile('test1.pdf'), createMockFile('test2.pdf')];

      const result = filterFilesByEndpointConfig(req, files, Providers.OPENAI);

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
      const result = filterFilesByEndpointConfig(req, files, Providers.OPENAI);

      expect(result).toEqual(files);
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

      const result = filterFilesByEndpointConfig(req, undefined, Providers.OPENAI);

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

      const result = filterFilesByEndpointConfig(req, [], Providers.OPENAI);

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

      const result = filterFilesByEndpointConfig(req, files, 'customProvider');

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
      const anthropicResult = filterFilesByEndpointConfig(req, files, Providers.ANTHROPIC);
      expect(anthropicResult).toEqual(files);

      /** User switches to OpenAI - files should be filtered out */
      const openaiResult = filterFilesByEndpointConfig(req, files, Providers.OPENAI);
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

      const result = filterFilesByEndpointConfig(req, draggedFiles, Providers.OPENAI);

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

      const result = filterFilesByEndpointConfig(req, files, Providers.OPENAI);

      expect(result).toEqual([]);
    });
  });
});
