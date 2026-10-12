import { FileContext, FileSources } from 'librechat-data-provider';
import {
  createSkillBlobReserver,
  createSkillBufferWriter,
  createSkillStorageResolver,
  reserveSkillBlob,
} from './reservation';
import { extractFirebaseBlobPath } from '~/storage/ownedBlobDelete';

describe('Skill blob reservation', () => {
  it('reserves local and Firebase owner-scoped paths before upload', async () => {
    await expect(
      reserveSkillBlob({ source: FileSources.local, userId: 'owner', fileName: 'id__note.md' }),
    ).resolves.toEqual({ filepath: '/uploads/owner/id__note.md' });
    const firebase = await reserveSkillBlob({
      source: FileSources.firebase,
      userId: 'owner',
      fileName: 'id__note.md',
    });
    expect(extractFirebaseBlobPath(firebase.filepath)).toBe('uploads/owner/id__note.md');
  });

  it.each([FileSources.s3, FileSources.cloudfront, FileSources.azure_blob])(
    'uses the provider future-URL resolver for %s',
    async (source) => {
      const getFileURL = jest.fn(async () => 'https://example.invalid/uploads/owner/id__note.md');
      const reserved = await reserveSkillBlob({
        source,
        userId: 'owner',
        fileName: 'id__note.md',
        tenantId: 'tenant-a',
        getFileURL,
      });
      expect(getFileURL).toHaveBeenCalledWith({
        userId: 'owner',
        fileName: 'id__note.md',
        basePath: 'uploads',
        tenantId: 'tenant-a',
      });
      expect(reserved.filepath).toBe('https://example.invalid/uploads/owner/id__note.md');
    },
  );

  it('fails closed for unsupported storage', async () => {
    await expect(
      reserveSkillBlob({ source: FileSources.openai, userId: 'owner', fileName: 'id__note.md' }),
    ).rejects.toThrow('Unsupported Skill storage strategy');
  });

  it('selects a Skill provider from config and requires save and delete capabilities', async () => {
    const getFileStrategy = jest.fn(() => FileSources.local);
    let canDelete = true;
    const getStrategyFunctions = jest.fn(() => ({
      saveBuffer: jest.fn(),
      deleteFile: canDelete ? jest.fn() : undefined,
    }));
    const reserve = createSkillBlobReserver({ getFileStrategy, getStrategyFunctions });
    await expect(
      reserve(Promise.resolve({ fileStrategy: FileSources.local }), {
        userId: 'owner',
        fileName: 'id__note.md',
        isImage: false,
      }),
    ).resolves.toEqual({ source: FileSources.local, filepath: '/uploads/owner/id__note.md' });
    expect(getFileStrategy).toHaveBeenCalledWith(
      { fileStrategy: FileSources.local },
      { context: FileContext.skill_file, isImage: false },
    );
    canDelete = false;
    await expect(
      reserve(
        { fileStrategy: FileSources.local },
        {
          userId: 'owner',
          fileName: 'id__note.md',
          isImage: false,
        },
      ),
    ).rejects.toThrow('Skill storage cannot guarantee cleanup');
  });

  it('writes to the reserved provider when live config changes before upload', async () => {
    const localSave = jest.fn(async () => '/uploads/owner/id__note.md');
    const firebaseSave = jest.fn(async () => 'https://firebase.invalid/o/other');
    const getFileStrategy = jest.fn(() => FileSources.local);
    const getStrategyFunctions = jest.fn((source: string) => ({
      saveBuffer: source === FileSources.local ? localSave : firebaseSave,
      deleteFile: jest.fn(),
    }));
    const resolve = createSkillStorageResolver({ getFileStrategy, getStrategyFunctions });
    const selected = resolve({}, { isImage: false });
    getFileStrategy.mockReturnValue(FileSources.firebase);
    const write = createSkillBufferWriter({ getStrategyFunctions });

    await expect(
      write({
        expectedSource: selected.source,
        userId: 'owner',
        fileName: 'id__note.md',
        buffer: Buffer.from('note'),
        basePath: 'uploads',
      }),
    ).resolves.toMatchObject({
      source: FileSources.local,
      filepath: '/uploads/owner/id__note.md',
    });
    expect(localSave).toHaveBeenCalledTimes(1);
    expect(firebaseSave).not.toHaveBeenCalled();
    expect(getFileStrategy).toHaveBeenCalledTimes(1);
  });
});
