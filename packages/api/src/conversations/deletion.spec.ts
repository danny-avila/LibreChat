import type { ConversationDeletionDeps } from './deletion';
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
