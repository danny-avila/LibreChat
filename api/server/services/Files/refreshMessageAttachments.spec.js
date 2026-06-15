jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

jest.mock('@librechat/api', () => ({
  refreshS3Url: jest.fn(),
}));

const { FileSources } = require('librechat-data-provider');
const { refreshS3Url } = require('@librechat/api');
const { refreshMessageAttachmentUrls } = require('./refreshMessageAttachments');

beforeEach(() => {
  jest.clearAllMocks();
});

const STALE = 'https://bucket.s3.amazonaws.com/uploads/u/x?X-Amz-Signature=OLD&X-Amz-Expires=120';
const FRESH = 'https://bucket.s3.amazonaws.com/uploads/u/x?X-Amz-Signature=NEW&X-Amz-Expires=120';

describe('refreshMessageAttachmentUrls', () => {
  test('returns input unchanged for null / undefined / []', async () => {
    expect(await refreshMessageAttachmentUrls(null)).toBeNull();
    expect(await refreshMessageAttachmentUrls(undefined)).toBeUndefined();
    const arr = [];
    expect(await refreshMessageAttachmentUrls(arr)).toBe(arr);
    expect(refreshS3Url).not.toHaveBeenCalled();
  });

  test('skips rows without attachments or files', async () => {
    const rows = [{ messageId: 'a' }, { messageId: 'b', attachments: undefined }];
    await refreshMessageAttachmentUrls(rows);
    expect(refreshS3Url).not.toHaveBeenCalled();
  });

  test('rewrites S3 filepath in place when refreshS3Url returns a new URL', async () => {
    refreshS3Url.mockResolvedValue(FRESH);
    const rows = [
      {
        messageId: 'm1',
        attachments: [{ file_id: 'f1', source: FileSources.s3, filepath: STALE }],
      },
    ];
    await refreshMessageAttachmentUrls(rows);
    expect(rows[0].attachments[0].filepath).toBe(FRESH);
    expect(rows[0].attachments[0].file_id).toBe('f1');
    expect(refreshS3Url).toHaveBeenCalledTimes(1);
  });

  test('also walks row.files[] (user-uploaded files)', async () => {
    refreshS3Url.mockResolvedValue(FRESH);
    const rows = [
      {
        messageId: 'm1',
        files: [{ source: FileSources.s3, filepath: STALE }],
        attachments: [{ source: FileSources.s3, filepath: STALE }],
      },
    ];
    await refreshMessageAttachmentUrls(rows);
    expect(rows[0].files[0].filepath).toBe(FRESH);
    expect(rows[0].attachments[0].filepath).toBe(FRESH);
    // Same filepath in both fields — cache dedupes to one call.
    expect(refreshS3Url).toHaveBeenCalledTimes(1);
  });

  test('keeps original URL on refreshS3Url rejection (no undefined leak)', async () => {
    refreshS3Url.mockRejectedValue(new Error('boom'));
    const rows = [{ messageId: 'm1', attachments: [{ source: FileSources.s3, filepath: STALE }] }];
    await refreshMessageAttachmentUrls(rows);
    expect(rows[0].attachments[0].filepath).toBe(STALE);
  });

  test('keeps original URL when refreshS3Url returns empty', async () => {
    refreshS3Url.mockResolvedValue('');
    const rows = [{ messageId: 'm1', attachments: [{ source: FileSources.s3, filepath: STALE }] }];
    await refreshMessageAttachmentUrls(rows);
    expect(rows[0].attachments[0].filepath).toBe(STALE);
  });

  test('skips attachments without a recognised source', async () => {
    const rows = [
      {
        messageId: 'm1',
        attachments: [
          { source: 'local', filepath: '/uploads/u/local.png' },
          { source: 'firebase', filepath: 'https://firebase/x' },
          { filepath: 'https://google/avatar' },
          null,
          {},
        ],
      },
    ];
    await refreshMessageAttachmentUrls(rows);
    expect(refreshS3Url).not.toHaveBeenCalled();
    expect(rows[0].attachments[0].filepath).toBe('/uploads/u/local.png');
  });

  test('tolerates attachments without filepath', async () => {
    refreshS3Url.mockResolvedValue(FRESH);
    const rows = [
      {
        messageId: 'm1',
        attachments: [
          { source: FileSources.s3 },
          { source: FileSources.s3, filepath: '' },
          { source: FileSources.s3, filepath: STALE },
        ],
      },
    ];
    await refreshMessageAttachmentUrls(rows);
    expect(rows[0].attachments[2].filepath).toBe(FRESH);
    expect(refreshS3Url).toHaveBeenCalledTimes(1);
  });

  test('memoizes resigning across rows when the same filepath appears multiple times', async () => {
    refreshS3Url.mockResolvedValue(FRESH);
    const rows = [
      { messageId: 'm1', attachments: [{ source: FileSources.s3, filepath: STALE }] },
      { messageId: 'm2', attachments: [{ source: FileSources.s3, filepath: STALE }] },
      { messageId: 'm3', attachments: [{ source: FileSources.s3, filepath: STALE }] },
    ];
    await refreshMessageAttachmentUrls(rows);
    expect(refreshS3Url).toHaveBeenCalledTimes(1);
    for (const row of rows) {
      expect(row.attachments[0].filepath).toBe(FRESH);
    }
  });

  test('accepts a single row (not wrapped in an array)', async () => {
    refreshS3Url.mockResolvedValue(FRESH);
    const row = { messageId: 'm1', attachments: [{ source: FileSources.s3, filepath: STALE }] };
    const result = await refreshMessageAttachmentUrls(row);
    expect(result).toBe(row);
    expect(row.attachments[0].filepath).toBe(FRESH);
  });

  test('forwards bufferSeconds to refreshS3Url', async () => {
    refreshS3Url.mockResolvedValue(STALE);
    const rows = [{ messageId: 'm1', attachments: [{ source: FileSources.s3, filepath: STALE }] }];
    await refreshMessageAttachmentUrls(rows, { bufferSeconds: 42 });
    expect(refreshS3Url).toHaveBeenCalledWith(rows[0].attachments[0], 42);
  });

  test('works against tool-call rows (only attachments[], no files[])', async () => {
    refreshS3Url.mockResolvedValue(FRESH);
    const rows = [
      {
        conversationId: 'c1',
        messageId: 'm1',
        toolId: 'execute_code',
        attachments: [{ source: FileSources.s3, filepath: STALE }],
      },
    ];
    await refreshMessageAttachmentUrls(rows);
    expect(rows[0].attachments[0].filepath).toBe(FRESH);
  });
});

describe('redactSignedUrlForLog', () => {
  const { redactSignedUrlForLog } = require('./refreshMessageAttachments');

  test('strips the query string (signature + token would otherwise leak)', () => {
    const u =
      'https://bucket.s3.amazonaws.com/uploads/u/x?X-Amz-Signature=abc&X-Amz-Security-Token=xyz&X-Amz-Date=20260615';
    expect(redactSignedUrlForLog(u)).toBe('https://bucket.s3.amazonaws.com/uploads/u/x');
  });

  test('strips query string from unparseable inputs without losing the path', () => {
    // Relative URL / local path: `new URL()` would throw on its own; we should
    // still drop any `?signature=...` suffix and keep the rest for debug.
    expect(redactSignedUrlForLog('/uploads/u/local-file.png?token=SECRET')).toBe(
      '/uploads/u/local-file.png',
    );
    expect(redactSignedUrlForLog('not a url')).toBe('not a url');
  });

  test('returns empty string for non-string input', () => {
    // @ts-expect-error — intentionally pass non-string to exercise guard
    expect(redactSignedUrlForLog(undefined)).toBe('');
    // @ts-expect-error — intentionally pass non-string to exercise guard
    expect(redactSignedUrlForLog(null)).toBe('');
    // @ts-expect-error — intentionally pass non-string to exercise guard
    expect(redactSignedUrlForLog(123)).toBe('');
  });

  test('error path logs only the redacted URL, never the signature', async () => {
    refreshS3Url.mockRejectedValue(new Error('boom'));
    const { logger } = require('@librechat/data-schemas');
    const rows = [
      {
        attachments: [
          {
            source: FileSources.s3,
            filepath:
              'https://bucket.s3.amazonaws.com/uploads/u/x?X-Amz-Signature=SECRET&X-Amz-Date=20260615',
          },
        ],
      },
    ];
    await refreshMessageAttachmentUrls(rows);
    expect(logger.error).toHaveBeenCalled();
    const logged = logger.error.mock.calls[0][0];
    expect(logged).not.toContain('SECRET');
    expect(logged).not.toContain('X-Amz-Signature');
    expect(logged).toContain('https://bucket.s3.amazonaws.com/uploads/u/x');
  });
});

describe('runWithConcurrency', () => {
  const { runWithConcurrency } = require('./refreshMessageAttachments');

  test('caps in-flight tasks at the configured limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const total = 25;
    const limit = 4;
    const factories = Array.from({ length: total }, () => async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
    });
    await runWithConcurrency(factories, limit);
    expect(peak).toBeLessThanOrEqual(limit);
    expect(peak).toBeGreaterThan(1);
  });

  test('returns immediately on empty input', async () => {
    await expect(runWithConcurrency([], 8)).resolves.toBeUndefined();
  });

  test('fast-path when task count <= limit (no worker loop)', async () => {
    const calls = [];
    await runWithConcurrency([async () => calls.push('a'), async () => calls.push('b')], 8);
    expect(calls.sort()).toEqual(['a', 'b']);
  });
});

describe('isRefreshable', () => {
  const { isRefreshable } = require('./refreshMessageAttachments');

  test('true for S3-source with non-empty filepath', () => {
    expect(isRefreshable({ source: FileSources.s3, filepath: 'https://x' })).toBe(true);
  });

  test('false for non-S3 sources, missing/empty filepath, non-objects', () => {
    expect(isRefreshable(null)).toBe(false);
    expect(isRefreshable(undefined)).toBe(false);
    expect(isRefreshable('string')).toBe(false);
    expect(isRefreshable({})).toBe(false);
    expect(isRefreshable({ source: FileSources.s3 })).toBe(false);
    expect(isRefreshable({ source: FileSources.s3, filepath: '' })).toBe(false);
    expect(isRefreshable({ source: 'local', filepath: '/uploads/x' })).toBe(false);
    expect(isRefreshable({ source: 'firebase', filepath: 'https://x' })).toBe(false);
    expect(isRefreshable({ filepath: 'https://x' })).toBe(false);
  });

  test('refreshMessageAttachmentUrls does not enqueue non-refreshable entries', async () => {
    // If a non-refreshable entry were enqueued, runWithConcurrency would
    // schedule the no-op task and refreshS3Url would still not be called —
    // so the observable signal is "no work scheduled at all". We assert via
    // the refresher mock not being called *and* via the call-count of the
    // memo cache observable as `refreshS3Url.mock.calls.length`.
    refreshS3Url.mockResolvedValue(FRESH);
    const rows = [
      {
        attachments: [
          { source: 'local', filepath: '/uploads/u/x.png' },
          { source: FileSources.s3 },
          { source: FileSources.s3, filepath: '' },
          null,
          {},
          { source: FileSources.s3, filepath: STALE },
        ],
      },
    ];
    await refreshMessageAttachmentUrls(rows);
    expect(refreshS3Url).toHaveBeenCalledTimes(1);
    expect(rows[0].attachments[5].filepath).toBe(FRESH);
  });
});
