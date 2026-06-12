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
