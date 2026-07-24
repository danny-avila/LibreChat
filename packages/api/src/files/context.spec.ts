import { ErrorTypes, FileSources } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type { ServerRequest } from '~/types';
import { extractFileContext } from './context';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const makeTextFile = (filename: string, text: string): IMongoFile =>
  ({
    file_id: filename,
    filename,
    text,
    source: FileSources.text,
  }) as IMongoFile;

// ~1 token per character keeps the limits easy to reason about.
const tokenCountFn = (text: string): number => text.length;

const makeReq = (fileConfig: Record<string, unknown>): ServerRequest =>
  ({ body: {}, config: { fileConfig } }) as unknown as ServerRequest;

describe('extractFileContext - errorOnFileTokenLimit', () => {
  it('truncates an oversized file by default (toggle off)', async () => {
    const req = makeReq({ fileTokenLimit: 10 });

    const result = await extractFileContext({
      attachments: [makeTextFile('big.txt', 'a'.repeat(100))],
      req,
      tokenCountFn,
    });

    expect(result).toContain('# "big.txt"');
  });

  it('throws a FILE_TOKEN_LIMIT error when the toggle is on and a file exceeds the limit', async () => {
    const req = makeReq({ fileTokenLimit: 10, errorOnFileTokenLimit: true });

    await expect(
      extractFileContext({
        attachments: [makeTextFile('big.txt', 'a'.repeat(100))],
        req,
        tokenCountFn,
      }),
    ).rejects.toThrow(JSON.stringify({ type: ErrorTypes.FILE_TOKEN_LIMIT, info: 'big.txt' }));
  });

  it('does not throw when files are within the limit even with the toggle on', async () => {
    const req = makeReq({ fileTokenLimit: 1000, errorOnFileTokenLimit: true });

    const result = await extractFileContext({
      attachments: [makeTextFile('small.txt', 'hello world')],
      req,
      tokenCountFn,
    });

    expect(result).toContain('hello world');
  });
});
