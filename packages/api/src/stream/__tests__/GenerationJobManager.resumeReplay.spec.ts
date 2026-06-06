import type { ServerSentEvent } from '~/types';
import { InMemoryEventTransport } from '~/stream/implementations/InMemoryEventTransport';
import { InMemoryJobStore } from '~/stream/implementations/InMemoryJobStore';
import { GenerationJobManagerClass } from '~/stream/GenerationJobManager';

jest.spyOn(console, 'log').mockImplementation();

function createInMemoryManager(): GenerationJobManagerClass {
  const manager = new GenerationJobManagerClass();
  manager.configure({
    jobStore: new InMemoryJobStore({ ttlAfterComplete: 60000 }),
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

  test('includes OAuth run step and delta replay events in resume state', async () => {
    manager = createInMemoryManager();
    const streamId = `oauth-delta-resume-${Date.now()}`;
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
          expires_at: 1780791946,
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
          auth: 'https://auth.example.com/latest',
          expires_at: 1780792000,
        },
      },
    } satisfies ServerSentEvent;

    await manager.emitChunk(streamId, replacementEvent);

    const resumeState = await manager.getResumeState(streamId);

    expect(resumeState?.replayEvents).toEqual([replacementEvent]);
  });
});
