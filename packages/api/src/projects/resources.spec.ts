import mongoose from 'mongoose';
import { createHash } from 'crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createModels, createMethods } from '@librechat/data-schemas';
import { configSchema, FileContext, FileSources } from 'librechat-data-provider';
import type { IChatProject, IMongoFile } from '@librechat/data-schemas';
import {
  getChatProjectFileAvailability,
  listChatProjectFileViews,
  resolveChatProjectFiles,
} from './resources';
import { getChatProjectContextKey, resolveChatProjectContext } from './context';
import { hasResumeProjectContextChanged } from './resume';

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
  await mongoose.models.Conversation.deleteMany({});
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

const getProjectFiles: ReturnType<typeof createMethods>['getProjectFiles'] = (options) =>
  createMethods(mongoose).getProjectFiles(options);

describe('ChatProject resource hydration', () => {
  it('resumes an unchanged dev-era File Search approval with project code disabled', async () => {
    const owner = new mongoose.Types.ObjectId().toString();
    const methods = createMethods(mongoose);
    const stored = await File.create(file('legacy-upload', owner));
    const project = await methods.createChatProject(owner, { name: 'Legacy approval' });
    const projectId = project._id!.toString();
    await methods.addChatProjectFile(owner, projectId, stored.file_id);
    await mongoose.models.Conversation.create({
      user: owner,
      conversationId: 'legacy-approval',
      endpoint: 'agents',
      chatProjectId: projectId,
    });
    // This payload is the persisted resource-version contract on dev.
    const version = createHash('sha256')
      .update(
        JSON.stringify({
          identity: stored._id.toString(),
          file_id: stored.file_id,
          availability: 'ready',
          embedded: stored.embedded ?? null,
          context: stored.context ?? null,
          expiredAt: stored.expiredAt?.toISOString() ?? null,
          createdAt: stored.createdAt?.toISOString() ?? null,
          updatedAt: stored.updatedAt?.toISOString() ?? null,
          previewRevision: stored.previewRevision ?? null,
          status: stored.status ?? null,
          bytes: stored.bytes,
          filename: stored.filename,
          type: stored.type,
        }),
      )
      .digest('hex');
    const resourceKey = [[stored.file_id, stored._id.toString(), 'ready', version]];
    const expectedKey = `chat-project:${projectId}:1:${JSON.stringify([stored.file_id])}:${JSON.stringify(resourceKey)}`;
    const req = {
      user: { id: owner },
      config: configSchema.parse({ version: '1.3.11' }),
    };
    expect(req.config.projects.codeExecution).toBe(false);
    expect(
      await hasResumeProjectContextChanged(
        { req, conversationId: 'legacy-approval', expectedKey },
        { ...methods, logger: { warn: jest.fn(), error: jest.fn() } },
      ),
    ).toBe(false);
  });

  it.each(['atomic', 'legacy'])(
    'resumes a project approval after %s sandbox reprovisioning',
    async (writer) => {
      const owner = new mongoose.Types.ObjectId().toString();
      const methods = createMethods(mongoose);
      await File.create(file('data', owner, { embedded: false, type: 'text/csv' }));
      const contentTime = new Date('2025-01-01T00:00:00Z');
      await File.updateOne(
        { file_id: 'data' },
        { $set: { updatedAt: contentTime } },
        { timestamps: false },
      );
      const project = await methods.createChatProject(owner, { name: 'Code approval' });
      const projectId = project._id!.toString();
      await methods.addChatProjectFile(owner, projectId, 'data', { codeExecution: true });
      await mongoose.models.Conversation.create({
        user: owner,
        conversationId: 'approval-chat',
        endpoint: 'agents',
        chatProjectId: projectId,
      });
      const before = await resolveChatProjectContext(
        { userId: owner, conversationId: 'approval-chat', codeExecution: true },
        methods,
      );
      const ref = {
        kind: 'user' as const,
        id: owner,
        storage_session_id: 'fresh-session',
        file_id: 'fresh-storage-file',
      };
      if (writer === 'atomic') {
        await methods.updateFileCodeEnvRef({
          file_id: 'data',
          routeKey: 'default',
          ref,
          legacyRef: ref,
        });
      } else {
        const pointers = {
          file_id: 'data',
          'metadata.codeEnvRef': ref,
          'metadata.codeEnvRefs.default': ref,
        };
        await methods.updateFile(pointers);
      }
      const req = {
        user: { id: owner },
        config: configSchema.parse({ version: '1.3.11', projects: { codeExecution: true } }),
      };
      const logger = { warn: jest.fn(), error: jest.fn() };
      expect(
        await hasResumeProjectContextChanged(
          { req, conversationId: 'approval-chat', expectedKey: getChatProjectContextKey(before) },
          { ...methods, logger },
        ),
      ).toBe(false);
      await methods.updateFile({ file_id: 'data', bytes: 24 });
      expect(
        await hasResumeProjectContextChanged(
          { req, conversationId: 'approval-chat', expectedKey: getChatProjectContextKey(before) },
          { ...methods, logger },
        ),
      ).toBe(true);
    },
  );

  it('keeps a generated file compatible when only its deferred preview finishes', async () => {
    const owner = new mongoose.Types.ObjectId().toString();
    const methods = createMethods(mongoose);
    const dispatchedAt = Date.now();
    await File.create(
      file('generated-preview', owner, {
        embedded: false,
        context: FileContext.execute_code,
        type: 'text/csv',
        status: 'pending',
        previewRevision: 'preview',
        metadata: { sourceDispatchedAt: dispatchedAt },
      }),
    );
    const project = await methods.createChatProject(owner, { name: 'Deferred output' });
    const projectId = project._id!.toString();
    await methods.addChatProjectFile(owner, projectId, 'generated-preview', {
      codeExecution: true,
    });
    const input = { userId: owner, requestedProjectId: projectId, codeExecution: true };
    const before = await resolveChatProjectContext(input, methods);
    await methods.updateFile({
      file_id: 'generated-preview',
      status: 'ready',
      text: '<table>preview</table>',
    });
    const after = await resolveChatProjectContext(input, methods);
    expect(getChatProjectContextKey(after)).toBe(getChatProjectContextKey(before));
    await methods.updateFile({
      file_id: 'generated-preview',
      metadata: { sourceDispatchedAt: dispatchedAt + 1 },
    });
    const replaced = await resolveChatProjectContext(input, methods);
    expect(getChatProjectContextKey(replaced)).not.toBe(getChatProjectContextKey(before));
  });
  it('reuses unindexed data in separate project chats and stops injecting removed files', async () => {
    const owner = new mongoose.Types.ObjectId().toString();
    const methods = createMethods(mongoose);
    const metadata = {
      destinationChosen: true,
      codeEnvRef: {
        kind: 'user' as const,
        id: owner,
        storage_session_id: 'storage',
        file_id: 'remote',
      },
    };
    await File.create(
      file('dataset', owner, {
        embedded: false,
        type: 'text/csv',
        source: FileSources.s3,
        storageKey: 'uploads/dataset.csv',
        metadata,
      }),
    );
    const project = await methods.createChatProject(owner, { name: 'Analysis' });
    const projectId = project._id!.toString();
    await methods.addChatProjectFile(owner, projectId, 'dataset', { codeExecution: true });
    await mongoose.models.Conversation.create([
      { conversationId: 'analysis-1', endpoint: 'agents', user: owner, chatProjectId: projectId },
      { conversationId: 'analysis-2', endpoint: 'agents', user: owner, chatProjectId: projectId },
    ]);
    for (const conversationId of ['analysis-1', 'analysis-2']) {
      const context = await resolveChatProjectContext(
        { userId: owner, conversationId, codeExecution: true },
        methods,
      );
      const files = await resolveChatProjectFiles({
        project: context!,
        resources: context!.resources,
        userId: owner,
        getProjectFiles,
        codeExecution: true,
      });
      expect(files).toEqual([
        expect.objectContaining({
          file_id: 'dataset',
          embedded: false,
          source: FileSources.s3,
          storageKey: 'uploads/dataset.csv',
          metadata,
        }),
      ]);
      expect(files[0]).not.toHaveProperty('text');
    }
    await methods.removeChatProjectFile(owner, projectId, 'dataset');
    const context = await resolveChatProjectContext(
      { userId: owner, conversationId: 'analysis-1', codeExecution: true },
      methods,
    );
    expect(context?.file_ids).toEqual([]);
    expect(context?.resources).toEqual([]);
  });

  it('preserves Project compatibility when signed file URLs are refreshed', async () => {
    const owner = new mongoose.Types.ObjectId().toString();
    const methods = { ...createMethods(mongoose), getProjectFiles };
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

  it('preserves Project compatibility when a referenced image is reused', async () => {
    const owner = new mongoose.Types.ObjectId().toString();
    const methods = { ...createMethods(mongoose), getProjectFiles };
    const fileId = 'reused-image';
    await File.create(
      file(fileId, owner, { type: 'image/png', filename: 'reference.png', source: 'local' }),
    );
    await File.updateOne(
      { file_id: fileId },
      { $set: { updatedAt: new Date('2020-01-01') } },
      { timestamps: false },
    );
    const project = await methods.createChatProject(owner, { name: 'Reused image' });
    const projectId = project._id!.toString();
    await methods.addChatProjectFile(owner, projectId, fileId);
    const input = { userId: owner, requestedProjectId: projectId };
    const before = await resolveChatProjectContext(input, methods);

    /* `prepareImageURL` promotes the upload with nothing but the id on every reuse. */
    await methods.updateFile({ file_id: fileId });
    const after = await resolveChatProjectContext(input, methods);

    expect(after?.resources).toEqual([expect.objectContaining({ availability: 'ready' })]);
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
    const ready = await File.create(file('ready', owner, { tenantId, conversationId: 'origin' }));
    await File.create(file('expired', owner, { tenantId, expiredAt: new Date(Date.now() - 1) }));
    await File.create(file('agent-scoped', owner, { tenantId, context: FileContext.agents }));
    await File.create(file('foreign', new mongoose.Types.ObjectId().toString(), { tenantId }));

    const project = {
      file_ids: ['ready', 'expired', 'agent-scoped', 'foreign', 'missing'],
      tenantId,
    } as Pick<IChatProject, 'file_ids' | 'tenantId'>;

    const runtimeFiles = await resolveChatProjectFiles({
      project,
      userId: owner,
      tenantId,
      getProjectFiles,
    });
    expect(runtimeFiles.map((runtimeFile) => runtimeFile.file_id)).toEqual(['ready']);
    expect(runtimeFiles[0]).not.toHaveProperty('text');
    expect(runtimeFiles[0]).toMatchObject({ conversationId: 'origin', createdAt: ready.createdAt });

    const views = await listChatProjectFileViews({
      project,
      userId: owner,
      tenantId,
      getProjectFiles,
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
