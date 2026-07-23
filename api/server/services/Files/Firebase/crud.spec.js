const mockDeleteObject = jest.fn().mockResolvedValue(undefined);
const mockDeleteRagFile = jest.fn().mockResolvedValue(undefined);

jest.mock('firebase/storage', () => ({
  ref: jest.fn((storage, fullPath) => ({ fullPath })),
  uploadBytes: jest.fn(),
  getDownloadURL: jest.fn(),
  deleteObject: (...args) => mockDeleteObject(...args),
}));

jest.mock('@librechat/api', () => ({
  getFirebaseStorage: jest.fn().mockResolvedValue({ name: 'firebase-storage' }),
  deleteRagFile: (...args) => mockDeleteRagFile(...args),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: { warn: jest.fn(), debug: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('~/server/utils', () => ({
  getBufferMetadata: jest.fn(),
}));

const { deleteFirebaseFile } = require('./crud');

/**
 * Builds a Firebase Storage download URL whose `/o/<path>` segment encodes the
 * given storage object path, mirroring what is persisted on `file.filepath`.
 */
const firebaseUrl = (objectPath) =>
  `https://firebasestorage.googleapis.com/v0/b/bucket.appspot.com/o/${encodeURIComponent(
    objectPath,
  )}?alt=media&token=abc123`;

describe('deleteFirebaseFile — structured owner validation on delete', () => {
  const req = { user: { id: 'userA' } };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteObject.mockResolvedValue(undefined);
    mockDeleteRagFile.mockResolvedValue(undefined);
  });

  test('deletes when the storage path owner segment matches the file owner', async () => {
    const file = {
      user: 'userA',
      filepath: firebaseUrl('images/userA/file-id__avatar.png'),
    };

    await expect(deleteFirebaseFile(req, file)).resolves.toBeUndefined();

    expect(mockDeleteRagFile).toHaveBeenCalledWith({ userId: 'userA', file });
    expect(mockDeleteObject).toHaveBeenCalledTimes(1);
    expect(mockDeleteObject).toHaveBeenCalledWith(
      expect.objectContaining({ fullPath: '/images/userA/file-id__avatar.png' }),
    );
  });

  test('cleans up RAG storage under the file owner, not the requester (shared-agent editor)', async () => {
    const editorReq = { user: { id: 'editorX' } };
    const file = {
      user: 'ownerA',
      filepath: firebaseUrl('images/ownerA/file-id__doc.png'),
    };

    await expect(deleteFirebaseFile(editorReq, file)).resolves.toBeUndefined();

    expect(mockDeleteRagFile).toHaveBeenCalledWith({ userId: 'ownerA', file });
    expect(mockDeleteObject).toHaveBeenCalledTimes(1);
  });

  test('rejects a cross-user path (owner segment points at another user) and never deletes or cleans RAG', async () => {
    const file = {
      user: 'userA',
      filepath: firebaseUrl('images/userB/file-id__secret.png'),
    };

    await expect(deleteFirebaseFile(req, file)).rejects.toThrow('File owner mismatch');
    expect(mockDeleteObject).not.toHaveBeenCalled();
    expect(mockDeleteRagFile).not.toHaveBeenCalled();
  });

  test('rejects an owner id at the wrong path position (not the segment before the file name)', async () => {
    const file = {
      user: 'ownerA',
      filepath: firebaseUrl('images/victim/ownerA/secret.png'),
    };

    await expect(deleteFirebaseFile(req, file)).rejects.toThrow('File owner mismatch');
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });

  test('rejects when the owner id only appears as a substring, not a full path segment', async () => {
    const file = {
      user: 'abc',
      filepath: firebaseUrl('images/xabcx/file-id__x.png'),
    };

    await expect(deleteFirebaseFile(req, file)).rejects.toThrow('File owner mismatch');
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });

  test('rejects when the file record has no owner', async () => {
    const file = {
      user: undefined,
      filepath: firebaseUrl('images/userA/file-id__x.png'),
    };

    await expect(deleteFirebaseFile(req, file)).rejects.toThrow('File record has no owner');
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });
});
