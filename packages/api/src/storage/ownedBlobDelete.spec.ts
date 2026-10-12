import {
  createOwnedBlobFileDeleter,
  extractAzureBlobPath,
  extractFirebaseBlobPath,
} from './ownedBlobDelete';

describe.each([
  {
    source: 'Azure',
    filepath: 'https://example.blob.core.windows.net/files/uploads/author-1/file.txt',
    extractPath: (url: string) => extractAzureBlobPath(url, 'files'),
  },
  {
    source: 'Firebase',
    filepath: 'https://firebasestorage.googleapis.com/v0/b/bucket/o/uploads%2Fauthor-1%2Ffile.txt',
    extractPath: extractFirebaseBlobPath,
  },
])('$source owner-aware deletion', ({ filepath, extractPath }) => {
  const deleteBlob = jest.fn().mockResolvedValue(undefined);
  const deleteRagFile = jest.fn().mockResolvedValue(undefined);
  const remove = createOwnedBlobFileDeleter({
    extractPath,
    deleteBlob,
    deleteRagFile,
    isMissing: (error) => (error as { code?: string }).code === 'missing',
  });
  const req = { user: { id: 'manager-1' } };

  beforeEach(() => {
    deleteBlob.mockReset().mockResolvedValue(undefined);
    deleteRagFile.mockClear();
  });

  it("deletes another author's file under the persisted owner", async () => {
    const file = { filepath, user: 'author-1' };
    await remove(req, file);
    expect(deleteBlob).toHaveBeenCalledWith('uploads/author-1/file.txt');
    expect(deleteRagFile).toHaveBeenCalledWith({ userId: 'author-1', file });
  });

  it('rejects an owner mismatch before deleting either blob or RAG data', async () => {
    await expect(remove(req, { filepath, user: 'author-2' })).rejects.toThrow('Invalid file path');
    expect(deleteBlob).not.toHaveBeenCalled();
    expect(deleteRagFile).not.toHaveBeenCalled();
  });

  it('does not clean up RAG data when remote deletion fails', async () => {
    deleteBlob.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(remove(req, { filepath, user: 'author-1' })).rejects.toThrow(
      'storage unavailable',
    );
    expect(deleteRagFile).not.toHaveBeenCalled();
  });

  it('treats an already missing blob as deleted and still cleans up RAG data', async () => {
    deleteBlob.mockRejectedValueOnce(Object.assign(new Error('gone'), { code: 'missing' }));
    await remove(req, { filepath, user: 'author-1' });
    expect(deleteRagFile).toHaveBeenCalledWith({ userId: 'author-1', file: expect.any(Object) });
  });
});
