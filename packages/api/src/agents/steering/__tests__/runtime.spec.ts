import * as agentsSdk from '@librechat/agents';
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
  it('mirrors the installed SDK capability flag AND replay support', () => {
    // CI runs against the published SDK pin (possibly pre-injectedMessages);
    // local dev may run against a capability-bearing build. The probe must
    // track BOTH halves of the contract exactly in every world — false means
    // the steer route 501s and createRun skips the drain wiring. Requiring
    // ContentTypes.STEER guards the release window where injection shipped
    // without the formatAgentMessages replay branch: creating steer parts
    // there would leak them into provider-facing assistant content.
    const sdk = agentsSdk as {
      HOOK_INJECTED_MESSAGES_CAPABLE?: boolean;
      ContentTypes?: { STEER?: string };
    };
    const capable =
      sdk.HOOK_INJECTED_MESSAGES_CAPABLE === true && sdk.ContentTypes?.STEER === 'steer';
    expect(isSteeringSupported()).toBe(capable);
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

  it('injects encoded media content for steers that carry files', async () => {
    const streamId = `drain-media-${Date.now()}`;
    const job = await GenerationJobManager.createJob(streamId, 'user-1');
    const files = [{ file_id: 'f1', type: 'image/png' }];
    await GenerationJobManager.steering.enqueue(streamId, {
      ...buildSteer('s1', 'see image'),
      files,
    });
    await GenerationJobManager.steering.enqueue(streamId, buildSteer('s2', 'text only'));

    const media = {
      content: [
        { type: 'text', text: 'see image' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,x', detail: 'auto' } },
      ],
      files,
    };
    const calls: string[] = [];
    const buildMedia = jest.fn(async (item: SteerQueueItem) => {
      calls.push(`media:${item.steerId}`);
      return media;
    });
    const hook = createSteerDrainHook({
      streamId,
      jobCreatedAt: job.createdAt,
      applySteer: (item) => {
        calls.push(`apply:${item.steerId}`);
      },
      buildMedia,
    });

    const output: SteerDrainOutput = await hook(batchInput(), abortSignal);
    // buildMedia is consulted only for items that carry files.
    expect(buildMedia).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['apply:s1', 'media:s1', 'apply:s2']);
    expect(output.injectedMessages).toEqual([
      { role: 'user', content: media.content, source: 'steer' },
      { role: 'user', content: 'text only', source: 'steer' },
    ]);
  });

  it('persists the steer part BEFORE media encoding (abort-safe ordering)', async () => {
    const streamId = `drain-apply-first-${Date.now()}`;
    const job = await GenerationJobManager.createJob(streamId, 'user-1');
    await GenerationJobManager.steering.enqueue(streamId, {
      ...buildSteer('s1', 'must land first'),
      files: [{ file_id: 'f1' }],
    });

    // Simulates an abort mid-encode: the part must already be applied.
    let appliedBeforeEncode = false;
    let partApplied = false;
    const hook = createSteerDrainHook({
      streamId,
      jobCreatedAt: job.createdAt,
      applySteer: () => {
        partApplied = true;
      },
      buildMedia: async () => {
        appliedBeforeEncode = partApplied;
        throw new Error('aborted mid-encode');
      },
    });

    const output: SteerDrainOutput = await hook(batchInput(), abortSignal);
    expect(appliedBeforeEncode).toBe(true);
    expect(output.injectedMessages).toEqual([
      { role: 'user', content: 'must land first', source: 'steer' },
    ]);
  });

  it('degrades to text-only injection when media encoding fails', async () => {
    const streamId = `drain-media-error-${Date.now()}`;
    const job = await GenerationJobManager.createJob(streamId, 'user-1');
    await GenerationJobManager.steering.enqueue(streamId, {
      ...buildSteer('s1', 'words survive'),
      files: [{ file_id: 'f-gone' }],
    });

    const hook = createSteerDrainHook({
      streamId,
      jobCreatedAt: job.createdAt,
      applySteer: jest.fn(),
      buildMedia: async () => {
        throw new Error('encode failed');
      },
    });

    const output: SteerDrainOutput = await hook(batchInput(), abortSignal);
    expect(output.injectedMessages).toEqual([
      { role: 'user', content: 'words survive', source: 'steer' },
    ]);
  });
});
