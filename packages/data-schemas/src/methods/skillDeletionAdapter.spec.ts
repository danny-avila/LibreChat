import { Types } from 'mongoose';
import { createSkillDeletionPersistenceAdapter } from './skillDeletionAdapter';

it('projects deletion persistence records into plain string-ID API records', async () => {
  const skillId = new Types.ObjectId();
  const author = new Types.ObjectId();
  const source = {
    beginSkillDeletion: async () => ({ skillId, author, startedAt: new Date() }),
    getSkillDeletion: async () => ({ skillId, author, startedAt: new Date() }),
    listSkillDeletionTombstones: async () => [{ skillId, author, startedAt: new Date() }],
    listSkillUploadIntents: async () => [
      {
        skillId,
        author,
        fileId: 'file-1',
        source: 'local',
        storageKey: '/uploads/file-1',
        writerId: 'writer',
        state: 'committed' as const,
      },
    ],
    listAbandonedSkillUploadIntents: async () => [
      {
        skillId,
        author,
        fileId: 'file-2',
        source: 'local',
        storageKey: '/uploads/file-2',
        writerId: 'writer',
        state: 'abandoned' as const,
      },
    ],
    listSkillFiles: async () => [
      {
        skillId,
        author,
        file_id: 'file-1',
        filepath: '/uploads/file-1',
        source: 'local',
      },
    ],
  };
  const adapter = createSkillDeletionPersistenceAdapter(source);

  expect(await adapter.beginSkillDeletion(skillId.toString())).toEqual({
    skillId: skillId.toString(),
    completedAt: undefined,
  });
  expect((await adapter.listSkillDeletionTombstones(1))[0].skillId).toBe(skillId.toString());
  expect((await adapter.listSkillUploadIntents(skillId.toString()))[0]).toMatchObject({
    skillId: skillId.toString(),
    author: author.toString(),
    fileId: 'file-1',
  });
  expect((await adapter.listAbandonedSkillUploadIntents(1))[0].author).toBe(author.toString());
  expect((await adapter.listSkillFiles(skillId.toString()))[0]).toEqual({
    file_id: 'file-1',
    filepath: '/uploads/file-1',
    source: 'local',
    storageKey: undefined,
    storageRegion: undefined,
    author: author.toString(),
    tenantId: undefined,
  });
});
