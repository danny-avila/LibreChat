import type { Agents } from 'librechat-data-provider';
import { InMemoryEventTransport } from '~/stream/implementations/InMemoryEventTransport';
import { InMemoryJobStore } from '~/stream/implementations/InMemoryJobStore';
import { GenerationJobManagerClass } from '~/stream/GenerationJobManager';
import { buildPendingAction } from '~/agents/hitl/policy';

jest.spyOn(console, 'log').mockImplementation();

describe('GenerationJobManager pending-action lifecycle (in-memory)', () => {
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
    const action = buildPendingAction({
      streamId,
      conversationId: streamId,
      runId: 'run-1',
      responseMessageId: 'msg-1',
      toolCalls: [{ name: 'shell', arguments: { command: 'ls' }, tool_call_id: 'call_abc' }],
    });
    return { ...action, ...overrides };
  }

  test('markRequiresAction persists the pending action and transitions status', async () => {
    const streamId = 'stream-mark';
    await manager.createJob(streamId, 'user-1');

    const action = buildAction(streamId);
    await manager.markRequiresAction(streamId, action);

    const status = await manager.getJobStatus(streamId);
    expect(status).toBe('requires_action');

    const pending = await manager.getPendingAction(streamId);
    expect(pending).not.toBeNull();
    expect(pending?.actionId).toBe(action.actionId);
    expect(pending?.payload.action_requests[0].name).toBe('shell');
  });

  test('getPendingAction returns null for jobs not in requires_action', async () => {
    const streamId = 'stream-running';
    await manager.createJob(streamId, 'user-1');
    expect(await manager.getPendingAction(streamId)).toBeNull();
  });

  test('getPendingAction returns null when the job does not exist', async () => {
    expect(await manager.getPendingAction('nonexistent')).toBeNull();
  });

  test('clearPendingAction returns the job to running and removes the pending record', async () => {
    const streamId = 'stream-clear';
    await manager.createJob(streamId, 'user-1');

    await manager.markRequiresAction(streamId, buildAction(streamId));
    expect(await manager.getJobStatus(streamId)).toBe('requires_action');

    await manager.clearPendingAction(streamId);

    expect(await manager.getJobStatus(streamId)).toBe('running');
    expect(await manager.getPendingAction(streamId)).toBeNull();
  });

  test('requires_action drops the running count but keeps the user-active set', async () => {
    const streamId = 'stream-counts';
    await manager.createJob(streamId, 'user-counts');

    const beforeCounts = await manager.getJobCountByStatus();
    expect(beforeCounts.running).toBe(1);
    expect(beforeCounts.requires_action).toBe(0);

    await manager.markRequiresAction(streamId, buildAction(streamId));

    const afterCounts = await manager.getJobCountByStatus();
    expect(afterCounts.running).toBe(0);
    expect(afterCounts.requires_action).toBe(1);

    // Pending-approval jobs still occupy the user's conversation slot.
    const active = await manager.getActiveJobIdsForUser('user-counts');
    expect(active).toContain(streamId);
  });

  test('getActiveJobIdsForUser excludes terminal jobs but includes requires_action', async () => {
    await manager.createJob('s-running', 'user-mix');
    await manager.createJob('s-paused', 'user-mix');
    await manager.createJob('s-done', 'user-mix');

    await manager.markRequiresAction('s-paused', buildAction('s-paused'));
    await manager.completeJob('s-done');

    const active = await manager.getActiveJobIdsForUser('user-mix');
    expect(active.sort()).toEqual(['s-paused', 's-running']);
  });
});
