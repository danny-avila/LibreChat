import { extractionServiceSchema, mergeFileConfig } from './file-config';
import { configSchema } from './config';

describe('opt-in semantic extraction configuration', () => {
  it('does not enable the service when omitted or empty', () => {
    expect(configSchema.parse({ version: '1.4.8' }).fileConfig?.extractionService).toBeUndefined();
    expect(extractionServiceSchema.parse({}).enabled).toBe(false);
  });
  it('loads through configSchema and survives fileConfig merging', () => {
    const config = configSchema.parse({
      version: '1.4.8',
      fileConfig: {
        extractionService: {
          enabled: true,
          socketPath: '/socket/extraction.sock',
          deadlineMs: 11000,
        },
      },
    });
    expect(mergeFileConfig(config.fileConfig).extractionService).toEqual({
      enabled: true,
      socketPath: '/socket/extraction.sock',
      deadlineMs: 11000,
      maxInputBytes: 10485760,
      maxTextBytes: 1048576,
      maxResponseBytes: 3145728,
      maxSegments: 128,
    });
  });
  it.each([
    { socketPath: 'https://processor' },
    { socketPath: '/socket/\0bad' },
    { deadlineMs: 15001 },
    { maxInputBytes: 10485761 },
    { maxTextBytes: 1048577 },
    { maxResponseBytes: 3145729 },
    { maxSegments: 129 },
    { deadlineMs: 0 },
    { maxInputBytes: -1 },
    { maxSegments: 1.5 },
    { script: 'exec' },
  ])('rejects unsafe configuration %j', (config) => {
    expect(extractionServiceSchema.safeParse({ enabled: true, ...config }).success).toBe(false);
  });
});
