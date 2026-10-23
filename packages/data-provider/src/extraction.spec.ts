import { extractionServiceSchema, mergeFileConfig } from './file-config';
import { configSchema } from './config';

describe('mandatory semantic extraction configuration', () => {
  it('provides socket/resource defaults without an enablement switch', () => {
    expect(extractionServiceSchema.parse({})).toEqual({
      socketPath: '/socket/extraction.sock',
      deadlineMs: 12000,
      maxInputBytes: 10485760,
      maxTextBytes: 1048576,
      maxResponseBytes: 3145728,
      maxSegments: 128,
    });
    expect(configSchema.parse({ version: '1.4.8' }).fileConfig?.extractionService).toBeUndefined();
  });
  it('loads adjustable limits through configSchema and fileConfig merging', () => {
    const config = configSchema.parse({
      version: '1.4.8',
      fileConfig: {
        extractionService: { socketPath: '/socket/extraction.sock', deadlineMs: 11000 },
      },
    });
    expect(mergeFileConfig(config.fileConfig).extractionService).toEqual({
      socketPath: '/socket/extraction.sock',
      deadlineMs: 11000,
      maxInputBytes: 10485760,
      maxTextBytes: 1048576,
      maxResponseBytes: 3145728,
      maxSegments: 128,
    });
  });
  it.each([
    { enabled: false },
    { enabled: true },
    { formats: ['pdf'] },
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
  ])('rejects disablement and unsafe configuration %j', (config) => {
    expect(extractionServiceSchema.safeParse(config).success).toBe(false);
    expect(
      configSchema.safeParse({ version: '1.4.8', fileConfig: { extractionService: config } })
        .success,
    ).toBe(false);
  });
});
