import { ContentTypes } from 'librechat-data-provider';
import type { StandardGraph } from '@librechat/agents';
import type { Agents } from 'librechat-data-provider';
import type { AbortResult } from '../interfaces/IJobStore';
import type { ServerSentEvent } from '~/types';
import {
  GenerationJobManagerClass,
  TERMINAL_PUBLICATION_RECONNECT_ERROR,
} from '~/stream/GenerationJobManager';
import { InMemoryEventTransport } from '~/stream/implementations/InMemoryEventTransport';
import { InMemoryJobStore } from '~/stream/implementations/InMemoryJobStore';

jest.spyOn(console, 'log').mockImplementation();

function createInMemoryManager(): GenerationJobManagerClass {
  return createManagerWithStore(new InMemoryJobStore({ ttlAfterComplete: 60000 }));
}

function createManagerWithStore(store: InMemoryJobStore): GenerationJobManagerClass {
  const manager = new GenerationJobManagerClass();
  manager.configure({
    jobStore: store,
    eventTransport: new InMemoryEventTransport(),
    isRedis: false,
  });
  manager.initialize();
  return manager;
}

class SnapshotReplayJobStore extends InMemoryJobStore {
  async getJob(streamId: string) {
    const job = await super.getJob(streamId);
    return job ? { ...job } : null;
  }

  async updateJob(streamId: string, updates: Parameters<InMemoryJobStore['updateJob']>[1]) {
    if (updates.replayEvents) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await super.updateJob(streamId, updates);
  }
}

class PartialRunStepJobStore extends InMemoryJobStore {
  private persistedRunSteps: Agents.RunStep[] = [];

  setPersistedRunSteps(runSteps: Agents.RunStep[]): void {
    this.persistedRunSteps = runSteps;
  }

  async getRunSteps(): Promise<Agents.RunStep[]> {
    return this.persistedRunSteps;
  }
}

function createSnapshotReplayManager(): GenerationJobManagerClass {
  const manager = new GenerationJobManagerClass();
  manager.configure({
    jobStore: new SnapshotReplayJobStore({ ttlAfterComplete: 60000 }),
    eventTransport: new InMemoryEventTransport(),
    isRedis: false,
  });
  manager.initialize();
  return manager;
}

describe('GenerationJobManager resume replay events', () => {
  let manager: GenerationJobManagerClass | undefined;

  afterEach(async () => {
    await manager?.destroy();
    manager = undefined;
  });

  test('projects regeneration ownership into resume state', async () => {
    manager = createInMemoryManager();
    const streamId = `regenerate-resume-${Date.now()}`;
    await manager.createJob(streamId, 'user-1', streamId, {
      initialMetadata: {
        responseMessageId: 'edited-response',
        isRegenerate: true,
      },
    });

    await expect(manager.getResumeState(streamId)).resolves.toMatchObject({
      responseMessageId: 'edited-response',
      isRegenerate: true,
    });
  });

  test('withholds an edited generation snapshot until its retained content is captured', async () => {
    manager = createInMemoryManager();
    const streamId = `pending-retained-content-${Date.now()}`;
    const job = await manager.createJob(streamId, 'user-1', streamId, {
      initialMetadata: {
        responseMessageId: 'edited-response',
        isRegenerate: true,
        retainedContentPending: true,
      },
    });

    await expect(manager.getResumeState(streamId, job.createdAt)).resolves.toBeNull();
  });

  test('reconnects an early resume instead of activating it without a retained snapshot', async () => {
    manager = createInMemoryManager();
    const streamId = 'early-retained-subscription';
    const job = await manager.createJob(streamId, 'user-1', streamId, {
      initialMetadata: { retainedContentPending: true, responseMessageId: 'edited-response' },
    });
    const onChunk = jest.fn();
    const onError = jest.fn();
    const early = await manager.subscribeWithResume(streamId, onChunk, undefined, onError, {
      expectedCreatedAt: job.createdAt,
    });
    expect(early.subscription).toBeNull();
    expect(onError).toHaveBeenCalledWith(TERMINAL_PUBLICATION_RECONNECT_ERROR);

    const retained = [{ type: 'text', text: 'Retained' }];
    await manager.captureRetainedContent(streamId, retained, ContentTypes.TEXT, job.createdAt);
    retained[0].text = 'Mutated source';
    const resumed = await manager.subscribeWithResume(streamId, onChunk, undefined, onError, {
      expectedCreatedAt: job.createdAt,
    });
    expect(resumed.resumeState?.retainedContent?.parts).toEqual([
      { type: 'text', text: 'Retained' },
    ]);
    expect(resumed.subscription).not.toBeNull();
    resumed.subscription?.activate();
    await manager.emitChunk(streamId, { event: 'test-live', data: { value: 'suffix' } });
    expect(onChunk).toHaveBeenCalledWith({ event: 'test-live', data: { value: 'suffix' } });
    resumed.subscription?.unsubscribe();
  });

  test('does not capture an old generation prefix into its replacement', async () => {
    manager = createInMemoryManager();
    const streamId = 'replaced-retained-capture';
    const first = await manager.createJob(streamId, 'user-1', streamId);
    const replacement = await manager.createJob(streamId, 'user-1', streamId, {
      initialMetadata: { retainedContentPending: true },
    });
    await manager.captureRetainedContent(
      streamId,
      [{ type: 'text', text: 'Old prefix' }],
      ContentTypes.TEXT,
      first.createdAt,
    );
    expect(await manager.getJobStore().getJob(streamId)).toMatchObject({
      createdAt: replacement.createdAt,
      retainedContentPending: true,
    });
    expect((await manager.getJobStore().getJob(streamId))?.retainedContent).toBeUndefined();
  });

  test('returns captured retained content beside completion-local generation content', async () => {
    manager = createInMemoryManager();
    const streamId = `retained-content-${Date.now()}`;
    const job = await manager.createJob(streamId, 'user-1', streamId, {
      initialMetadata: {
        responseMessageId: 'edited-response',
        isRegenerate: true,
        retainedContentPending: true,
      },
    });
    const retainedContent = [{ type: 'text', text: 'Edited prefix' }];
    const generatedContent = [{ type: 'text', text: ' generated suffix' }];

    manager.setContentParts(streamId, generatedContent, job.createdAt);
    await manager.captureRetainedContent(
      streamId,
      retainedContent,
      ContentTypes.TEXT,
      job.createdAt,
    );

    await expect(manager.getResumeState(streamId, job.createdAt)).resolves.toMatchObject({
      aggregatedContent: generatedContent,
      retainedContent: {
        parts: retainedContent,
        type: 'text',
      },
    });
  });

  test.each([false, true])(
    'persists the complete edited abort before its replayable FINAL (save failure=%s)',
    async (saveFails) => {
      manager = new GenerationJobManagerClass({
        jobStore: new InMemoryJobStore({ ttlAfterComplete: 60_000 }),
        eventTransport: new InMemoryEventTransport(),
        cleanupOnComplete: false,
      });
      manager.initialize();
      const streamId = `retained-abort-${saveFails}`;
      const job = await manager.createJob(streamId, 'user-1', streamId, {
        initialMetadata: {
          responseMessageId: 'edited-response',
          userMessage: { messageId: 'user-message', text: 'Question' },
          retainedContentPending: true,
        },
      });
      await manager.captureRetainedContent(
        streamId,
        [{ type: 'text', text: 'Prefix' }],
        ContentTypes.TEXT,
        job.createdAt,
        {
          userSubmittedPaths: ['/content/0/text'],
        },
      );
      const generated = [{ type: 'text', text: ' suffix' }];
      manager.setContentParts(streamId, generated, job.createdAt);
      const beforePublish = jest.fn(async (result: AbortResult) => {
        expect(result.content).toEqual([{ type: 'text', text: 'Prefix suffix' }]);
        expect(result.userSubmittedPaths).toEqual(['/content/0/text']);
        expect(result.finalEvent).toMatchObject({ responseMessage: { content: result.content } });
        if (saveFails) {
          throw new Error('Database unavailable');
        }
      });
      const result = await manager.abortJob(streamId, {
        expectedCreatedAt: job.createdAt,
        beforePublish,
      });
      expect(beforePublish).toHaveBeenCalledTimes(1);
      expect(generated).toEqual([{ type: 'text', text: ' suffix' }]);
      expect(await manager.getJobStore().getJob(streamId)).toMatchObject({
        status: 'aborted',
        finalEvent: JSON.stringify(result.finalEvent),
      });
      const onDone = jest.fn();
      const onError = jest.fn();
      const resumed = await manager.subscribeWithResume(streamId, jest.fn(), onDone, onError, {
        expectedCreatedAt: job.createdAt,
      });
      expect(resumed.subscription).not.toBeNull();
      resumed.subscription?.activate();
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(onError).not.toHaveBeenCalled();
      expect(onDone).toHaveBeenCalledWith(result.finalEvent);
      if (saveFails) {
        expect(result.finalEvent).toMatchObject({ final: true, reconcile: true });
      } else {
        expect(result.finalEvent).toMatchObject({
          responseMessage: { content: [{ type: 'text', text: 'Prefix suffix' }] },
        });
      }
      resumed.subscription?.unsubscribe();
    },
  );

  test('includes OAuth run step and delta replay events in resume state', async () => {
    manager = createInMemoryManager();
    const streamId = `oauth-delta-resume-${Date.now()}`;
    const expiresAt = Date.now() + 60_000;
    await manager.createJob(streamId, 'user-1', streamId);

    const runStepEvent = {
      event: 'on_run_step',
      data: {
        id: 'step-oauth',
        runId: 'USE_PRELIM_RESPONSE_MESSAGE_ID',
        index: 0,
        stepDetails: {
          type: 'tool_calls',
          tool_calls: [{ id: 'call-oauth', name: 'oauth_mcp_Google-Workspace', args: '' }],
        },
      },
    } satisfies ServerSentEvent;
    const authEvent = {
      event: 'on_run_step_delta',
      data: {
        id: 'step-oauth',
        delta: {
          type: 'tool_calls',
          tool_calls: [{ name: 'oauth_mcp_Google-Workspace', args: '' }],
          auth: 'https://auth.example.com/oauth',
          expires_at: expiresAt,
        },
      },
    } satisfies ServerSentEvent;

    await manager.emitChunk(streamId, runStepEvent);
    await manager.emitChunk(streamId, authEvent);
    await manager.emitChunk(streamId, {
      event: 'on_run_step',
      data: {
        id: 'step-regular',
        runId: 'response-1',
        index: 1,
        stepDetails: {
          type: 'tool_calls',
          tool_calls: [{ id: 'call-regular', name: 'regular-tool', args: '{}' }],
        },
      },
    });
    await manager.emitChunk(streamId, {
      event: 'on_run_step_delta',
      data: {
        id: 'step-no-auth',
        delta: {
          type: 'tool_calls',
          tool_calls: [{ name: 'regular-tool', args: '{}' }],
        },
      },
    });

    const resumeState = await manager.getResumeState(streamId);

    expect(resumeState?.replayEvents).toEqual([runStepEvent, authEvent]);
    expect(resumeState?.pendingOAuthPrompts).toEqual([
      {
        stepId: 'step-oauth',
        runId: 'USE_PRELIM_RESPONSE_MESSAGE_ID',
        index: 0,
        toolCallId: 'call-oauth',
        toolName: 'oauth_mcp_Google-Workspace',
        authURL: 'https://auth.example.com/oauth',
        expiresAt,
      },
    ]);

    await manager.emitChunk(streamId, {
      event: 'on_run_step_completed',
      data: {
        result: {
          id: 'step-oauth',
          index: 0,
          tool_call: {
            id: 'call-oauth',
            name: 'oauth_mcp_Google-Workspace',
            output: 'OAuth authentication completed',
          },
        },
      },
    });

    await expect(manager.getResumeState(streamId)).resolves.toMatchObject({
      pendingOAuthPrompts: undefined,
    });
  });

  test('retains emitted run steps when the live graph is unavailable during resume', async () => {
    manager = createInMemoryManager();
    const streamId = `run-step-resume-${Date.now()}`;
    await manager.createJob(streamId, 'user-1', streamId);

    const runStep = {
      id: 'step-approval',
      runId: 'response-1',
      index: 1,
      stepDetails: {
        type: 'tool_calls',
        tool_calls: [{ id: 'call-approval', name: 'approval_probe', args: '{}' }],
      },
    };

    await manager.emitChunk(streamId, {
      event: 'on_run_step',
      data: runStep,
    });

    const resumeState = await manager.getResumeState(streamId);

    expect(resumeState?.runSteps).toEqual([runStep]);
  });

  test('applies retained ask answers to reconnect snapshots', async () => {
    const store = new InMemoryJobStore({ ttlAfterComplete: 60000 });
    manager = createManagerWithStore(store);
    const streamId = `ask-answer-resume-${Date.now()}`;
    const job = await manager.createJob(streamId, 'user-1', streamId);
    manager.setContentParts(streamId, [
      {
        type: 'tool_call',
        tool_call: { id: 'ask-1', name: 'ask_user_question', args: '' },
      },
    ]);
    await store.updateJob(
      streamId,
      {
        resolvedAskUserQuestions: [
          { request: { question: 'Which env?' }, output: 'staging', toolCallId: 'ask-1' },
        ],
      },
      job.createdAt,
    );

    const resumeState = await manager.getResumeState(streamId);

    expect(resumeState?.aggregatedContent).toEqual([
      {
        type: 'tool_call',
        tool_call: {
          id: 'ask-1',
          name: 'ask_user_question',
          args: JSON.stringify({ question: 'Which env?' }),
          output: 'staging',
          progress: 1,
        },
      },
    ]);
  });

  test('does not return a stale pending action with a newly resolved answer', async () => {
    const store = new InMemoryJobStore({ ttlAfterComplete: 60000 });
    manager = createManagerWithStore(store);
    const streamId = `ask-answer-lifecycle-resume-${Date.now()}`;
    const job = await manager.createJob(streamId, 'user-1', streamId);
    manager.setContentParts(streamId, [
      {
        type: 'tool_call',
        tool_call: { id: 'ask-1', name: 'ask_user_question', args: '' },
      },
    ]);
    await store.updateJob(
      streamId,
      {
        status: 'running',
        resolvedAskUserQuestions: [
          { request: { question: 'Which env?' }, output: 'staging', toolCallId: 'ask-1' },
        ],
      },
      job.createdAt,
    );
    const getJob = store.getJob.bind(store);
    jest.spyOn(store, 'getJob').mockImplementationOnce(async (...args) => {
      const current = await getJob(...args);
      if (current == null) {
        return null;
      }
      return {
        ...current,
        status: 'requires_action',
        pendingAction: {
          actionId: 'stale-action',
          streamId,
          createdAt: Date.now(),
          payload: { type: 'ask_user_question', question: { question: 'Which env?' } },
        },
      };
    });

    const resumeState = await manager.getResumeState(streamId);

    expect(resumeState?.aggregatedContent?.[0]).toMatchObject({
      tool_call: { output: 'staging' },
    });
    expect(resumeState?.pendingAction).toBeUndefined();
  });

  test('realigns a stale run-step index to the aggregated tool card by tool-call id', async () => {
    manager = createInMemoryManager();
    const streamId = `run-step-index-resume-${Date.now()}`;
    await manager.createJob(streamId, 'user-1', streamId);
    manager.setContentParts(streamId, [
      { type: 'text', text: 'Prepended content' },
      {
        type: 'tool_call',
        tool_call: {
          id: 'call-shifted',
          name: 'approval_probe',
          args: '{"value":"shifted"}',
        },
      },
    ]);

    const staleRunStep = {
      id: 'step-shifted',
      runId: 'response-1',
      index: 0,
      stepDetails: {
        type: 'tool_calls',
        tool_calls: [{ id: 'call-shifted', name: 'approval_probe', args: '{}' }],
      },
    };
    await manager.emitChunk(streamId, {
      event: 'on_run_step',
      data: staleRunStep,
    });

    const resumeState = await manager.getResumeState(streamId);

    expect(staleRunStep.index).toBe(0);
    expect(resumeState?.runSteps).toEqual([{ ...staleRunStep, index: 1 }]);
  });

  test('realigns the persisted OAuth start replay with its normalized run-step index', async () => {
    manager = createInMemoryManager();
    const streamId = `oauth-index-resume-${Date.now()}`;
    await manager.createJob(streamId, 'user-1', streamId);
    manager.setContentParts(streamId, [
      { type: 'text', text: 'Prepended content' },
      {
        type: 'tool_call',
        tool_call: {
          id: 'call-oauth-shifted',
          name: 'oauth_mcp_Google-Workspace',
          args: '',
        },
      },
    ]);
    const staleReplayEvent = {
      event: 'on_run_step',
      data: {
        id: 'step-oauth-shifted',
        runId: 'USE_PRELIM_RESPONSE_MESSAGE_ID',
        index: 0,
        stepDetails: {
          type: 'tool_calls',
          tool_calls: [
            {
              id: 'call-oauth-shifted',
              name: 'oauth_mcp_Google-Workspace',
              args: '',
            },
          ],
        },
      },
    } satisfies ServerSentEvent;

    await manager.emitChunk(streamId, staleReplayEvent);
    const resumeState = await manager.getResumeState(streamId);

    expect(staleReplayEvent.data.index).toBe(0);
    expect(resumeState?.runSteps[0]?.index).toBe(1);
    expect(resumeState?.replayEvents).toEqual([
      {
        ...staleReplayEvent,
        data: { ...staleReplayEvent.data, index: 1 },
      },
    ]);
  });

  test('merges persisted and buffered run steps, preferring the buffered version by id', async () => {
    const store = new PartialRunStepJobStore({ ttlAfterComplete: 60000 });
    manager = createManagerWithStore(store);
    const streamId = `run-step-merge-resume-${Date.now()}`;
    await manager.createJob(streamId, 'user-1', streamId);

    const persistedStep = {
      id: 'step-persisted',
      runId: 'response-1',
      index: 0,
      stepDetails: {
        type: 'tool_calls',
        tool_calls: [{ id: 'call-persisted', name: 'approval_probe', args: '{}' }],
      },
    } as Agents.RunStep;
    const updatedPersistedStep = { ...persistedStep, index: 3 };
    const bufferedOnlyStep = {
      ...persistedStep,
      id: 'step-buffered',
      index: 4,
      stepDetails: {
        type: 'tool_calls',
        tool_calls: [{ id: 'call-buffered', name: 'approval_probe', args: '{}' }],
      },
    } as Agents.RunStep;
    store.setPersistedRunSteps([persistedStep]);

    await manager.emitChunk(streamId, {
      event: 'on_run_step',
      data: updatedPersistedStep,
    });
    await manager.emitChunk(streamId, {
      event: 'on_run_step',
      data: bufferedOnlyStep,
    });

    const resumeState = await manager.getResumeState(streamId);

    expect(resumeState?.runSteps).toEqual([updatedPersistedStep, bufferedOnlyStep]);
  });

  test('does not carry live content or run steps into a replacement job with the same stream id', async () => {
    const store = new InMemoryJobStore({ ttlAfterComplete: 60000 });
    manager = createManagerWithStore(store);
    const streamId = `run-step-replacement-${Date.now()}`;
    await manager.createJob(streamId, 'user-1', streamId);
    const oldRunStep = {
      id: 'step-old-job',
      runId: 'response-old',
      index: 0,
      stepDetails: {
        type: 'tool_calls',
        tool_calls: [{ id: 'call-old-job', name: 'approval_probe', args: '{}' }],
      },
    } as Agents.RunStep;
    await manager.emitChunk(streamId, {
      event: 'on_run_step',
      data: oldRunStep,
    });
    store.setGraph(streamId, {
      contentData: [oldRunStep],
    } as unknown as StandardGraph);
    store.setContentParts(streamId, [{ type: 'text', text: 'old content' }]);
    store.setCollectedUsage(streamId, [{ input_tokens: 1, output_tokens: 2 }]);

    await manager.createJob(streamId, 'user-1', streamId);

    const resumeState = await manager.getResumeState(streamId);
    expect(resumeState?.runSteps).toEqual([]);
    expect(resumeState?.aggregatedContent).toEqual([]);
    expect(store.getCollectedUsage(streamId)).toEqual([]);
  });

  test('returns null when the generation is replaced during the resume snapshot', async () => {
    const store = new InMemoryJobStore({ ttlAfterComplete: 60000 });
    manager = createManagerWithStore(store);
    const streamId = `resume-snapshot-replacement-${Date.now()}`;
    const predecessor = await manager.createJob(streamId, 'user-1', streamId);
    let releasePeek: (() => void) | undefined;
    const peekGate = new Promise<void>((resolve) => {
      releasePeek = resolve;
    });
    let signalPeekStarted: (() => void) | undefined;
    const peekStarted = new Promise<void>((resolve) => {
      signalPeekStarted = resolve;
    });
    const originalPeek = store.peekSteers.bind(store);
    jest.spyOn(store, 'peekSteers').mockImplementationOnce(async (...args) => {
      signalPeekStarted?.();
      await peekGate;
      return originalPeek(...args);
    });

    const reading = manager.getResumeState(streamId, predecessor.createdAt);
    await peekStarted;
    const replacement = await manager.createJob(streamId, 'user-1', streamId);
    releasePeek?.();

    await expect(reading).resolves.toBeNull();
    await expect(manager.getJob(streamId)).resolves.toMatchObject({
      createdAt: replacement.createdAt,
    });
  });

  test('rejects a delayed predecessor run step after the stream id is replaced', async () => {
    manager = createInMemoryManager();
    const streamId = `run-step-delayed-predecessor-${Date.now()}`;
    const predecessor = await manager.createJob(streamId, 'user-1', streamId);
    const replacement = await manager.createJob(streamId, 'user-1', streamId);
    const predecessorRunStep = {
      id: 'step-predecessor',
      runId: 'response-predecessor',
      index: 0,
      stepDetails: {
        type: 'tool_calls',
        tool_calls: [{ id: 'call-predecessor', name: 'approval_probe', args: '{}' }],
      },
    };
    const replacementRunStep = {
      id: 'step-replacement',
      runId: 'response-replacement',
      index: 0,
      stepDetails: {
        type: 'tool_calls',
        tool_calls: [{ id: 'call-replacement', name: 'approval_probe', args: '{}' }],
      },
    };

    await manager.emitChunk(
      streamId,
      { event: 'on_run_step', data: predecessorRunStep },
      { expectedCreatedAt: predecessor.createdAt },
    );
    await manager.emitChunk(
      streamId,
      { event: 'on_run_step', data: replacementRunStep },
      { expectedCreatedAt: replacement.createdAt },
    );

    const resumeState = await manager.getResumeState(streamId);
    expect(resumeState?.runSteps).toEqual([replacementRunStep]);
  });

  test('replaces OAuth replay event for the same step id', async () => {
    manager = createInMemoryManager();
    const streamId = `oauth-delta-replace-${Date.now()}`;
    await manager.createJob(streamId, 'user-1', streamId);

    await manager.emitChunk(streamId, {
      event: 'on_run_step_delta',
      data: {
        id: 'step-oauth',
        delta: {
          tool_calls: [{ name: 'oauth_mcp_Google-Workspace', args: '' }],
          auth: 'https://auth.example.com/first',
          expires_at: 1780791946,
        },
      },
    });

    const replacementEvent = {
      event: 'on_run_step_delta',
      data: {
        id: 'step-oauth',
        delta: {
          tool_calls: [{ name: 'oauth_mcp_Google-Workspace', args: '' }],
          auth: 'https://auth.example.com/latest',
          expires_at: 1780792000,
        },
      },
    } satisfies ServerSentEvent;

    await manager.emitChunk(streamId, replacementEvent);

    const resumeState = await manager.getResumeState(streamId);

    expect(resumeState?.replayEvents).toEqual([replacementEvent]);
  });

  test('does not replay non-MCP action auth deltas', async () => {
    manager = createInMemoryManager();
    const streamId = `action-auth-delta-${Date.now()}`;
    await manager.createJob(streamId, 'user-1', streamId);

    await manager.emitChunk(streamId, {
      event: 'on_run_step_delta',
      data: {
        id: 'step-action-auth',
        delta: {
          type: 'tool_calls',
          tool_calls: [{ name: 'google_calendar_action_api_example_com', args: '' }],
          auth: 'https://auth.example.com/action',
          expires_at: 1780791946,
        },
      },
    });

    const resumeState = await manager.getResumeState(streamId);

    expect(resumeState?.replayEvents).toBeUndefined();
  });

  test('serializes replay event updates for concurrent MCP OAuth prompts', async () => {
    manager = createSnapshotReplayManager();
    const streamId = `oauth-delta-concurrent-${Date.now()}`;
    await manager.createJob(streamId, 'user-1', streamId);

    const createRunStepEvent = (serverName: string, index: number) =>
      ({
        event: 'on_run_step',
        data: {
          id: `step-oauth-${serverName}`,
          runId: 'USE_PRELIM_RESPONSE_MESSAGE_ID',
          index,
          stepDetails: {
            type: 'tool_calls',
            tool_calls: [{ id: `call-${serverName}`, name: `oauth_mcp_${serverName}`, args: '' }],
          },
        },
      }) satisfies ServerSentEvent;

    const createAuthEvent = (serverName: string) =>
      ({
        event: 'on_run_step_delta',
        data: {
          id: `step-oauth-${serverName}`,
          delta: {
            type: 'tool_calls',
            tool_calls: [{ name: `oauth_mcp_${serverName}`, args: '' }],
            auth: `https://auth.example.com/${serverName}`,
            expires_at: 1780791946,
          },
        },
      }) satisfies ServerSentEvent;

    const events = [
      createRunStepEvent('Google-Workspace', 0),
      createAuthEvent('Google-Workspace'),
      createRunStepEvent('clickhouse-docs', 1),
      createAuthEvent('clickhouse-docs'),
    ];

    await Promise.all(events.map((event) => manager!.emitChunk(streamId, event)));

    const resumeState = await manager.getResumeState(streamId);

    expect(resumeState?.replayEvents).toHaveLength(events.length);
    expect(resumeState?.replayEvents).toEqual(expect.arrayContaining(events));
  });
});
