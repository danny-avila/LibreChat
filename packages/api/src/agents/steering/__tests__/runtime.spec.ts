import type { PostToolBatchHookInput, PostToolBatchHookOutput } from '@librechat/agents';
import type { SteerQueueItem } from '~/stream/interfaces/IJobStore';

/** Mirrors runtime.ts's local extension — the field predates the SDK pin bump. */
type SteerDrainOutput = PostToolBatchHookOutput & {
  injectedMessages?: Array<{ role: string; content: string; source: string }>;
};
import { InMemoryEventTransport } from '~/stream/implementations/InMemoryEventTransport';
import { InMemoryJobStore } from '~/stream/implementations/InMemoryJobStore';
import { GenerationJobManager } from '~/stream/GenerationJobManager';
import { createSteerDrainHook, isSteeringSupported } from '../runtime';

jest.spyOn(console, 'log').mockImplementation();

const abortSignal = new AbortController().signal;

function batchInput(overrides: Partial<PostToolBatchHookInput> = {}): PostToolBatchHookInput {
  return {
    hook_event_name: 'PostToolBatch',
    runId: 'run-1',
    entries: [],
    ...overrides,
  };
}

function buildSteer(steerId: string, text: string): SteerQueueItem {
  return { steerId, text, userId: 'user-1', createdAt: Date.now() };
}

describe('isSteeringSupported', () => {
  it('is true against the injectedMessages-capable SDK', () => {
    expect(isSteeringSupported()).toBe(true);
  });
});

describe('createSteerDrainHook', () => {
  beforeEach(() => {
    GenerationJobManager.configure({
      jobStore: new InMemoryJobStore({ ttlAfterComplete: 60000 }),
      eventTransport: new InMemoryEventTransport(),
      isRedis: false,
      cleanupOnComplete: false,
    });
    GenerationJobManager.initialize();
  });

  afterEach(async () => {
    await GenerationJobManager.destroy();
  });

  it('drains FIFO, applies each steer, and returns per-message injectedMessages', async () => {
    const streamId = `drain-${Date.now()}`;
    const job = await GenerationJobManager.createJob(streamId, 'user-1');
    await GenerationJobManager.steering.enqueue(streamId, buildSteer('s1', 'first'));
    await GenerationJobManager.steering.enqueue(streamId, buildSteer('s2', 'second'));

    const applied: string[] = [];
    const hook = createSteerDrainHook({
      streamId,
      jobCreatedAt: job.createdAt,
      applySteer: (item) => {
        applied.push(item.text);
      },
    });

    const output: SteerDrainOutput = await hook(batchInput(), abortSignal);
    expect(applied).toEqual(['first', 'second']);
    expect(output.injectedMessages).toEqual([
      { role: 'user', content: 'first', source: 'steer' },
      { role: 'user', content: 'second', source: 'steer' },
    ]);
    expect(await GenerationJobManager.steering.peek(streamId)).toEqual([]);
  });

  it('returns empty output when the queue is empty', async () => {
    const streamId = `drain-empty-${Date.now()}`;
    await GenerationJobManager.createJob(streamId, 'user-1');
    const hook = createSteerDrainHook({ streamId, applySteer: jest.fn() });

    expect(await hook(batchInput(), abortSignal)).toEqual({});
  });

  it('never drains inside a subagent scope', async () => {
    const streamId = `drain-subagent-${Date.now()}`;
    await GenerationJobManager.createJob(streamId, 'user-1');
    await GenerationJobManager.steering.enqueue(streamId, buildSteer('s1', 'kept'));

    const hook = createSteerDrainHook({ streamId, applySteer: jest.fn() });
    expect(await hook(batchInput({ agentId: 'child-agent' }), abortSignal)).toEqual({});
    expect((await GenerationJobManager.steering.peek(streamId)).map((s) => s.text)).toEqual([
      'kept',
    ]);
  });

  it('refuses to drain when the job was replaced', async () => {
    const streamId = `drain-replaced-${Date.now()}`;
    const job = await GenerationJobManager.createJob(streamId, 'user-1');
    const hook = createSteerDrainHook({
      streamId,
      jobCreatedAt: job.createdAt - 1,
      applySteer: jest.fn(),
    });
    await GenerationJobManager.steering.enqueue(streamId, buildSteer('s1', 'new job steer'));

    expect(await hook(batchInput(), abortSignal)).toEqual({});
    expect((await GenerationJobManager.steering.peek(streamId)).map((s) => s.text)).toEqual([
      'new job steer',
    ]);
  });

  it('still injects when applySteer throws', async () => {
    const streamId = `drain-apply-error-${Date.now()}`;
    const job = await GenerationJobManager.createJob(streamId, 'user-1');
    await GenerationJobManager.steering.enqueue(streamId, buildSteer('s1', 'survives'));

    const hook = createSteerDrainHook({
      streamId,
      jobCreatedAt: job.createdAt,
      applySteer: () => {
        throw new Error('emit failed');
      },
    });

    const output: SteerDrainOutput = await hook(batchInput(), abortSignal);
    expect(output.injectedMessages).toEqual([
      { role: 'user', content: 'survives', source: 'steer' },
    ]);
  });
});
