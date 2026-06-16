import type { Agents } from 'librechat-data-provider';
import { InMemoryEventTransport } from '~/stream/implementations/InMemoryEventTransport';
import { buildPendingAction, buildToolApprovalPayload } from '~/agents/hitl/policy';
import { InMemoryJobStore } from '~/stream/implementations/InMemoryJobStore';
import { GenerationJobManagerClass } from '~/stream/GenerationJobManager';

jest.spyOn(console, 'log').mockImplementation();

describe('ApprovalLifecycle via GenerationJobManager.approvals (in-memory)', () => {
  let manager: GenerationJobManagerClass;

  beforeEach(() => {
    manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore: new InMemoryJobStore({ ttlAfterComplete: 60000 }),
      eventTransport: new InMemoryEventTransport(),
      isRedis: false,
      cleanupOnComplete: false,
    });
    manager.initialize();
  });

  afterEach(async () => {
    await manager.destroy();
  });

  function buildAction(streamId: string, overrides: Partial<Agents.PendingAction> = {}) {
    const payload = buildToolApprovalPayload([
      { name: 'shell', arguments: { command: 'ls' }, tool_call_id: 'call_abc' },
    ]);
    const action = buildPendingAction(payload, {
      streamId,
      conversationId: streamId,
      runId: 'run-1',
      responseMessageId: 'msg-1',
    });
    return { ...action, ...overrides };
  }

  describe('pause', () => {
    test('running → requires_action, persisting the pending record', async () => {
      const streamId = 'stream-pause';
      await manager.createJob(streamId, 'user-1');

      const action = buildAction(streamId);
      expect(await manager.approvals.pause(streamId, action)).toBe(true);

      expect(await manager.getJobStatus(streamId)).toBe('requires_action');
      const pending = await manager.approvals.peek(streamId);
      expect(pending?.actionId).toBe(action.actionId);
      expect(pending?.payload.type).toBe('tool_approval');
      if (pending?.payload.type === 'tool_approval') {
        expect(pending.payload.action_requests[0].name).toBe('shell');
      }
    });

    test('returns false when the job is already terminal', async () => {
      const streamId = 'stream-pause-dead';
      await manager.createJob(streamId, 'user-1');
      await manager.completeJob(streamId, 'terminated mid-flight');

      expect(await manager.approvals.pause(streamId, buildAction(streamId))).toBe(false);
      // a late interrupt must NOT resurrect a terminal job into requires_action
      expect(await manager.getJobStatus(streamId)).not.toBe('requires_action');
    });

    test('returns false when the job does not exist', async () => {
      expect(await manager.approvals.pause('nonexistent', buildAction('nonexistent'))).toBe(false);
    });
  });

  describe('peek', () => {
    test('returns null for jobs not in requires_action', async () => {
      const streamId = 'stream-running';
      await manager.createJob(streamId, 'user-1');
      expect(await manager.approvals.peek(streamId)).toBeNull();
    });

    test('returns null when the job does not exist', async () => {
      expect(await manager.approvals.peek('nonexistent')).toBeNull();
    });

    test('treats a past-expiresAt record as gone (lazy expiry)', async () => {
      const streamId = 'stream-expired-peek';
      await manager.createJob(streamId, 'user-1');
      await manager.approvals.pause(
        streamId,
        buildAction(streamId, { expiresAt: Date.now() - 1000 }),
      );

      expect(await manager.approvals.peek(streamId)).toBeNull();
    });
  });

  describe('resolve', () => {
    test('requires_action → running, clearing the record, returns true once', async () => {
      const streamId = 'stream-resolve';
      await manager.createJob(streamId, 'user-1');
      await manager.approvals.pause(streamId, buildAction(streamId));

      expect(await manager.approvals.resolve(streamId)).toBe(true);
      expect(await manager.getJobStatus(streamId)).toBe('running');
      expect(await manager.approvals.peek(streamId)).toBeNull();
    });

    test('a concurrent double-resolve wins exactly once (race-safe)', async () => {
      const streamId = 'stream-double-resolve';
      await manager.createJob(streamId, 'user-1');
      await manager.approvals.pause(streamId, buildAction(streamId));

      const results = await Promise.all([
        manager.approvals.resolve(streamId),
        manager.approvals.resolve(streamId),
      ]);

      // Exactly one caller may drive the run — the other must be rejected.
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await manager.getJobStatus(streamId)).toBe('running');
    });

    test('returns false when the job is not paused', async () => {
      const streamId = 'stream-resolve-running';
      await manager.createJob(streamId, 'user-1');
      expect(await manager.approvals.resolve(streamId)).toBe(false);
    });

    test('an expired pending action expires instead of resuming', async () => {
      const streamId = 'stream-resolve-expired';
      await manager.createJob(streamId, 'user-1');
      await manager.approvals.pause(
        streamId,
        buildAction(streamId, { expiresAt: Date.now() - 1000 }),
      );

      expect(await manager.approvals.resolve(streamId)).toBe(false);
      expect(await manager.getJobStatus(streamId)).toBe('aborted');
    });
  });

  describe('expire', () => {
    test('requires_action → aborted, clearing the record, returns true once', async () => {
      const streamId = 'stream-expire';
      await manager.createJob(streamId, 'user-1');
      await manager.approvals.pause(streamId, buildAction(streamId));

      expect(await manager.approvals.expire(streamId)).toBe(true);
      expect(await manager.getJobStatus(streamId)).toBe('aborted');
      expect(await manager.approvals.peek(streamId)).toBeNull();

      // idempotent — a second expire does not fire again
      expect(await manager.approvals.expire(streamId)).toBe(false);
    });

    test('returns false when the job is not paused', async () => {
      const streamId = 'stream-expire-running';
      await manager.createJob(streamId, 'user-1');
      expect(await manager.approvals.expire(streamId)).toBe(false);
    });
  });

  describe('facade integration', () => {
    test('requires_action drops the running count but keeps the user-active set', async () => {
      const streamId = 'stream-counts';
      await manager.createJob(streamId, 'user-counts');

      const before = await manager.getJobCountByStatus();
      expect(before.running).toBe(1);
      expect(before.requires_action).toBe(0);

      await manager.approvals.pause(streamId, buildAction(streamId));

      const after = await manager.getJobCountByStatus();
      expect(after.running).toBe(0);
      expect(after.requires_action).toBe(1);

      // Pending-approval jobs still occupy the user's conversation slot.
      expect(await manager.getActiveJobIdsForUser('user-counts')).toContain(streamId);
    });

    test('getActiveJobIdsForUser excludes terminal jobs but includes requires_action', async () => {
      await manager.createJob('s-running', 'user-mix');
      await manager.createJob('s-paused', 'user-mix');
      await manager.createJob('s-done', 'user-mix');

      await manager.approvals.pause('s-paused', buildAction('s-paused'));
      await manager.completeJob('s-done');

      const active = await manager.getActiveJobIdsForUser('user-mix');
      expect(active.sort()).toEqual(['s-paused', 's-running']);
    });
  });
});
