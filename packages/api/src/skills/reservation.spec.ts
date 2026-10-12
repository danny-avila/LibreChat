import { FileSources } from 'librechat-data-provider';
import { extractFirebaseBlobPath } from '~/storage/ownedBlobDelete';
import { reserveSkillBlob } from './reservation';

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
});
