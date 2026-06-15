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
