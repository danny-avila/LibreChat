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

    test('rejects a resolve whose actionId no longer matches (stale-decision guard)', async () => {
      const streamId = 'stream-stale-action';
      await manager.createJob(streamId, 'user-1');
      const action = buildAction(streamId);
      await manager.approvals.pause(streamId, action);

      // A decision targeting a different action must not resume this one.
      expect(await manager.approvals.resolve(streamId, 'some-other-action-id')).toBe(false);
      expect(await manager.getJobStatus(streamId)).toBe('requires_action');

      // The matching actionId resolves it.
      expect(await manager.approvals.resolve(streamId, action.actionId)).toBe(true);
      expect(await manager.getJobStatus(streamId)).toBe('running');
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

    test('a mismatched expectedActionId no-ops (protects a re-paused action from a stale sweep)', async () => {
      const streamId = 'stream-expire-mismatch';
      await manager.createJob(streamId, 'user-1');
      await manager.approvals.pause(streamId, buildAction(streamId, { actionId: 'action-A' }));

      // A sweep that observed an OLDER (now-resolved) action must not abort the current
      // pause — its CAS only fires when the live pendingActionId still matches.
      expect(await manager.approvals.expire(streamId, 'stale-other-action')).toBe(false);
      expect(await manager.getJobStatus(streamId)).toBe('requires_action');

      // The matching id still expires it.
      expect(await manager.approvals.expire(streamId, 'action-A')).toBe(true);
      expect(await manager.getJobStatus(streamId)).toBe('aborted');
    });

    test('sets completedAt so terminal cleanup can reclaim the job', async () => {
      const streamId = 'stream-expire-completed';
      await manager.createJob(streamId, 'user-1');
      await manager.approvals.pause(streamId, buildAction(streamId));

      expect(await manager.approvals.expire(streamId)).toBe(true);
      const job = await manager.getJob(streamId);
      expect(job?.status).toBe('aborted');
      expect(job?.completedAt).toBeGreaterThan(0);
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

    test('excludes a pending-approval job whose prompt has expired', async () => {
      const streamId = 'stream-expired-active';
      await manager.createJob(streamId, 'user-exp');
      await manager.approvals.pause(
        streamId,
        buildAction(streamId, { expiresAt: Date.now() - 1000 }),
      );

      // Still requires_action, but the prompt is past expiry → no longer active.
      expect(await manager.getActiveJobIdsForUser('user-exp')).not.toContain(streamId);
    });
  });
});

describe('InMemoryJobStore — approval expiry cleanup', () => {
  test('cleanup() finalizes and reclaims a past-expiry pending-approval job', async () => {
    const store = new InMemoryJobStore({ ttlAfterComplete: 0 });
    await store.createJob('s1', 'u1');

    const action = buildPendingAction(
      buildToolApprovalPayload([{ name: 'shell', arguments: {}, tool_call_id: 'c1' }]),
      { streamId: 's1', ttlMs: -1000 },
    );
    await store.transitionStatus('s1', {
      from: 'running',
      to: 'requires_action',
      patch: { pendingAction: action, pendingActionId: action.actionId },
    });

    // A past-expiry approval must be finalized + reclaimed, not left resident.
    await store.cleanup();
    expect(await store.getJob('s1')).toBeNull();
  });
});

describe('GenerationJobManager HITL resume metadata (round 19)', () => {
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

  function buildAction(streamId: string) {
    const payload = buildToolApprovalPayload([
      { name: 'shell', arguments: { command: 'ls' }, tool_call_id: 'call_abc' },
    ]);
    return buildPendingAction(payload, {
      streamId,
      conversationId: streamId,
      runId: 'run-1',
      responseMessageId: 'msg-1',
    });
  }

  // H1: round-18 captured discoveredTools but the metadata allowlists (updateMetadata,
  // Redis deserialize, buildJobFacade) dropped it, so resume replayed `undefined`.
  test('updateMetadata persists discoveredTools and the job facade exposes them', async () => {
    const streamId = 'stream-discovered';
    await manager.createJob(streamId, 'user-1');
    await manager.updateMetadata(streamId, { discoveredTools: ['deep_tool', 'other_tool'] });
    const job = await manager.getJob(streamId);
    expect(job?.metadata.discoveredTools).toEqual(['deep_tool', 'other_tool']);
  });

  // H4: a pause that lands AFTER the resume snapshot but before the subscription must
  // still reach the client. subscribeWithResume re-reads the live job and surfaces it.
  test('subscribeWithResume surfaces a pause that the resume snapshot missed', async () => {
    const streamId = 'stream-race';
    await manager.createJob(streamId, 'user-1');
    const action = buildAction(streamId);
    await manager.approvals.pause(streamId, action);

    // Simulate the snapshot being taken BEFORE the pause: drop pendingAction from the
    // resume state even though the live job is now requires_action.
    const realGetResumeState = manager.getResumeState.bind(manager);
    jest.spyOn(manager, 'getResumeState').mockImplementation(async (id: string) => {
      const state = await realGetResumeState(id);
      return state ? { ...state, pendingAction: undefined } : state;
    });

    const result = await manager.subscribeWithResume(streamId, () => {});
    const pending = result.pendingEvents.find(
      (e) => 'event' in e && e.event === 'on_pending_action',
    );
    expect(pending).toBeDefined();
    expect((pending as unknown as { data: { actionId: string } }).data.actionId).toBe(
      action.actionId,
    );
    result.subscription?.unsubscribe();
  });

  // H4 negative: when the snapshot already carried the action, the re-read is skipped
  // (the client gets it via resumeState.pendingAction) — no duplicate pending event.
  test('does not re-surface the pending action when the snapshot already carried it', async () => {
    const streamId = 'stream-norace';
    await manager.createJob(streamId, 'user-1');
    const action = buildAction(streamId);
    await manager.approvals.pause(streamId, action);

    const result = await manager.subscribeWithResume(streamId, () => {});
    const pendingCount = result.pendingEvents.filter(
      (e) => 'event' in e && e.event === 'on_pending_action',
    ).length;
    expect(pendingCount).toBe(0);
    expect(result.resumeState?.pendingAction?.actionId).toBe(action.actionId);
    result.subscription?.unsubscribe();
  });
});
