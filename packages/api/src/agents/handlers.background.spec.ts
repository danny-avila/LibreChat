import { z } from 'zod';
import type { StructuredToolInterface } from '@librechat/agents/langchain/tools';
import { CHECK_BACKGROUND_TASK_NAME } from './background';
import { createToolExecuteHandler } from './handlers';

interface BatchInput {
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
  agentId: string;
  configurable: Record<string, unknown>;
  metadata: Record<string, unknown>;
  resolve: (results: Array<{ content: string }>) => void;
  reject: (error: Error) => void;
}

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

const makeSearchTool = (state: { calls: number; lastInput?: Record<string, unknown> }) =>
  ({
    name: 'search_mcp_docs',
    description: 'search docs',
    schema: z.object({ q: z.string() }),
    invoke: async (input: Record<string, unknown>) => {
      state.calls += 1;
      state.lastInput = input;
      return { content: `RESULT for ${String(input.q)}` };
    },
  }) as unknown as StructuredToolInterface;

const buildConfig = (backgroundToolNames: string[] = ['search_mcp_docs']) => ({
  req: { user: { id: 'exec_user' }, body: { conversationId: 'exec_convo' } },
  backgroundToolNames,
});

const runBatch = async (
  handler: ReturnType<typeof createToolExecuteHandler>,
  input: Omit<BatchInput, 'resolve' | 'reject'>,
): Promise<Array<{ content: string }>> => {
  let out: Array<{ content: string }> = [];
  await handler.handle('on_tool_execute', {
    ...input,
    resolve: (results: Array<{ content: string }>) => {
      out = results;
    },
    reject: (error: Error) => {
      throw error;
    },
  } as unknown as Parameters<typeof handler.handle>[1]);
  return out;
};

describe('createToolExecuteHandler — background tool calls', () => {
  it('returns a handle immediately, runs the tool once detached, and yields the result via check_background_task', async () => {
    const state = { calls: 0 } as { calls: number; lastInput?: Record<string, unknown> };
    const searchTool = makeSearchTool(state);
    const handler = createToolExecuteHandler({
      loadTools: async () => ({ loadedTools: [searchTool] }),
    });
    const configurable = buildConfig();
    const metadata = { thread_id: 'exec_convo' };

    const dispatchResults = await runBatch(handler, {
      toolCalls: [
        {
          id: 'call_bg',
          name: 'search_mcp_docs',
          args: { q: 'librechat', run_in_background: true },
        },
      ],
      agentId: 'agent_1',
      configurable,
      metadata,
    });

    expect(dispatchResults).toHaveLength(1);
    const handle = JSON.parse(dispatchResults[0].content);
    expect(handle.status).toBe('running');
    expect(typeof handle.background_task_id).toBe('string');

    await flushMicrotasks();
    await flushMicrotasks();

    // real tool ran exactly once, without the injected flag
    expect(state.calls).toBe(1);
    expect(state.lastInput).toEqual({ q: 'librechat' });

    const pollResults = await runBatch(handler, {
      toolCalls: [
        {
          id: 'call_poll',
          name: CHECK_BACKGROUND_TASK_NAME,
          args: { background_task_id: handle.background_task_id },
        },
      ],
      agentId: 'agent_1',
      configurable,
      metadata,
    });

    const polled = JSON.parse(pollResults[0].content);
    expect(polled.status).toBe('completed');
    expect(polled.result).toContain('RESULT for librechat');
  });

  it('does not double-dispatch when the same tool call re-executes (resume/replay)', async () => {
    const state = { calls: 0 } as { calls: number; lastInput?: Record<string, unknown> };
    const searchTool = makeSearchTool(state);
    const handler = createToolExecuteHandler({
      loadTools: async () => ({ loadedTools: [searchTool] }),
    });
    const configurable = buildConfig();
    const metadata = { thread_id: 'exec_convo_dup' };
    const toolCalls = [
      { id: 'call_same', name: 'search_mcp_docs', args: { q: 'x', run_in_background: true } },
    ];

    const first = await runBatch(handler, { toolCalls, agentId: 'a', configurable, metadata });
    await flushMicrotasks();
    const second = await runBatch(handler, { toolCalls, agentId: 'a', configurable, metadata });
    await flushMicrotasks();

    const firstId = JSON.parse(first[0].content).background_task_id;
    const secondId = JSON.parse(second[0].content).background_task_id;
    expect(secondId).toBe(firstId);
    expect(state.calls).toBe(1);
  });

  it('runs the tool synchronously when background is not requested', async () => {
    const state = { calls: 0 } as { calls: number; lastInput?: Record<string, unknown> };
    const searchTool = makeSearchTool(state);
    const handler = createToolExecuteHandler({
      loadTools: async () => ({ loadedTools: [searchTool] }),
    });
    const configurable = buildConfig();
    const metadata = { thread_id: 'exec_convo_sync' };

    const results = await runBatch(handler, {
      toolCalls: [{ id: 'call_sync', name: 'search_mcp_docs', args: { q: 'now' } }],
      agentId: 'a',
      configurable,
      metadata,
    });

    expect(state.calls).toBe(1);
    expect(results[0].content).toContain('RESULT for now');
  });

  it('enforces the per-tool opt-in: a tool not in backgroundToolNames runs foreground even with the flag', async () => {
    const state = { calls: 0 } as { calls: number; lastInput?: Record<string, unknown> };
    const searchTool = makeSearchTool(state);
    const handler = createToolExecuteHandler({
      loadTools: async () => ({ loadedTools: [searchTool] }),
    });
    // background enabled for the run, but for a DIFFERENT tool
    const configurable = buildConfig(['some_other_tool']);
    const metadata = { thread_id: 'exec_convo_gate' };

    const results = await runBatch(handler, {
      toolCalls: [
        { id: 'call_gate', name: 'search_mcp_docs', args: { q: 'x', run_in_background: true } },
      ],
      agentId: 'a',
      configurable,
      metadata,
    });

    // ran in the foreground; result is the tool output, not a background handle
    expect(state.calls).toBe(1);
    expect(results[0].content).toContain('RESULT for x');
  });

  it('never backgrounds an ephemeral request-scoped MCP tool: runs it foreground (no detached, leak-free)', async () => {
    const state = { calls: 0 } as { calls: number; lastInput?: Record<string, unknown> };
    const ephemeralTool = {
      name: 'search_mcp_docs',
      description: 'search docs',
      schema: z.object({ q: z.string() }),
      // Tagged in createToolInstance for servers on a runtime-body-placeholder
      // connection, which is torn down at request end.
      mcpRequiresEphemeralConnection: true,
      invoke: async (input: Record<string, unknown>) => {
        state.calls += 1;
        state.lastInput = input;
        return { content: `RESULT for ${String(input.q)}` };
      },
    } as unknown as StructuredToolInterface;
    const handler = createToolExecuteHandler({
      loadTools: async () => ({ loadedTools: [ephemeralTool] }),
    });
    // background IS enabled for this tool, and the model asked to background it
    const configurable = buildConfig();
    const metadata = { thread_id: 'exec_convo_ephemeral' };

    const results = await runBatch(handler, {
      toolCalls: [
        { id: 'call_eph', name: 'search_mcp_docs', args: { q: 'z', run_in_background: true } },
      ],
      agentId: 'a',
      configurable,
      metadata,
    });

    // ran synchronously in the foreground: real output inline, not a handle, flag stripped
    expect(state.calls).toBe(1);
    expect(state.lastInput).toEqual({ q: 'z' });
    expect(results[0].content).toContain('RESULT for z');
    expect(results[0].content).not.toContain('background_task_id');
  });

  it('does not intercept a check_background_task-named tool when background is off for the run', async () => {
    const state = { calls: 0 } as { calls: number; lastInput?: Record<string, unknown> };
    const collisionTool = {
      name: CHECK_BACKGROUND_TASK_NAME,
      description: 'a user MCP tool that happens to share the name',
      schema: z.object({ q: z.string() }),
      invoke: async (input: Record<string, unknown>) => {
        state.calls += 1;
        return { content: `REAL for ${String(input.q)}` };
      },
    } as unknown as StructuredToolInterface;
    const handler = createToolExecuteHandler({
      loadTools: async () => ({ loadedTools: [collisionTool] }),
    });
    const configurable = buildConfig([]); // background not active for this run
    const metadata = { thread_id: 'exec_convo_collision' };

    const results = await runBatch(handler, {
      toolCalls: [{ id: 'call_collision', name: CHECK_BACKGROUND_TASK_NAME, args: { q: 'y' } }],
      agentId: 'a',
      configurable,
      metadata,
    });

    // the real tool ran; the host poll-tool shortcut did not swallow it
    expect(state.calls).toBe(1);
    expect(results[0].content).toContain('REAL for y');
  });

  it('strips run_in_background:false on a foreground call of a background-capable tool', async () => {
    const state = { calls: 0 } as { calls: number; lastInput?: Record<string, unknown> };
    const searchTool = makeSearchTool(state);
    const handler = createToolExecuteHandler({
      loadTools: async () => ({ loadedTools: [searchTool] }),
    });
    const configurable = buildConfig(['search_mcp_docs']);
    const metadata = { thread_id: 'exec_convo_falseflag' };

    const results = await runBatch(handler, {
      toolCalls: [
        { id: 'call_false', name: 'search_mcp_docs', args: { q: 'z', run_in_background: false } },
      ],
      agentId: 'a',
      configurable,
      metadata,
    });

    // ran in the foreground, and the injected flag never reached the real tool
    expect(state.calls).toBe(1);
    expect(state.lastInput).toEqual({ q: 'z' });
    expect(results[0].content).toContain('RESULT for z');
  });

  it('delivers a backgrounded tool artifact on poll (live turn), not on the finalized dispatch turn', async () => {
    const state = { calls: 0 } as { calls: number; lastInput?: Record<string, unknown> };
    const artifactTool = {
      name: 'search_mcp_docs',
      description: 'returns an artifact',
      schema: z.object({ q: z.string() }),
      invoke: async (input: Record<string, unknown>) => {
        state.calls += 1;
        return { content: `RESULT for ${String(input.q)}`, artifact: { files: ['a.png'] } };
      },
    } as unknown as StructuredToolInterface;
    const toolEndCalls: Array<{ name?: string; artifact?: unknown }> = [];
    const handler = createToolExecuteHandler({
      loadTools: async () => ({ loadedTools: [artifactTool] }),
      toolEndCallback: (async (data: { output?: { name?: string; artifact?: unknown } }) => {
        toolEndCalls.push({ name: data.output?.name, artifact: data.output?.artifact });
      }) as unknown as Parameters<typeof createToolExecuteHandler>[0]['toolEndCallback'],
    });
    const configurable = buildConfig(['search_mcp_docs']);
    const metadata = { thread_id: 'exec_convo_artifact', run_id: 'run-artifact' };

    const dispatch = await runBatch(handler, {
      toolCalls: [
        { id: 'call_art', name: 'search_mcp_docs', args: { q: 'img', run_in_background: true } },
      ],
      agentId: 'a',
      configurable,
      metadata,
    });
    await flushMicrotasks();
    await flushMicrotasks();

    // the tool ran, but its artifact is NOT pushed through the finalized dispatch turn
    expect(state.calls).toBe(1);
    expect(toolEndCalls).toHaveLength(0);

    const handleId = JSON.parse(dispatch[0].content).background_task_id;
    const poll = await runBatch(handler, {
      toolCalls: [
        {
          id: 'call_poll',
          name: CHECK_BACKGROUND_TASK_NAME,
          args: { background_task_id: handleId },
        },
      ],
      agentId: 'a',
      configurable,
      metadata: { thread_id: 'exec_convo_artifact', run_id: 'run-poll' },
    });

    // the poll turn delivers the artifact once, attributed to the original tool
    expect(JSON.parse(poll[0].content).status).toBe('completed');
    expect(toolEndCalls).toHaveLength(1);
    expect(toolEndCalls[0]).toEqual({ name: 'search_mcp_docs', artifact: { files: ['a.png'] } });

    // polling again does not re-deliver (idempotent)
    await runBatch(handler, {
      toolCalls: [
        {
          id: 'call_poll2',
          name: CHECK_BACKGROUND_TASK_NAME,
          args: { background_task_id: handleId },
        },
      ],
      agentId: 'a',
      configurable,
      metadata: { thread_id: 'exec_convo_artifact', run_id: 'run-poll2' },
    });
    expect(toolEndCalls).toHaveLength(1);
  });

  it('scopes tasks by configurable user_id when req is absent (external service hosts)', async () => {
    const state = { calls: 0 } as { calls: number; lastInput?: Record<string, unknown> };
    const handler = createToolExecuteHandler({
      loadTools: async () => ({ loadedTools: [makeSearchTool(state)] }),
    });
    const configurable = {
      user_id: 'exec_user_external',
      backgroundToolNames: ['search_mcp_docs'],
    };
    const metadata = { thread_id: 'exec_convo_external', run_id: 'run-external' };

    const dispatch = await runBatch(handler, {
      toolCalls: [
        { id: 'call_ext', name: 'search_mcp_docs', args: { q: 'ping', run_in_background: true } },
      ],
      agentId: 'a',
      configurable,
      metadata,
    });
    await flushMicrotasks();
    await flushMicrotasks();

    const handleId = JSON.parse(dispatch[0].content).background_task_id;
    const poll = await runBatch(handler, {
      toolCalls: [
        {
          id: 'call_ext_poll',
          name: CHECK_BACKGROUND_TASK_NAME,
          args: { background_task_id: handleId },
        },
      ],
      agentId: 'a',
      configurable,
      metadata: { thread_id: 'exec_convo_external', run_id: 'run-external-poll' },
    });
    const polled = JSON.parse(poll[0].content);
    expect(polled.status).toBe('completed');
    expect(polled.result).toContain('RESULT for ping');

    // a different user id cannot see the task (isolation is not conversation-only)
    const foreign = await runBatch(handler, {
      toolCalls: [
        {
          id: 'call_foreign_poll',
          name: CHECK_BACKGROUND_TASK_NAME,
          args: { background_task_id: handleId },
        },
      ],
      agentId: 'a',
      configurable: { user_id: 'someone_else', backgroundToolNames: ['search_mcp_docs'] },
      metadata: { thread_id: 'exec_convo_external', run_id: 'run-foreign' },
    });
    expect(JSON.parse(foreign[0].content).status).toBe('not_found');
  });

  it('errors immediately (like foreground) when a background-requested tool failed to load', async () => {
    const handler = createToolExecuteHandler({
      loadTools: async () => ({ loadedTools: [] }),
    });
    const results = (await runBatch(handler, {
      toolCalls: [
        { id: 'call_missing', name: 'search_mcp_docs', args: { q: 'x', run_in_background: true } },
      ],
      agentId: 'a',
      configurable: buildConfig(['search_mcp_docs']),
      metadata: { thread_id: 'exec_convo_missing', run_id: 'run-missing' },
    })) as Array<{ content: string; status?: string; errorMessage?: string }>;

    expect(results[0].status).toBe('error');
    expect(results[0].errorMessage).toBe('Tool search_mcp_docs not found');
    expect(results[0].content).not.toContain('background_task_id');
  });

  it('strips a run_in_background arg imitated onto a tool this agent never opted in', async () => {
    const state = { calls: 0 } as { calls: number; lastInput?: Record<string, unknown> };
    const handler = createToolExecuteHandler({
      loadTools: async () => ({ loadedTools: [makeSearchTool(state)] }),
    });
    // background is enabled for the run via another tool; search_mcp_docs is NOT opted in
    await runBatch(handler, {
      toolCalls: [
        {
          id: 'call_foreign',
          name: 'search_mcp_docs',
          args: { q: 'hello', run_in_background: true },
        },
      ],
      agentId: 'a',
      configurable: buildConfig(['other_tool']),
      metadata: { thread_id: 'exec_convo_foreign', run_id: 'run-foreign' },
    });

    expect(state.calls).toBe(1);
    expect(state.lastInput).toEqual({ q: 'hello' });
  });

  it('forwards run_in_background untouched to a tool whose own schema declares it', async () => {
    const state = { calls: 0 } as { calls: number; lastInput?: Record<string, unknown> };
    const owningTool = {
      name: 'owns_the_param',
      description: 'declares run_in_background itself',
      schema: z.object({ q: z.string(), run_in_background: z.boolean().optional() }),
      invoke: async (input: Record<string, unknown>) => {
        state.calls += 1;
        state.lastInput = input;
        return { content: 'OWNED' };
      },
    } as unknown as StructuredToolInterface;
    const handler = createToolExecuteHandler({
      loadTools: async () => ({ loadedTools: [owningTool] }),
    });
    await runBatch(handler, {
      toolCalls: [
        {
          id: 'call_owned',
          name: 'owns_the_param',
          args: { q: 'hello', run_in_background: true },
        },
      ],
      agentId: 'a',
      configurable: buildConfig(['other_tool']),
      metadata: { thread_id: 'exec_convo_owned', run_id: 'run-owned' },
    });

    expect(state.calls).toBe(1);
    expect(state.lastInput).toEqual({ q: 'hello', run_in_background: true });
  });

  it('retries artifact delivery on the next poll when the callback fails (artifact not lost)', async () => {
    const artifactTool = {
      name: 'search_mcp_docs',
      description: 'returns an artifact',
      schema: z.object({ q: z.string() }),
      invoke: async () => ({ content: 'RESULT', artifact: { files: ['a.png'] } }),
    } as unknown as StructuredToolInterface;
    const toolEndCalls: Array<{ name?: string; artifact?: unknown }> = [];
    let failNextDelivery = true;
    const handler = createToolExecuteHandler({
      loadTools: async () => ({ loadedTools: [artifactTool] }),
      toolEndCallback: (async (data: { output?: { name?: string; artifact?: unknown } }) => {
        if (failNextDelivery) {
          failNextDelivery = false;
          throw new Error('transient storage failure');
        }
        toolEndCalls.push({ name: data.output?.name, artifact: data.output?.artifact });
      }) as unknown as Parameters<typeof createToolExecuteHandler>[0]['toolEndCallback'],
    });
    const configurable = buildConfig(['search_mcp_docs']);

    const dispatch = await runBatch(handler, {
      toolCalls: [
        { id: 'call_art', name: 'search_mcp_docs', args: { q: 'img', run_in_background: true } },
      ],
      agentId: 'a',
      configurable,
      metadata: { thread_id: 'exec_convo_art_retry', run_id: 'run-artifact' },
    });
    await flushMicrotasks();
    await flushMicrotasks();
    const handleId = JSON.parse(dispatch[0].content).background_task_id;

    // first poll: delivery fails, but the poll itself still succeeds
    const poll1 = await runBatch(handler, {
      toolCalls: [
        {
          id: 'call_poll',
          name: CHECK_BACKGROUND_TASK_NAME,
          args: { background_task_id: handleId },
        },
      ],
      agentId: 'a',
      configurable,
      metadata: { thread_id: 'exec_convo_art_retry', run_id: 'run-poll' },
    });
    expect(JSON.parse(poll1[0].content).status).toBe('completed');
    expect(toolEndCalls).toHaveLength(0);

    // second poll: the restored artifact is re-claimed and delivered
    await runBatch(handler, {
      toolCalls: [
        {
          id: 'call_poll2',
          name: CHECK_BACKGROUND_TASK_NAME,
          args: { background_task_id: handleId },
        },
      ],
      agentId: 'a',
      configurable,
      metadata: { thread_id: 'exec_convo_art_retry', run_id: 'run-poll2' },
    });
    expect(toolEndCalls).toHaveLength(1);
    expect(toolEndCalls[0]).toEqual({ name: 'search_mcp_docs', artifact: { files: ['a.png'] } });
  });
});
