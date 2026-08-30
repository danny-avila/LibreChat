import type { GenerationJobManagerClass } from '~/stream';
import { enrollAgentExecution, AgentExecutionAdmissionError } from './lifecycle';
import { InMemoryEventTransport } from '~/stream/implementations/InMemoryEventTransport';
import { InMemoryJobStore } from '~/stream/implementations/InMemoryJobStore';
import { GenerationJobManagerClass as JobManager } from '~/stream';

function createManager(): GenerationJobManagerClass {
  const manager = new JobManager();
  manager.configure({
    jobStore: new InMemoryJobStore({ ttlAfterComplete: 60_000 }),
    eventTransport: new InMemoryEventTransport(),
    cleanupOnComplete: false,
  });
  manager.initialize();
  return manager;
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function enrollmentParams(runId: string, conversationId = 'conversation-1') {
  return {
    runId,
    userId: 'user-1',
    conversationId,
    agentId: 'agent-1',
    protocol: 'chat.completions' as const,
    isPrincipalActive: jest.fn().mockResolvedValue(true),
  };
}

describe('Agent execution enrollment', () => {
  let manager: GenerationJobManagerClass;

  beforeEach(() => {
    manager = createManager();
  });

  afterEach(async () => {
    await manager.destroy();
  });

  it('registers a cleanup-blocking run before provider execution', async () => {
    const enrollment = await enrollAgentExecution(enrollmentParams('chatcmpl-1'), { manager });

    await expect(manager.getCleanupBlockingJobIdsForUser('user-1')).resolves.toEqual([
      'chatcmpl-1',
    ]);
    await expect(manager.getJobStore().getJob('chatcmpl-1')).resolves.toMatchObject({
      userId: 'user-1',
      conversationId: 'conversation-1',
      status: 'running',
      providerDrained: true,
      agent_id: 'agent-1',
      endpoint: 'chat.completions',
    });
    expect(enrollment.signal.aborted).toBe(false);
  });

  it('retires a run when account deletion wins the post-registration recheck', async () => {
    const beginProviderExecution = jest.spyOn(manager, 'beginProviderExecution');

    await expect(
      enrollAgentExecution(
        {
          ...enrollmentParams('chatcmpl-deleting'),
          isPrincipalActive: jest.fn().mockResolvedValue(false),
        },
        { manager },
      ),
    ).rejects.toMatchObject<Partial<AgentExecutionAdmissionError>>({
      code: 'ACCOUNT_DELETION_IN_PROGRESS',
      status: 409,
    });

    expect(beginProviderExecution).not.toHaveBeenCalled();
    await expect(manager.getCleanupBlockingJobIdsForUser('user-1')).resolves.toEqual([]);
    await expect(manager.getJobStore().getJob('chatcmpl-deleting')).resolves.toMatchObject({
      status: 'error',
      providerDrained: true,
    });
  });

  it('keeps terminal work cleanup-blocking until every tracked write settles', async () => {
    const enrollment = await enrollAgentExecution(enrollmentParams('chatcmpl-tail'), { manager });
    const tail = deferred<void>();
    enrollment.track(tail.promise);
    await enrollment.beginProviderExecution();

    const settlement = enrollment.settle();
    await new Promise<void>((resolve) => setImmediate(resolve));

    await expect(manager.getJobStore().getJob('chatcmpl-tail')).resolves.toMatchObject({
      status: 'complete',
      providerDrained: false,
    });
    await expect(manager.getCleanupBlockingJobIdsForUser('user-1')).resolves.toEqual([
      'chatcmpl-tail',
    ]);

    tail.resolve();
    await settlement;

    await expect(manager.getJobStore().getJob('chatcmpl-tail')).resolves.toMatchObject({
      status: 'complete',
      providerDrained: true,
    });
    await expect(manager.getCleanupBlockingJobIdsForUser('user-1')).resolves.toEqual([]);
  });

  it('lets destructive cleanup abort the canonical signal and wait for trailing writes', async () => {
    const enrollment = await enrollAgentExecution(enrollmentParams('resp-delete'), { manager });
    const tail = deferred<void>();
    enrollment.track(tail.promise);
    await enrollment.beginProviderExecution();

    const abort = manager.abortJob('resp-delete', { awaitProviderDrain: true });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(enrollment.signal.aborted).toBe(true);

    let abortSettled = false;
    void abort.then(() => {
      abortSettled = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(abortSettled).toBe(false);

    const settlement = enrollment.settle(new Error('aborted'));
    tail.resolve();
    await settlement;
    await expect(abort).resolves.toMatchObject({ success: true });
  });

  it('keeps concurrent remote runs on one conversation independently enrolled', async () => {
    await Promise.all([
      enrollAgentExecution(enrollmentParams('chatcmpl-a', 'conversation-shared'), { manager }),
      enrollAgentExecution(enrollmentParams('chatcmpl-b', 'conversation-shared'), { manager }),
    ]);

    await expect(manager.getCleanupBlockingJobIdsForUser('user-1')).resolves.toEqual(
      expect.arrayContaining(['chatcmpl-a', 'chatcmpl-b']),
    );
  });
});
