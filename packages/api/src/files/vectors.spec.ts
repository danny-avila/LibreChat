import fs from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import { FileContext } from 'librechat-data-provider';
import {
  fileExtension,
  reclaimOrphanedVectors,
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

describe('fileExtension', () => {
  it('lowercases the extension and keeps the dot', () => {
    expect(fileExtension('Report.PDF')).toBe('.pdf');
    expect(fileExtension('a/b/data.csv')).toBe('.csv');
  });

  it('returns an empty string when there is nothing to compare', () => {
    expect(fileExtension('README')).toBe('');
    expect(fileExtension('')).toBe('');
    expect(fileExtension(undefined)).toBe('');
    expect(fileExtension(null)).toBe('');
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

    await expect(suppressSharedVectorDeletes(files, count)).resolves.toEqual({
      files,
      deferredVectorIds: [],
    });
    expect(count).not.toHaveBeenCalled();
  });

  it('leaves an unshared file deletable', async () => {
    const count = countingSpy();

    const result = await suppressSharedVectorDeletes([{ file_id: 'a', embedded: true }], count);

    expect(result.files).toEqual([{ file_id: 'a', embedded: true }]);
    expect(result.deferredVectorIds).toEqual([]);
    expect(count).toHaveBeenCalledWith({ vectorIds: ['a'], excludeFileIds: ['a'] });
  });

  it('clears embedded when a file outside the batch still needs the vectors', async () => {
    const result = await suppressSharedVectorDeletes(
      [{ file_id: 'borrower', vectorId: 'original', embedded: true }],
      countingSpy({ original: 1 }),
    );

    expect(result.files).toEqual([{ file_id: 'borrower', vectorId: 'original', embedded: false }]);
    expect(result.deferredVectorIds).toEqual(['original']);
  });

  /* Per-file deletes run independently and a failed one keeps its record, so
   * letting a sibling drop the document inline could strand the survivor. */
  it('defers a document more than one file in the batch holds', async () => {
    const result = await suppressSharedVectorDeletes(
      [
        { file_id: 'original', embedded: true },
        { file_id: 'borrower', vectorId: 'original', embedded: true },
      ],
      countingSpy(),
    );

    expect(result.files).toEqual([
      { file_id: 'original', embedded: false },
      { file_id: 'borrower', vectorId: 'original', embedded: false },
    ]);
    expect(result.deferredVectorIds).toEqual(['original']);
  });

  it('returns the batch untouched when nothing is shared', async () => {
    const files = [
      { file_id: 'a', embedded: true },
      { file_id: 'b', embedded: true },
    ];

    const result = await suppressSharedVectorDeletes(files, countingSpy());

    expect(result.files).toBe(files);
    expect(result.deferredVectorIds).toEqual([]);
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

    expect(result.files).toEqual([
      { file_id: 'a', embedded: true },
      { file_id: 'b', embedded: false },
    ]);
    expect(result.deferredVectorIds).toEqual(['b']);
  });

  it('does not mutate the files it was given', async () => {
    const borrower = { file_id: 'borrower', vectorId: 'original', embedded: true };

    await suppressSharedVectorDeletes([borrower], countingSpy({ original: 1 }));

    expect(borrower.embedded).toBe(true);
  });
});

describe('reclaimOrphanedVectors', () => {
  const countingSpy = (counts: Record<string, number> = {}) =>
    jest.fn(async () => new Map(Object.entries(counts)));

  it('does nothing when the batch deferred nothing', async () => {
    const count = countingSpy();
    const deleteVectors = jest.fn();

    await expect(
      reclaimOrphanedVectors({ vectorIds: [], countVectorReferences: count, deleteVectors }),
    ).resolves.toEqual([]);
    expect(count).not.toHaveBeenCalled();
    expect(deleteVectors).not.toHaveBeenCalled();
  });

  /* The concurrent-delete case: this request stood down for a record another
   * request has since removed, so nothing points at the document any more. */
  it('drops a document whose last reference went while the batch ran', async () => {
    const deleteVectors = jest.fn().mockResolvedValue(undefined);

    const reclaimed = await reclaimOrphanedVectors({
      vectorIds: ['original'],
      countVectorReferences: countingSpy(),
      deleteVectors,
    });

    expect(reclaimed).toEqual(['original']);
    expect(deleteVectors).toHaveBeenCalledWith('original');
  });

  it('leaves a document alone while something still references it', async () => {
    const deleteVectors = jest.fn();

    const reclaimed = await reclaimOrphanedVectors({
      vectorIds: ['original'],
      countVectorReferences: countingSpy({ original: 1 }),
      deleteVectors,
    });

    expect(reclaimed).toEqual([]);
    expect(deleteVectors).not.toHaveBeenCalled();
  });

  it('rechecks without excluding anything, since the batch is already gone', async () => {
    const count = countingSpy({ kept: 2 });

    await reclaimOrphanedVectors({
      vectorIds: ['kept', 'orphan'],
      countVectorReferences: count,
      deleteVectors: jest.fn().mockResolvedValue(undefined),
    });

    expect(count).toHaveBeenCalledWith({ vectorIds: ['kept', 'orphan'] });
  });

  it('reclaims each orphan in one pass', async () => {
    const deleteVectors = jest.fn().mockResolvedValue(undefined);

    const reclaimed = await reclaimOrphanedVectors({
      vectorIds: ['a', 'b', 'c'],
      countVectorReferences: countingSpy({ b: 1 }),
      deleteVectors,
    });

    expect(reclaimed).toEqual(['a', 'c']);
    expect(deleteVectors).toHaveBeenCalledTimes(2);
  });
});
