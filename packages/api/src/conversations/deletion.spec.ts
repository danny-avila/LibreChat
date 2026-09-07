import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMethods, createModels, tenantStorage } from '@librechat/data-schemas';
import type { ConversationDeletionDeps } from './deletion';
import { openCheckpointDeletion } from '../agents/checkpoints/deletion';
import { createCheckpointNamespace } from '../stream/checkpoints';
import { createConversationDeletionService } from './deletion';

function intent(initial: string[] = []) {
  const ids = new Set(initial);
  return {
    conversationIds: () => [...ids],
    remember: async (targets: readonly string[]) => {
      for (const id of targets) ids.add(id);
    },
    cleanup: jest.fn(async () => {}),
    acknowledge: jest.fn(async () => {
      ids.clear();
    }),
  };
}

describe('conversation deletion recovery', () => {
  it('authorizes generation-only recovery by exact owner, tenant, and conversation', async () => {
    const deps = {
      openCheckpointDeletion: jest.fn().mockResolvedValue(intent()),
      db: {},
      subagentThreadTaskStore: {
        planCancellationForConversations: jest.fn().mockResolvedValue({ leases: [] }),
      },
      GenerationJobManager: {
        getCleanupBlockingJobIdsForConversations: jest.fn().mockResolvedValue(['run-a']),
        getCleanupJob: jest.fn().mockResolvedValue({
          metadata: {
            userId: 'owner-a',
            tenantId: 'tenant-a',
            conversationId: 'conversation-a',
          },
        }),
      },
    } as unknown as ConversationDeletionDeps;
    const service = createConversationDeletionService(deps);

    await expect(
      service.canRecoverAgentConversationDeletion('owner-a', 'conversation-a', 'tenant-a'),
    ).resolves.toBe(true);
    await expect(
      service.canRecoverAgentConversationDeletion('owner-b', 'conversation-a', 'tenant-a'),
    ).resolves.toBe(false);
    await expect(
      service.canRecoverAgentConversationDeletion('owner-a', 'conversation-a', 'tenant-b'),
    ).resolves.toBe(false);
  });

  it('does not authorize named-tenant recovery from a tenantless generation with the same ID', async () => {
    const deps = {
      openCheckpointDeletion: jest.fn().mockResolvedValue(intent()),
      subagentThreadTaskStore: {
        planCancellationForConversations: jest.fn().mockResolvedValue({ leases: [] }),
      },
      GenerationJobManager: {
        getCleanupBlockingJobIdsForConversations: jest.fn().mockResolvedValue(['legacy-run']),
        getCleanupJob: jest
          .fn()
          .mockResolvedValue({ metadata: { userId: 'owner', conversationId: 'same' } }),
      },
    } as unknown as ConversationDeletionDeps;
    const service = createConversationDeletionService(deps);
    expect(await service.canRecoverAgentConversationDeletion('owner', 'same', 'named')).toBe(false);
    expect(await service.canRecoverAgentConversationDeletion('owner', 'same')).toBe(true);
  });

  it('authorizes a retry from a retained cascade deletion intent', async () => {
    const deps = {
      openCheckpointDeletion: jest.fn().mockResolvedValue(intent(['conversation-a', 'child-a'])),
      subagentThreadTaskStore: {
        planCancellationForConversations: jest.fn().mockResolvedValue({ leases: [] }),
      },
    } as unknown as ConversationDeletionDeps;
    const service = createConversationDeletionService(deps);

    await expect(
      service.canRecoverAgentConversationDeletion('owner-a', 'conversation-a', 'tenant-a'),
    ).resolves.toBe(true);
  });

  it('reaches final dependent cleanup for an authorized retry with a missing root', async () => {
    const db = {
      deleteConvos: jest.fn().mockResolvedValue({
        acknowledged: true,
        deletedCount: 0,
        messages: { acknowledged: true, deletedCount: 0 },
        conversationIds: [],
      }),
      deleteMessages: jest.fn().mockResolvedValue({ acknowledged: true, deletedCount: 0 }),
      deleteToolCalls: jest.fn().mockResolvedValue({ acknowledged: true, deletedCount: 1 }),
    };
    const deleteConvoSharedLinksWithCleanup = jest
      .fn()
      .mockResolvedValue({ message: 'deleted', deletedCount: 1 });
    const deps = {
      openCheckpointDeletion: jest.fn().mockResolvedValue(intent()),
      db,
      subagentThreadTaskStore: {
        planCancellationForConversations: jest.fn().mockResolvedValue({ leases: [] }),
        cancelPlan: jest.fn().mockResolvedValue(undefined),
        withOwnerDeletionFence: jest.fn(),
      },
      GenerationJobManager: {
        getCleanupBlockingJobIdsForConversations: jest.fn().mockResolvedValue([]),
        getCleanupBlockingJobIdsForUser: jest.fn().mockResolvedValue([]),
        getCleanupJob: jest.fn().mockResolvedValue(null),
      },
      deleteConvoSharedLinksWithCleanup,
      isStopConfirmed: jest.fn(() => true),
      logger: { warn: jest.fn() },
    } as unknown as ConversationDeletionDeps;
    const service = createConversationDeletionService(deps);

    await service.deleteConversations(
      'owner-a',
      { conversationId: 'conversation-a' },
      'tenant-a',
      undefined,
      { allowMissingRoot: true },
    );

    expect(db.deleteConvos).toHaveBeenCalledWith(
      'owner-a',
      { conversationId: 'conversation-a' },
      expect.objectContaining({ allowEmpty: true, tenantId: 'tenant-a' }),
    );
    expect(db.deleteToolCalls).toHaveBeenCalledWith('owner-a', 'conversation-a', 'tenant-a');
    expect(deleteConvoSharedLinksWithCleanup).toHaveBeenCalledWith(
      'owner-a',
      'conversation-a',
      'tenant-a',
    );
  });
  it.each(['tools', 'links'])(
    'retains the cascade intent until child %s cleanup succeeds',
    async (failure) => {
      const deletion = intent();
      let deleted = false;
      let failed = false;
      const cleanup = async (_user: string, id: string) => {
        if (id === 'child' && !failed) {
          failed = true;
          throw new Error('cleanup unavailable');
        }
      };
      const empty = {
        acknowledged: true,
        deletedCount: 0,
        messages: { acknowledged: true, deletedCount: 0 },
        conversationIds: [],
      };
      const deps = {
        openCheckpointDeletion: jest.fn().mockResolvedValue(deletion),
        db: {
          deleteConvos: jest.fn(async (_user, _filter, options) => {
            if (deleted) return empty;
            await options.beforeDelete(['root', 'child']);
            deleted = true;
            return { ...empty, deletedCount: 2, conversationIds: ['root', 'child'] };
          }),
          deleteMessages: jest.fn().mockResolvedValue({ acknowledged: true, deletedCount: 0 }),
          deleteToolCalls: jest.fn(failure === 'tools' ? cleanup : async () => undefined),
        },
        subagentThreadTaskStore: {
          planCancellationForConversations: jest.fn().mockResolvedValue({ leases: [] }),
          cancelPlan: jest.fn().mockResolvedValue(0),
        },
        GenerationJobManager: {
          getCleanupBlockingJobIdsForConversations: jest.fn().mockResolvedValue([]),
          getCleanupJob: jest.fn().mockResolvedValue(null),
        },
        deleteConvoSharedLinksWithCleanup: jest.fn(
          failure === 'links' ? cleanup : async () => undefined,
        ),
        isStopConfirmed: () => true,
        logger: { warn: jest.fn() },
      } as unknown as ConversationDeletionDeps;
      const service = createConversationDeletionService(deps);
      await expect(
        service.deleteConversations('owner', { conversationId: 'root' }, 'tenant'),
      ).rejects.toThrow('cleanup unavailable');
      expect(deletion.acknowledge).not.toHaveBeenCalled();
      expect(deletion.conversationIds()).toEqual(['root', 'child']);
      await expect(
        service.canRecoverAgentConversationDeletion('owner', 'root', 'tenant'),
      ).resolves.toBe(true);
      await service.deleteConversations('owner', { conversationId: 'root' }, 'tenant', undefined, {
        allowMissingRoot: true,
      });
      expect(deps.db.deleteToolCalls).toHaveBeenCalledWith('owner', 'child', 'tenant');
      expect(deps.deleteConvoSharedLinksWithCleanup).toHaveBeenCalledWith(
        'owner',
        'child',
        'tenant',
      );
      expect(deletion.acknowledge).toHaveBeenCalledTimes(1);
      expect(deletion.conversationIds()).toEqual([]);
    },
  );
});

describe('missing-root deletion with real persistence', () => {
  let server: MongoMemoryServer;
  beforeAll(async () => {
    createModels(mongoose);
    server = await MongoMemoryServer.create();
    await mongoose.connect(server.getUri());
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await mongoose.connection.db!.dropDatabase();
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await server.stop();
  });

  it.each([false, true])(
    'captures missing roots before erasing remnants and retries failed capture (message=%s)',
    async (hasMessage) => {
      const cfg = {
        type: 'mongo' as const,
        checkpointCollectionName: 'recovery_cp',
        checkpointWritesCollectionName: 'recovery_writes',
      };
      const ownNamespace = createCheckpointNamespace('aaaaaaaaaaaaaaaaaaaaaaaa', 'tenant');
      const foreignNamespace = createCheckpointNamespace('bbbbbbbbbbbbbbbbbbbbbbbb', 'tenant');
      const otherTenantNamespace = createCheckpointNamespace(
        'aaaaaaaaaaaaaaaaaaaaaaaa',
        'other-tenant',
      );
      for (const name of ['recovery_cp', 'recovery_writes']) {
        await mongoose.connection.db!.collection(name).insertMany(
          [ownNamespace, foreignNamespace, otherTenantNamespace].map((checkpoint_ns) => ({
            thread_id: 'missing-root',
            checkpoint_ns,
            checkpoint_id: 'checkpoint',
          })),
        );
      }
      await tenantStorage.run({ tenantId: 'tenant' }, async () => {
        if (hasMessage) {
          await mongoose.models.Message.create({
            user: 'aaaaaaaaaaaaaaaaaaaaaaaa',
            conversationId: 'missing-root',
            messageId: 'orphan',
            sender: 'assistant',
            text: 'remaining evidence',
          });
        }
        const firstIntent = await openCheckpointDeletion(
          'aaaaaaaaaaaaaaaaaaaaaaaa',
          'tenant',
          'missing-root',
          cfg,
        );
        jest.spyOn(firstIntent, 'remember').mockRejectedValueOnce(new Error('capture unavailable'));
        const opener = jest.fn(openCheckpointDeletion).mockResolvedValueOnce(firstIntent);
        const service = createConversationDeletionService({
          db: createMethods(mongoose),
          openCheckpointDeletion: opener,
          subagentThreadTaskStore: {
            planCancellationForConversations: jest.fn().mockResolvedValue({ leases: [] }),
            cancelPlan: jest.fn().mockResolvedValue(0),
          },
          GenerationJobManager: {
            getCleanupBlockingJobIdsForConversations: jest.fn().mockResolvedValue([]),
            getCleanupJob: jest.fn().mockResolvedValue(null),
          },
          deleteConvoSharedLinksWithCleanup: jest.fn().mockResolvedValue(undefined),
          isStopConfirmed: () => true,
          logger: { warn: jest.fn() },
        } as unknown as ConversationDeletionDeps);
        const remove = () =>
          service.deleteConversations(
            'aaaaaaaaaaaaaaaaaaaaaaaa',
            { conversationId: 'missing-root' },
            'tenant',
            cfg,
            {
              allowMissingRoot: true,
            },
          );
        await expect(remove()).rejects.toThrow('capture unavailable');
        expect(
          await mongoose.models.Message.countDocuments({ user: 'aaaaaaaaaaaaaaaaaaaaaaaa' }),
        ).toBe(hasMessage ? 1 : 0);
        expect(await mongoose.connection.db!.collection('recovery_cp').countDocuments()).toBe(3);
        await expect(remove()).resolves.toMatchObject({ conversationIds: ['missing-root'] });
        expect(
          await mongoose.models.Message.countDocuments({ user: 'aaaaaaaaaaaaaaaaaaaaaaaa' }),
        ).toBe(0);
        for (const name of ['recovery_cp', 'recovery_writes']) {
          const remaining = await mongoose.connection.db!.collection(name).find().toArray();
          expect(remaining.map((row) => row.checkpoint_ns).sort()).toEqual(
            [foreignNamespace, otherTenantNamespace].sort(),
          );
        }
        expect(
          (
            await openCheckpointDeletion('aaaaaaaaaaaaaaaaaaaaaaaa', 'tenant', 'missing-root', cfg)
          ).conversationIds(),
        ).toEqual([]);
      });
    },
  );
});
