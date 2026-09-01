import { EModelEndpoint, FileSources } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import { getFileRetentionSweepInterval, startExpiredFileSweep, sweepExpiredFiles } from './sweep';

describe('expired file sweep helpers', () => {
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.FILE_RETENTION_SWEEP_INTERVAL_MS;
  });

  afterEach(() => {
    jest.useRealTimers();
    delete process.env.FILE_RETENTION_SWEEP_INTERVAL_MS;
  });

  it('loads endpoint config and deletes expired OpenAI storage files', async () => {
    const getExpiredFiles = jest.fn().mockResolvedValue([
      {
        file_id: 'expired-openai-file',
        source: FileSources.openai,
        user: { toString: () => 'user-123' },
        tenantId: 'tenant-a',
      },
    ]);
    const processDeleteRequest = jest.fn().mockResolvedValue({
      deletedFileIds: ['expired-openai-file'],
      failedFileIds: [],
    });
    const loadAppConfig = jest.fn().mockResolvedValue({
      endpoints: {
        [EModelEndpoint.assistants]: { version: 'v3' },
      },
    } as AppConfig);

    const result = await sweepExpiredFiles(
      { appConfig: {} as AppConfig, loadAppConfig, limit: 1 },
      { getExpiredFiles, processDeleteRequest, logger },
    );

    expect(loadAppConfig).toHaveBeenCalledTimes(1);
    expect(processDeleteRequest).toHaveBeenCalledWith({
      req: expect.objectContaining({
        baseUrl: '/api/assistants/v3',
        originalUrl: '/api/assistants/v3/files',
        body: { endpoint: EModelEndpoint.assistants, version: '3' },
        user: { id: 'user-123', tenantId: 'tenant-a' },
      }),
      files: [expect.objectContaining({ file_id: 'expired-openai-file' })],
    });
    expect(result).toEqual({ scanned: 1, deleted: 1, failed: 0 });
  });

  it('counts files without owners as failed without deleting them', async () => {
    const getExpiredFiles = jest.fn().mockResolvedValue([{ file_id: 'orphaned-file' }]);
    const processDeleteRequest = jest.fn();

    const result = await sweepExpiredFiles(
      { appConfig: {} as AppConfig, limit: 1 },
      { getExpiredFiles, processDeleteRequest, logger },
    );

    expect(processDeleteRequest).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      '[sweepExpiredFiles] Skipping expired file without user: orphaned-file',
    );
    expect(result).toEqual({ scanned: 1, deleted: 0, failed: 1 });
  });

  it('falls back to the default interval for sub-millisecond values', () => {
    expect(getFileRetentionSweepInterval('0.5')).toBe(60 * 60 * 1000);
  });

  it('does not start the interval when the sweep is disabled', () => {
    process.env.FILE_RETENTION_SWEEP_INTERVAL_MS = '0';

    const interval = startExpiredFileSweep(
      { appConfig: {} as AppConfig },
      {
        sweepExpiredFiles: jest.fn(),
        runAsSystem: jest.fn((fn) => fn()),
        logger,
      },
    );

    expect(interval).toBeNull();
    expect(logger.info).toHaveBeenCalledWith(
      '[sweepExpiredFiles] Disabled by FILE_RETENTION_SWEEP_INTERVAL_MS=0',
    );
  });
});
