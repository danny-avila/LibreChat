import mongoose from 'mongoose';
import { FileContext } from 'librechat-data-provider';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createModels, createMethods } from '@librechat/data-schemas';
import type { IChatProject, IMongoFile } from '@librechat/data-schemas';
import type { GetProjectFiles } from './resources';
import {
  getChatProjectFileAvailability,
  listChatProjectFileViews,
  resolveChatProjectFiles,
} from './resources';
import { getChatProjectContextKey, resolveChatProjectContext } from './context';

let mongoServer: InstanceType<typeof MongoMemoryServer>;
let File: mongoose.Model<IMongoFile>;
let modelsToCleanup: string[] = [];

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const models = createModels(mongoose);
  modelsToCleanup = Object.keys(models);
  Object.assign(mongoose.models, models);
  File = mongoose.models.File as mongoose.Model<IMongoFile>;
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  for (const modelName of modelsToCleanup) {
    if (mongoose.models[modelName]) {
      delete mongoose.models[modelName];
    }
  }
});

afterEach(async () => {
  await File.deleteMany({});
  await mongoose.models.ChatProject.deleteMany({});
});

const file = (
  file_id: string,
  user: string,
  overrides: Partial<IMongoFile> = {},
): Partial<IMongoFile> => ({
  file_id,
  user: new mongoose.Types.ObjectId(user),
  filename: `${file_id}.txt`,
  filepath: `/tmp/${file_id}`,
  bytes: 12,
  object: 'file',
  type: 'text/plain',
  usage: 0,
  source: 'local',
  embedded: true,
  context: FileContext.message_attachment,
  text: 'must never be loaded',
  ...overrides,
});

describe('ChatProject resource hydration', () => {
  it('preserves Project compatibility when signed file URLs are refreshed', async () => {
    const owner = new mongoose.Types.ObjectId().toString();
    const methods = createMethods(mongoose);
    const fileId = 'signed-reference';
    const originalUrl = 'https://bucket.s3.amazonaws.com/reference.txt?X-Amz-Signature=original';
    const refreshedUrl = 'https://bucket.s3.amazonaws.com/reference.txt?X-Amz-Signature=refreshed';
    await File.create(file(fileId, owner, { source: 's3', filepath: originalUrl }));
    await File.updateOne(
      { file_id: fileId },
      { $set: { updatedAt: new Date('2020-01-01') } },
      { timestamps: false },
    );
    const project = await methods.createChatProject(owner, { name: 'Signed reference' });
    const projectId = project._id!.toString();
    await methods.addChatProjectFile(owner, projectId, fileId);
    const input = { userId: owner, requestedProjectId: projectId };
    const before = await resolveChatProjectContext(input, methods);

    await methods.batchUpdateFiles([{ file_id: fileId, filepath: refreshedUrl }]);
    const after = await resolveChatProjectContext(input, methods);

    expect(after?.resources).toEqual([
      expect.objectContaining({
        availability: 'ready',
        file: expect.objectContaining({ filepath: refreshedUrl }),
      }),
    ]);
    expect(getChatProjectContextKey(after)).toBe(getChatProjectContextKey(before));
  });

  it('only marks canonical unscoped message attachments ready', () => {
    expect(
      getChatProjectFileAvailability(
        file('ready', new mongoose.Types.ObjectId().toString()) as IMongoFile,
      ),
    ).toBe('ready');
    expect(
      getChatProjectFileAvailability(
        file('agent', new mongoose.Types.ObjectId().toString(), {
          context: FileContext.agents,
        }) as IMongoFile,
      ),
    ).toBe('unavailable');
    expect(
      getChatProjectFileAvailability(
        file('not-indexed', new mongoose.Types.ObjectId().toString(), {
          embedded: false,
        }) as IMongoFile,
      ),
    ).toBe('unavailable');
    expect(
      getChatProjectFileAvailability(
        file('expired', new mongoose.Types.ObjectId().toString(), {
          expiredAt: new Date(Date.now() - 1),
        }) as IMongoFile,
      ),
    ).toBe('unavailable');
  });

  it('hydrates ready runtime files and safe unavailable views from canonical Mongo records', async () => {
    const owner = new mongoose.Types.ObjectId().toString();
    const tenantId = 'tenant-a';
    await File.create(file('ready', owner, { tenantId }));
    await File.create(file('expired', owner, { tenantId, expiredAt: new Date(Date.now() - 1) }));
    await File.create(file('agent-scoped', owner, { tenantId, context: FileContext.agents }));
    await File.create(file('foreign', new mongoose.Types.ObjectId().toString(), { tenantId }));

    const getFiles: GetProjectFiles = async (filter, _sort, select) =>
      (await File.find(filter)
        .select(select ?? {})
        .lean()) as unknown as IMongoFile[];
    const project = {
      file_ids: ['ready', 'expired', 'agent-scoped', 'foreign', 'missing'],
      tenantId,
    } as Pick<IChatProject, 'file_ids' | 'tenantId'>;

    const runtimeFiles = await resolveChatProjectFiles({
      project,
      userId: owner,
      tenantId,
      getFiles,
    });
    expect(runtimeFiles.map((runtimeFile) => runtimeFile.file_id)).toEqual(['ready']);
    expect(runtimeFiles[0]).not.toHaveProperty('text');

    const views = await listChatProjectFileViews({
      project,
      userId: owner,
      tenantId,
      getFiles,
    });
    expect(views).toEqual([
      {
        file_id: 'ready',
        filename: 'ready.txt',
        type: 'text/plain',
        bytes: 12,
        availability: 'ready',
      },
      {
        file_id: 'expired',
        filename: 'expired.txt',
        type: 'text/plain',
        bytes: 12,
        availability: 'unavailable',
      },
      {
        file_id: 'agent-scoped',
        availability: 'unavailable',
      },
      { file_id: 'foreign', availability: 'unavailable' },
      { file_id: 'missing', availability: 'unavailable' },
    ]);
  });
});
