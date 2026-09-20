import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ContentTypes, mediaSubmissionRequestSchema } from 'librechat-data-provider';
import {
  createModels,
  createMethods,
  createMediaMethods,
  createMediaNativeMethods,
} from '@librechat/data-schemas';
import type { MediaMethods, MediaNativeMethods, MediaOwnerScope } from '@librechat/data-schemas';
import { executeConversationImportWrites } from './import';
import { saveNativeConversationClone } from './native';

describe('native conversation clone publication', () => {
  let mongo: MongoMemoryServer;
  let media: MediaMethods;
  let native: MediaNativeMethods;
  let scope: MediaOwnerScope;
  let repository: ReturnType<typeof createMethods>;
  const execution = {
    api: 'google.generateContent' as const,
    modelId: 'image-model',
    connectionId: 'google',
    catalogVersion: 'v1',
    bindingRevision: 'credential',
  };
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    createModels(mongoose);
    media = createMediaMethods(mongoose, { ownerExists: async () => true });
    native = createMediaNativeMethods(mongoose, media);
    repository = createMethods(mongoose);
    await media.ensureMediaIndexes();
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });
  beforeEach(async () => {
    await Promise.all(
      Object.values(mongoose.models).map((model) => model.collection.deleteMany({})),
    );
    scope = { ownerId: new mongoose.Types.ObjectId().toString(), tenantId: null };
  });

  async function source() {
    const job = await native.startMediaNativeRecording({
      scope,
      source: { conversationId: 'source', messageId: 'source-message', modelRunId: 'run' },
      execution,
      request: mediaSubmissionRequestSchema.parse({
        clientRequestId: 'native',
        operation: 'image.generate',
        prompt: 'image',
        selection: { connectionId: 'google', modelId: 'image-model', catalogVersion: 'v1' },
      }),
      maxRetainers: 4,
      maxTitleChars: 20,
      limits: { maxParts: 4, maxPartBytes: 1024, maxRecordingBytes: 4096 },
    });
    const reference = await native.recordMediaNativePart({
      scope,
      jobId: job.jobId,
      chunkIndex: 0,
      partIndex: 0,
      part: { kind: 'text', text: 'caption' },
      maxRetainers: 4,
    });
    await native.completeMediaNativeRecording({ scope, jobId: job.jobId });
    const content = [
      { type: ContentTypes.TEXT as const, text: 'caption', native_media: reference },
    ];
    await mongoose.models.Message.create({
      user: scope.ownerId,
      conversationId: 'source',
      messageId: 'source-message',
      content,
    });
    return { reference, content, job };
  }

  it('retains after publication, survives concurrent maintenance, and keeps source and fork independent', async () => {
    const { reference, content, job } = await source();
    await saveNativeConversationClone({
      scope,
      sourceConversationId: 'source',
      conversationId: 'fork',
      messages: [{ content }],
      repository,
      loadConfig: async () => ({}),
      save: async () => {
        await native.reconcileMediaNativeConsumers({ scope, limit: 10, maxRetainers: 4 });
        expect(
          await native.getMediaNativeContinuation({
            scope,
            execution,
            ...reference,
            conversationId: 'fork',
          }),
        ).toBeNull();
        await mongoose.models.Message.create({
          user: scope.ownerId,
          conversationId: 'fork',
          messageId: 'fork-message',
          content,
        });
      },
    });
    expect((await media.getMediaJob(scope, job.jobId))?.nativeConsumerClaims ?? []).toEqual([]);
    await native.releaseMediaNativeConversation({
      scope,
      conversationId: 'source',
      maxRetainers: 4,
    });
    expect(
      await native.getMediaNativeContinuation({
        scope,
        execution,
        ...reference,
        conversationId: 'fork',
      }),
    ).not.toBeNull();
  });

  it('compensates failed publication without releasing the source consumer', async () => {
    const { reference, content } = await source();
    await expect(
      saveNativeConversationClone({
        scope,
        sourceConversationId: 'source',
        conversationId: 'failed-fork',
        messages: [{ content }],
        repository,
        loadConfig: async () => ({}),
        save: () =>
          executeConversationImportWrites({
            saveConversations: async () => {},
            saveMessages: async () => {
              await mongoose.models.Message.create({
                user: scope.ownerId,
                conversationId: 'failed-fork',
                messageId: 'partial',
                content,
              });
              throw new Error('partial write');
            },
            deleteMessages: async () => {
              await mongoose.models.Message.deleteMany({
                user: scope.ownerId,
                conversationId: 'failed-fork',
              });
            },
            deleteConversations: async () => {},
            updateTagCounts: async () => {},
          }),
      }),
    ).rejects.toThrow('partial write');
    expect(
      await native.getMediaNativeContinuation({
        scope,
        execution,
        ...reference,
        conversationId: 'failed-fork',
      }),
    ).toBeNull();
    expect(
      await native.getMediaNativeContinuation({
        scope,
        execution,
        ...reference,
        conversationId: 'source',
      }),
    ).not.toBeNull();
  });

  it('keeps a committed clone successful when claim confirmation temporarily fails', async () => {
    const { reference, content } = await source();
    const confirm = jest
      .spyOn(repository, 'confirmMediaNativeConversation')
      .mockRejectedValueOnce(new Error('temporary confirmation failure'));
    const onCleanupError = jest.fn();
    await expect(
      saveNativeConversationClone({
        scope,
        sourceConversationId: 'source',
        conversationId: 'committed',
        messages: [{ content }],
        repository,
        loadConfig: async () => ({}),
        onCleanupError,
        save: async () => {
          await mongoose.models.Message.create({
            user: scope.ownerId,
            conversationId: 'committed',
            messageId: 'committed-message',
            content,
          });
        },
      }),
    ).resolves.toBeUndefined();
    expect(onCleanupError).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
    await native.reconcileMediaNativeConsumers({ scope, limit: 10, maxRetainers: 4 });
    expect(
      await native.getMediaNativeContinuation({
        scope,
        execution,
        ...reference,
        conversationId: 'committed',
      }),
    ).not.toBeNull();
  });

  it('keeps a visible clone and detaches only unavailable native identity after retention expires', async () => {
    const { reference, content } = await source();
    await expect(
      saveNativeConversationClone({
        scope,
        sourceConversationId: 'source',
        conversationId: 'expired-copy',
        messages: [{ content }],
        repository,
        loadConfig: async () => ({}),
        save: async () => {
          await mongoose.models.Message.create({
            user: scope.ownerId,
            conversationId: 'expired-copy',
            messageId: 'expired-message',
            content,
          });
          await mongoose.models.MediaNativePart.updateOne(
            { continuationRef: reference.continuationRef },
            { $set: { expiresAt: new Date(0) } },
          );
        },
      }),
    ).resolves.toBeUndefined();
    expect(
      await mongoose.models.Message.countDocuments({
        user: scope.ownerId,
        conversationId: 'expired-copy',
      }),
    ).toBe(1);
    expect(
      (
        await mongoose.models.Message.findOne({ messageId: 'expired-message' }).lean<{
          content: Array<{ text?: string; native_media?: object }>;
        }>()
      )?.content,
    ).toEqual([{ type: ContentTypes.TEXT, text: 'caption' }]);
    expect(
      await mongoose.models.Message.countDocuments({
        user: scope.ownerId,
        conversationId: 'source',
      }),
    ).toBe(1);
  });
});
