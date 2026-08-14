import fs from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import { FileContext } from 'librechat-data-provider';
import {
  resolveVectorId,
  hashFileContent,
  dedupeByVectorId,
  pickVectorReuseSource,
  suppressSharedVectorDeletes,
  USER_OWNED_EMBEDDING_CONTEXT,
} from './vectors';

describe('hashFileContent', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vectors-spec-'));
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const writeFixture = (name: string, contents: Buffer | string): string => {
    const filePath = path.join(tempDir, name);
    fs.writeFileSync(filePath, contents);
    return filePath;
  };

  it('returns the hex sha256 of the file bytes', async () => {
    const contents = 'the quick brown fox';
    const filePath = writeFixture('fox.txt', contents);

    await expect(hashFileContent(filePath)).resolves.toBe(
      createHash('sha256').update(contents).digest('hex'),
    );
  });

  it('matches for identical content under different names', async () => {
    const first = writeFixture('report.pdf', 'identical bytes');
    const second = writeFixture('report-copy.pdf', 'identical bytes');

    await expect(hashFileContent(first)).resolves.toBe(await hashFileContent(second));
  });

  it('differs when a single byte changes', async () => {
    const first = writeFixture('a.bin', Buffer.from([1, 2, 3]));
    const second = writeFixture('b.bin', Buffer.from([1, 2, 4]));

    await expect(hashFileContent(first)).resolves.not.toBe(await hashFileContent(second));
  });

  it('hashes content larger than a single stream chunk', async () => {
    const contents = Buffer.alloc(1024 * 256, 7);
    const filePath = writeFixture('large.bin', contents);

    await expect(hashFileContent(filePath)).resolves.toBe(
      createHash('sha256').update(contents).digest('hex'),
    );
  });

  it('rejects when the file is missing', async () => {
    await expect(hashFileContent(path.join(tempDir, 'nope.txt'))).rejects.toThrow();
  });
});

describe('resolveVectorId', () => {
  it('falls back to the file id when the file owns its vectors', () => {
    expect(resolveVectorId({ file_id: 'own' })).toBe('own');
  });

  it('returns the borrowed vector id', () => {
    expect(resolveVectorId({ file_id: 'copy', vectorId: 'original' })).toBe('original');
  });

  it('ignores an empty vector id', () => {
    expect(resolveVectorId({ file_id: 'own', vectorId: '' })).toBe('own');
  });
});

describe('dedupeByVectorId', () => {
  it('keeps the first file for each vector document', () => {
    const files = [
      { file_id: 'a' },
      { file_id: 'b', vectorId: 'a' },
      { file_id: 'c' },
      { file_id: 'd', vectorId: 'c' },
    ];

    expect(dedupeByVectorId(files)).toEqual([{ file_id: 'a' }, { file_id: 'c' }]);
  });

  it('returns short lists untouched', () => {
    const files = [{ file_id: 'a', vectorId: 'z' }];
    expect(dedupeByVectorId(files)).toBe(files);
    expect(dedupeByVectorId([])).toEqual([]);
  });

  it('leaves distinct files alone', () => {
    const files = [{ file_id: 'a' }, { file_id: 'b' }];
    expect(dedupeByVectorId(files)).toEqual(files);
  });
});

describe('pickVectorReuseSource', () => {
  it('prefers a file that owns its vectors so references never chain', () => {
    const source = pickVectorReuseSource([
      { file_id: 'borrower', vectorId: 'original', embedded: true },
      { file_id: 'original', embedded: true },
    ]);

    expect(source?.file_id).toBe('original');
  });

  it('falls back to a borrower when the original is gone', () => {
    const source = pickVectorReuseSource([
      { file_id: 'borrower', vectorId: 'original', embedded: true },
    ]);

    expect(source?.file_id).toBe('borrower');
  });

  it('ignores candidates that are not embedded', () => {
    expect(pickVectorReuseSource([{ file_id: 'pending', embedded: false }])).toBeUndefined();
    expect(pickVectorReuseSource([{ file_id: 'legacy' }])).toBeUndefined();
  });

  it('returns undefined for an empty candidate list', () => {
    expect(pickVectorReuseSource([])).toBeUndefined();
  });
});

describe('USER_OWNED_EMBEDDING_CONTEXT', () => {
  it('is the one context embedded without an entity', () => {
    expect(USER_OWNED_EMBEDDING_CONTEXT).toBe(FileContext.message_attachment);
  });
});

describe('suppressSharedVectorDeletes', () => {
  const countingSpy = (counts: Record<string, number> = {}) =>
    jest.fn(async () => new Map(Object.entries(counts)));

  it('skips the count entirely when nothing is embedded', async () => {
    const files = [{ file_id: 'a' }, { file_id: 'b', embedded: false }];
    const count = countingSpy();

    await expect(suppressSharedVectorDeletes(files, count)).resolves.toBe(files);
    expect(count).not.toHaveBeenCalled();
  });

  it('leaves an unshared file deletable', async () => {
    const count = countingSpy();

    const result = await suppressSharedVectorDeletes([{ file_id: 'a', embedded: true }], count);

    expect(result).toEqual([{ file_id: 'a', embedded: true }]);
    expect(count).toHaveBeenCalledWith({ vectorIds: ['a'], excludeFileIds: ['a'] });
  });

  it('clears embedded when a file outside the batch still needs the vectors', async () => {
    const result = await suppressSharedVectorDeletes(
      [{ file_id: 'borrower', vectorId: 'original', embedded: true }],
      countingSpy({ original: 1 }),
    );

    expect(result).toEqual([{ file_id: 'borrower', vectorId: 'original', embedded: false }]);
  });

  it('lets exactly one file in the batch drop shared vectors', async () => {
    const result = await suppressSharedVectorDeletes(
      [
        { file_id: 'original', embedded: true },
        { file_id: 'borrower', vectorId: 'original', embedded: true },
      ],
      countingSpy(),
    );

    expect(result).toEqual([
      { file_id: 'original', embedded: true },
      { file_id: 'borrower', vectorId: 'original', embedded: false },
    ]);
  });

  it('excludes the whole batch from the reference count', async () => {
    const count = countingSpy();

    await suppressSharedVectorDeletes(
      [
        { file_id: 'original', embedded: true },
        { file_id: 'borrower', vectorId: 'original', embedded: true },
        { file_id: 'unrelated', embedded: false },
      ],
      count,
    );

    expect(count).toHaveBeenCalledWith({
      vectorIds: ['original'],
      excludeFileIds: ['original', 'borrower', 'unrelated'],
    });
  });

  it('handles independent vector documents in one batch', async () => {
    const result = await suppressSharedVectorDeletes(
      [
        { file_id: 'a', embedded: true },
        { file_id: 'b', embedded: true },
      ],
      countingSpy({ b: 2 }),
    );

    expect(result).toEqual([
      { file_id: 'a', embedded: true },
      { file_id: 'b', embedded: false },
    ]);
  });

  it('does not mutate the files it was given', async () => {
    const borrower = { file_id: 'borrower', vectorId: 'original', embedded: true };

    await suppressSharedVectorDeletes([borrower], countingSpy({ original: 1 }));

    expect(borrower.embedded).toBe(true);
  });
});
