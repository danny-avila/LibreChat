import * as agentsSdk from '@librechat/agents';
import type {
  PostToolBatchHookInput,
  PostToolBatchHookOutput,
  PreemptBoundaryHookInput,
} from '@librechat/agents';
import type { SteerQueueItem } from '~/stream/interfaces/IJobStore';

/** The pinned SDK's hook output declares `injectedMessages` natively; a
 *  narrower local re-declaration would no longer be assignable from it. */
type SteerDrainOutput = PostToolBatchHookOutput;
import { InMemoryEventTransport } from '~/stream/implementations/InMemoryEventTransport';
import { InMemoryJobStore } from '~/stream/implementations/InMemoryJobStore';
import { GenerationJobManager } from '~/stream/GenerationJobManager';
import {
  createSteerDrainHook,
  createSteerPreemptBoundaryHook,
  createSteerPreemptPoll,
  isSteeringSupported,
  isSteerPreemptSupported,
} from '../runtime';

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

function boundaryInput(
  overrides: Partial<PreemptBoundaryHookInput> = {},
): PreemptBoundaryHookInput {
  return {
    hook_event_name: 'PreemptBoundary',
    runId: 'run-1',
    sealCount: 1,
    ...overrides,
  };
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

    const output = (await hook(batchInput(), abortSignal)) as SteerDrainOutput;
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

  it('restores the claimed steer and does not inject when durable apply fails', async () => {
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

    const output = (await hook(batchInput(), abortSignal)) as SteerDrainOutput;
    expect(output).toEqual({});
    expect((await GenerationJobManager.steering.peek(streamId)).map((item) => item.text)).toEqual([
      'survives',
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

    const output = (await hook(batchInput(), abortSignal)) as SteerDrainOutput;
    // buildMedia is consulted only for items that carry files.
    expect(buildMedia).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['apply:s1', 'apply:s2', 'media:s1']);
    expect(output.injectedMessages).toEqual([
      { role: 'user', content: media.content, source: 'steer' },
      { role: 'user', content: 'text only', source: 'steer' },
    ]);
  });

  it('merges quoted excerpts into text-only injections (media path merges its own)', async () => {
    const streamId = `drain-quotes-${Date.now()}`;
    const job = await GenerationJobManager.createJob(streamId, 'user-1', undefined, {
      initialMetadata: { steerQuotesCapable: true },
    });
    await GenerationJobManager.steering.enqueue(streamId, {
      ...buildSteer('s1', 'what does this mean?'),
      quotes: ['selected passage'],
    });

    const hook = createSteerDrainHook({
      streamId,
      jobCreatedAt: job.createdAt,
      applySteer: jest.fn(),
    });

    const output: SteerDrainOutput = await hook(batchInput(), abortSignal);
    expect(output.injectedMessages).toEqual([
      { role: 'user', content: '> selected passage\n\nwhat does this mean?', source: 'steer' },
    ]);
  });

  it('keeps quotes in the injection when media encoding degrades to text', async () => {
    const streamId = `drain-quotes-degrade-${Date.now()}`;
    const job = await GenerationJobManager.createJob(streamId, 'user-1', undefined, {
      initialMetadata: { steerQuotesCapable: true },
    });
    await GenerationJobManager.steering.enqueue(streamId, {
      ...buildSteer('s1', 'and the doc?'),
      files: [{ file_id: 'f1', type: 'image/png' }],
      quotes: ['quoted context'],
    });

    const hook = createSteerDrainHook({
      streamId,
      jobCreatedAt: job.createdAt,
      applySteer: jest.fn(),
      buildMedia: jest.fn(async () => {
        throw new Error('encode failed');
      }),
    });

    const output: SteerDrainOutput = await hook(batchInput(), abortSignal);
    expect(output.injectedMessages).toEqual([
      { role: 'user', content: '> quoted context\n\nand the doc?', source: 'steer' },
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

    const output = (await hook(batchInput(), abortSignal)) as SteerDrainOutput;
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

    const output = (await hook(batchInput(), abortSignal)) as SteerDrainOutput;
    expect(output.injectedMessages).toEqual([
      { role: 'user', content: 'words survive', source: 'steer' },
    ]);
  });
});

describe('isSteerPreemptSupported', () => {
  it('requires the preempt capability ON TOP of full steering support', () => {
    const sdk = agentsSdk as {
      HOOK_INJECTED_MESSAGES_CAPABLE?: boolean;
      HOOK_PREEMPT_BOUNDARY_CAPABLE?: boolean;
      ContentTypes?: { STEER?: string };
    };
    const expected = isSteeringSupported() && sdk.HOOK_PREEMPT_BOUNDARY_CAPABLE === true;
    expect(isSteerPreemptSupported()).toBe(expected);
  });
});

describe('createSteerPreemptBoundaryHook', () => {
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

  it('drains the same queue and emits the same shapes as the tool boundary', async () => {
    const streamId = `preempt-drain-${Date.now()}`;
    const job = await GenerationJobManager.createJob(streamId, 'user-1');
    await GenerationJobManager.steering.enqueue(streamId, buildSteer('s1', 'first'));
    await GenerationJobManager.steering.enqueue(streamId, buildSteer('s2', 'second'));

    const applied: string[] = [];
    const hook = createSteerPreemptBoundaryHook({
      streamId,
      jobCreatedAt: job.createdAt,
      applySteer: (item) => {
        applied.push(item.text);
      },
    });

    const output = (await hook(boundaryInput(), abortSignal)) as SteerDrainOutput;
    expect(applied).toEqual(['first', 'second']);
    expect(output.injectedMessages).toEqual([
      { role: 'user', content: 'first', source: 'steer' },
      { role: 'user', content: 'second', source: 'steer' },
    ]);
    expect(await GenerationJobManager.steering.peek(streamId)).toEqual([]);
  });

  it('returns empty output when the queue drained before the seal landed', async () => {
    const streamId = `preempt-empty-${Date.now()}`;
    await GenerationJobManager.createJob(streamId, 'user-1');
    const hook = createSteerPreemptBoundaryHook({ streamId, applySteer: jest.fn() });

    expect(await hook(boundaryInput(), abortSignal)).toEqual({});
  });

  it('never drains inside a subagent scope', async () => {
    const streamId = `preempt-subagent-${Date.now()}`;
    await GenerationJobManager.createJob(streamId, 'user-1');
    await GenerationJobManager.steering.enqueue(streamId, buildSteer('s1', 'kept'));

    const hook = createSteerPreemptBoundaryHook({ streamId, applySteer: jest.fn() });
    expect(await hook(boundaryInput({ agentId: 'child-agent' }), abortSignal)).toEqual({});
    expect((await GenerationJobManager.steering.peek(streamId)).map((s) => s.text)).toEqual([
      'kept',
    ]);
  });

  it('refuses to drain when the job was replaced', async () => {
    const streamId = `preempt-replaced-${Date.now()}`;
    const job = await GenerationJobManager.createJob(streamId, 'user-1');
    const hook = createSteerPreemptBoundaryHook({
      streamId,
      jobCreatedAt: job.createdAt - 1,
      applySteer: jest.fn(),
    });
    await GenerationJobManager.steering.enqueue(streamId, buildSteer('s1', 'new job steer'));

    expect(await hook(boundaryInput(), abortSignal)).toEqual({});
    expect((await GenerationJobManager.steering.peek(streamId)).map((s) => s.text)).toEqual([
      'new job steer',
    ]);
  });

  it('clears the armed preempt request after draining', async () => {
    const streamId = `preempt-clears-${Date.now()}`;
    const job = await GenerationJobManager.createJob(streamId, 'user-1');
    await GenerationJobManager.steering.enqueue(streamId, {
      ...buildSteer('s1', 'interrupt me'),
      preempt: true,
    });
    GenerationJobManager.requestPreempt(streamId, 's1', job.createdAt);
    expect(GenerationJobManager.isPreemptRequested(streamId)).toBe(true);

    const hook = createSteerPreemptBoundaryHook({
      streamId,
      jobCreatedAt: job.createdAt,
      applySteer: jest.fn(),
    });
    await hook(boundaryInput(), abortSignal);

    expect(GenerationJobManager.isPreemptRequested(streamId)).toBe(false);
  });

  /**
   * The shared drain body is what makes this true: a preempt satisfied at an
   * ordinary tool boundary must disarm there, or the request would seal a
   * later, unrelated stretch of generation with nothing left to inject.
   */
  it('a tool-boundary drain also clears a pending preempt request', async () => {
    const streamId = `preempt-tool-clears-${Date.now()}`;
    const job = await GenerationJobManager.createJob(streamId, 'user-1');
    await GenerationJobManager.steering.enqueue(streamId, {
      ...buildSteer('s1', 'interrupt me'),
      preempt: true,
    });
    GenerationJobManager.requestPreempt(streamId, 's1', job.createdAt);

    const hook = createSteerDrainHook({
      streamId,
      jobCreatedAt: job.createdAt,
      applySteer: jest.fn(),
    });
    await hook(batchInput(), abortSignal);

    expect(GenerationJobManager.isPreemptRequested(streamId)).toBe(false);
  });

  /**
   * The empty-boundary self-clear: a seal was spent, so anything still armed
   * points at a steer that already left the queue. Leaving it armed would
   * seal again on the next chunk and truncate an unrelated answer.
   */
  it('disarms the generation when the boundary drains nothing', async () => {
    const streamId = `preempt-empty-clears-${Date.now()}`;
    const job = await GenerationJobManager.createJob(streamId, 'user-1');
    GenerationJobManager.requestPreempt(streamId, 'orphaned', job.createdAt);
    expect(GenerationJobManager.isPreemptRequested(streamId)).toBe(true);

    const hook = createSteerPreemptBoundaryHook({
      streamId,
      jobCreatedAt: job.createdAt,
      applySteer: jest.fn(),
    });
    expect(await hook(boundaryInput(), abortSignal)).toEqual({});

    expect(GenerationJobManager.isPreemptRequested(streamId)).toBe(false);
  });

  /**
   * A cancel whose cross-replica clear was lost leaves a stale arm. If the
   * next boundary drains a DIFFERENT steer, clearing only the drained id
   * would leave the stale one level-triggered — it would immediately seal
   * the continuation meant to answer the steer just injected, landing on an
   * empty boundary as `preempt_incomplete`.
   */
  it('a nonempty drain also clears stale arms held since the snapshot', async () => {
    const streamId = `preempt-stale-snapshot-${Date.now()}`;
    const job = await GenerationJobManager.createJob(streamId, 'user-1');

    /** Stale: armed, but its steer never reaches the queue (cancelled). */
    await GenerationJobManager.requestPreempt(streamId, 'steer-cancelled', job.createdAt);
    /** Live: queued and armed, and this is what the boundary will drain. */
    await GenerationJobManager.steering.enqueue(streamId, {
      ...buildSteer('steer-live', 'interrupt me'),
      preempt: true,
    });
    await GenerationJobManager.requestPreempt(streamId, 'steer-live', job.createdAt);
    expect(GenerationJobManager.isPreemptRequested(streamId)).toBe(true);

    const hook = createSteerPreemptBoundaryHook({
      streamId,
      jobCreatedAt: job.createdAt,
      applySteer: jest.fn(),
    });
    const output = (await hook(boundaryInput(), abortSignal)) as SteerDrainOutput;

    expect(output.injectedMessages).toHaveLength(1);
    /** Both the drained id and the stale snapshot id are spent. */
    expect(GenerationJobManager.isPreemptRequested(streamId)).toBe(false);
  });

  /** An arm that lands AFTER the snapshot is backed by a live queue item. */
  it('a nonempty drain spares an arm that landed after the snapshot', async () => {
    const streamId = `preempt-post-snapshot-${Date.now()}`;
    const job = await GenerationJobManager.createJob(streamId, 'user-1');
    await GenerationJobManager.steering.enqueue(streamId, {
      ...buildSteer('steer-first', 'first'),
      preempt: true,
    });
    await GenerationJobManager.requestPreempt(streamId, 'steer-first', job.createdAt);

    const hook = createSteerPreemptBoundaryHook({
      streamId,
      jobCreatedAt: job.createdAt,
      applySteer: async () => {
        /** Arrives mid-drain, after the snapshot was taken. */
        await GenerationJobManager.requestPreempt(streamId, 'steer-later', job.createdAt);
      },
    });
    await hook(boundaryInput(), abortSignal);

    expect(GenerationJobManager.getArmedPreemptIds(streamId, job.createdAt)).toEqual([
      'steer-later',
    ]);
  });

  it('restores the item and keeps its preempt request armed when durable apply fails', async () => {
    const streamId = `preempt-clears-on-error-${Date.now()}`;
    const job = await GenerationJobManager.createJob(streamId, 'user-1');
    await GenerationJobManager.steering.enqueue(streamId, {
      ...buildSteer('s1', 'still injected'),
      preempt: true,
    });
    GenerationJobManager.requestPreempt(streamId, 's1', job.createdAt);

    const hook = createSteerPreemptBoundaryHook({
      streamId,
      jobCreatedAt: job.createdAt,
      applySteer: () => {
        throw new Error('emit failed');
      },
    });

    const output = (await hook(boundaryInput(), abortSignal)) as SteerDrainOutput;
    expect(output).toEqual({});
    expect((await GenerationJobManager.steering.peek(streamId)).map((item) => item.text)).toEqual([
      'still injected',
    ]);
    expect(GenerationJobManager.isPreemptRequested(streamId)).toBe(true);
  });
});

describe('createSteerPreemptPoll', () => {
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

  /**
   * The SDK contract requires a LEVEL-triggered predicate: it may be polled
   * many times before a chunk is safe to seal, and a self-clearing read would
   * silently lose the request on the first unsafe chunk.
   */
  it('keeps returning true until the request is cleared', async () => {
    const streamId = `preempt-poll-${Date.now()}`;
    const job = await GenerationJobManager.createJob(streamId, 'user-1');
    const { shouldPreempt } = createSteerPreemptPoll(streamId);

    expect(shouldPreempt()).toBe(false);
    GenerationJobManager.requestPreempt(streamId, 's1', job.createdAt);
    expect(shouldPreempt()).toBe(true);
    expect(shouldPreempt()).toBe(true);
    expect(shouldPreempt()).toBe(true);

    GenerationJobManager.noteSteersRemoved(streamId, ['s1'], job.createdAt);
    expect(shouldPreempt()).toBe(false);
  });

  it('is false for a stream with no live generation', () => {
    expect(createSteerPreemptPoll('no-such-stream').shouldPreempt()).toBe(false);
  });
});
