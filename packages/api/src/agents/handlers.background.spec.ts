import { z } from 'zod';
import type { StructuredToolInterface } from '@librechat/agents/langchain/tools';
import { CHECK_BACKGROUND_TASK_NAME } from './background';
import { createToolExecuteHandler } from './handlers';

interface BatchInput {
  toolCalls: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
    stepId?: string;
    turn?: number;
    codeSessionContext?: { session_id: string; files?: Array<Record<string, unknown>> };
    runtimeSessionHint?: string;
  }>;
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

describe('createToolExecuteHandler — backgrounded code execution', () => {
  interface CodeToolState {
    calls: number;
    throwError?: boolean;
    lastInput?: Record<string, unknown>;
    lastConfig?: { toolCall?: Record<string, unknown> };
  }

  const CODE_ARTIFACT = {
    session_id: 'exec-sess',
    files: [{ id: 'f1', name: 'plot.png', storage_session_id: 'store-1' }],
  };

  const makeCodeTool = (state: CodeToolState) =>
    ({
      name: 'execute_code',
      description: 'run code',
      schema: z.object({ lang: z.string(), code: z.string() }),
      invoke: async (
        input: Record<string, unknown>,
        config: { toolCall?: Record<string, unknown> },
      ) => {
        state.calls += 1;
        state.lastInput = input;
        state.lastConfig = config;
        if (state.throwError) {
          throw new Error('Execution error:\n\nboom');
        }
        return { content: 'stdout:\nhello', artifact: CODE_ARTIFACT };
      },
    }) as unknown as StructuredToolInterface;

  const codeCall = (overrides: Record<string, unknown> = {}) => ({
    id: 'call_code',
    name: 'execute_code',
    args: { lang: 'py', code: 'print(1)', run_in_background: true },
    stepId: 'step_1',
    turn: 2,
    codeSessionContext: {
      session_id: 'sess-prev',
      files: [{ id: 'in1', name: 'data.csv', storage_session_id: 'store-0', resource_id: 'r1' }],
    },
    runtimeSessionHint: 'convo-hint',
    ...overrides,
  });

  it('carries full code-session config into the detached invoke, harvests onto the dispatch turn, and re-emits on poll', async () => {
    const state: CodeToolState = { calls: 0 };
    const persistCalls: Array<Record<string, unknown>> = [];
    const emitted: unknown[] = [];
    const toolEndCalls: unknown[] = [];
    const handler = createToolExecuteHandler({
      loadTools: async () => ({ loadedTools: [makeCodeTool(state)] }),
      toolEndCallback: (async (data: { output?: unknown }) => {
        toolEndCalls.push(data.output);
      }) as unknown as Parameters<typeof createToolExecuteHandler>[0]['toolEndCallback'],
      persistBackgroundCodeResult: async (params) => {
        persistCalls.push(params as unknown as Record<string, unknown>);
        return { attachments: [{ file_id: 'f1', toolCallId: params.toolCallId }] };
      },
      emitAttachment: (attachment) => {
        emitted.push(attachment);
      },
    });
    const configurable = buildConfig(['execute_code']);
    const metadata = { thread_id: 'exec_convo_code', run_id: 'msg-dispatch' };

    const dispatch = await runBatch(handler, {
      toolCalls: [codeCall()],
      agentId: 'a',
      configurable,
      metadata,
    });
    const handle = JSON.parse(dispatch[0].content);
    expect(handle.status).toBe('running');

    await flushMicrotasks();
    await flushMicrotasks();
    await flushMicrotasks();

    // detached invoke received the same session/file config a foreground call gets
    expect(state.calls).toBe(1);
    expect(state.lastInput).toEqual({ lang: 'py', code: 'print(1)' });
    const toolCall = state.lastConfig?.toolCall ?? {};
    expect(toolCall.session_id).toBe('sess-prev');
    expect(toolCall._injected_files).toEqual([
      { id: 'in1', name: 'data.csv', storage_session_id: 'store-0', resource_id: 'r1' },
    ]);
    expect(toolCall._runtime_session_hint).toBe('convo-hint');
    expect(toolCall.id).toBe('call_code');
    expect(toolCall.stepId).toBe('step_1');

    // completion-time harvest anchored to the ORIGINAL dispatch identity
    expect(persistCalls).toHaveLength(1);
    expect(persistCalls[0]).toEqual(
      expect.objectContaining({
        toolName: 'execute_code',
        toolCallId: 'call_code',
        messageId: 'msg-dispatch',
        conversationId: 'exec_convo_code',
        dispatchedAt: expect.any(Number),
        output: 'stdout:\nhello',
        artifact: CODE_ARTIFACT,
      }),
    );
    // nothing rode the finalized dispatch turn's callback
    expect(toolEndCalls).toHaveLength(0);

    const poll = (await runBatch(handler, {
      toolCalls: [
        {
          id: 'call_poll',
          name: CHECK_BACKGROUND_TASK_NAME,
          args: { background_task_id: handle.background_task_id },
        },
      ],
      agentId: 'a',
      configurable,
      metadata: { thread_id: 'exec_convo_code', run_id: 'msg-poll' },
    })) as Array<{ content: string; artifact?: unknown }>;
    await flushMicrotasks();

    const polled = JSON.parse(poll[0].content);
    expect(polled.status).toBe('completed');
    expect(polled.result).toContain('hello');
    expect(polled.note).toContain('attached to the tool call');
    // harvested attachments re-emitted on the live poll stream (not
    // re-processed), followed by the live completion marker
    expect(emitted).toEqual([
      { file_id: 'f1', toolCallId: 'call_code' },
      expect.objectContaining({
        type: 'background_task_status',
        /** Agent-suffixed: sibling agents' `call_0` markers must not upsert
         *  over each other client-side. */
        file_id: 'bg-call_code-a',
        messageId: 'msg-dispatch',
        toolCallId: 'call_code',
        status: 'completed',
      }),
    ]);
    expect(toolEndCalls).toHaveLength(0);
    // the claimed artifact rides the poll result so the SDK folds the exec session
    expect(poll[0].artifact).toEqual(CODE_ARTIFACT);
    // the poll also re-anchors the row patch (idempotent heal after full-row saves)
    expect(persistCalls).toHaveLength(2);
    expect(persistCalls[1]).toEqual(
      expect.objectContaining({
        reapply: true,
        toolCallId: 'call_code',
        messageId: 'msg-dispatch',
        output: 'stdout:\nhello',
        attachments: [{ file_id: 'f1', toolCallId: 'call_code' }],
      }),
    );
  });

  it('does not gate task completion on the harvest (same-turn polls see completed)', async () => {
    const state: CodeToolState = { calls: 0 };
    const toolEndCalls: unknown[] = [];
    const emitted: unknown[] = [];
    const handler = createToolExecuteHandler({
      loadTools: async () => ({ loadedTools: [makeCodeTool(state)] }),
      toolEndCallback: (async (data: { output?: unknown }) => {
        toolEndCalls.push(data.output);
      }) as unknown as Parameters<typeof createToolExecuteHandler>[0]['toolEndCallback'],
      /** The dispatch turn's row does not exist until that turn finalizes, so
       *  the real persister can block for a long time — completion must not. */
      persistBackgroundCodeResult: () => new Promise(() => undefined),
      emitAttachment: (attachment) => {
        emitted.push(attachment);
      },
    });
    const configurable = buildConfig(['execute_code']);
    const metadata = { thread_id: 'exec_convo_code_slow', run_id: 'msg-slow' };

    const dispatch = await runBatch(handler, {
      toolCalls: [codeCall({ id: 'call_code_slow' })],
      agentId: 'a',
      configurable,
      metadata,
    });
    await flushMicrotasks();
    await flushMicrotasks();

    const poll = (await runBatch(handler, {
      toolCalls: [
        {
          id: 'call_poll_slow',
          name: CHECK_BACKGROUND_TASK_NAME,
          args: { background_task_id: JSON.parse(dispatch[0].content).background_task_id },
        },
      ],
      agentId: 'a',
      configurable,
      metadata: { thread_id: 'exec_convo_code_slow', run_id: 'msg-slow-poll' },
    })) as Array<{ content: string; artifact?: unknown }>;

    const polled = JSON.parse(poll[0].content);
    expect(polled.status).toBe('completed');
    expect(polled.result).toContain('hello');
    expect(polled.note).toContain('being attached');
    // harvest hasn't landed: no file attachments yet and no poll-identity
    // fallback — but the completion marker fires (execution IS finished)
    expect(emitted).toEqual([
      expect.objectContaining({ type: 'background_task_status', status: 'completed' }),
    ]);
    expect(toolEndCalls).toHaveLength(0);
    expect(poll[0].artifact).toEqual(CODE_ARTIFACT);
  });

  it('falls back to poll-turn delivery when the harvest fails (files not lost)', async () => {
    const state: CodeToolState = { calls: 0 };
    const toolEndCalls: Array<{ name?: string; artifact?: unknown }> = [];
    const handler = createToolExecuteHandler({
      loadTools: async () => ({ loadedTools: [makeCodeTool(state)] }),
      toolEndCallback: (async (data: { output?: { name?: string; artifact?: unknown } }) => {
        toolEndCalls.push({ name: data.output?.name, artifact: data.output?.artifact });
      }) as unknown as Parameters<typeof createToolExecuteHandler>[0]['toolEndCallback'],
      persistBackgroundCodeResult: async () => {
        throw new Error('mongo down');
      },
    });
    const configurable = buildConfig(['execute_code']);
    const metadata = { thread_id: 'exec_convo_code_hfail', run_id: 'msg-hfail' };

    const dispatch = await runBatch(handler, {
      toolCalls: [codeCall({ id: 'call_code_hfail' })],
      agentId: 'a',
      configurable,
      metadata,
    });
    await flushMicrotasks();
    await flushMicrotasks();
    await flushMicrotasks();

    const poll = (await runBatch(handler, {
      toolCalls: [
        {
          id: 'call_poll_hfail',
          name: CHECK_BACKGROUND_TASK_NAME,
          args: { background_task_id: JSON.parse(dispatch[0].content).background_task_id },
        },
      ],
      agentId: 'a',
      configurable,
      metadata: { thread_id: 'exec_convo_code_hfail', run_id: 'msg-hfail-poll' },
    })) as Array<{ content: string; artifact?: unknown }>;

    /** Harvest revoked: the poll turn's callback processes the files instead. */
    expect(toolEndCalls).toHaveLength(1);
    expect(toolEndCalls[0].artifact).toEqual(CODE_ARTIFACT);
    expect(poll[0].artifact).toEqual(CODE_ARTIFACT);
  });

  it('re-anchors failed code tasks on poll (error output heals like success)', async () => {
    const state: CodeToolState = { calls: 0, throwError: true };
    const persistCalls: Array<Record<string, unknown>> = [];
    const handler = createToolExecuteHandler({
      loadTools: async () => ({ loadedTools: [makeCodeTool(state)] }),
      persistBackgroundCodeResult: async (params) => {
        persistCalls.push(params as unknown as Record<string, unknown>);
        return { attachments: [] };
      },
    });
    const configurable = buildConfig(['execute_code']);
    const metadata = { thread_id: 'exec_convo_code_errheal', run_id: 'msg-errheal' };

    const dispatch = await runBatch(handler, {
      toolCalls: [codeCall({ id: 'call_code_errheal' })],
      agentId: 'a',
      configurable,
      metadata,
    });
    await flushMicrotasks();
    await flushMicrotasks();

    await runBatch(handler, {
      toolCalls: [
        {
          id: 'call_poll_errheal',
          name: CHECK_BACKGROUND_TASK_NAME,
          args: { background_task_id: JSON.parse(dispatch[0].content).background_task_id },
        },
      ],
      agentId: 'a',
      configurable,
      metadata: { thread_id: 'exec_convo_code_errheal', run_id: 'msg-errheal-poll' },
    });
    await flushMicrotasks();

    expect(persistCalls).toHaveLength(2);
    expect(persistCalls[1]).toEqual(
      expect.objectContaining({ reapply: true, toolCallId: 'call_code_errheal' }),
    );
    expect(String(persistCalls[1].output)).toContain('boom');
  });

  it('re-anchors reaped (timed-out) tasks with the client-recognized failure wrapper', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      const persistCalls: Array<Record<string, unknown>> = [];
      const hangingTool = {
        name: 'execute_code',
        description: 'never settles',
        schema: z.object({ lang: z.string(), code: z.string() }),
        invoke: () => new Promise(() => undefined),
      } as unknown as StructuredToolInterface;
      const handler = createToolExecuteHandler({
        loadTools: async () => ({ loadedTools: [hangingTool] }),
        persistBackgroundCodeResult: async (params) => {
          persistCalls.push(params as unknown as Record<string, unknown>);
          return { attachments: [] };
        },
      });
      const configurable = buildConfig(['execute_code']);

      const dispatch = await runBatch(handler, {
        toolCalls: [codeCall({ id: 'call_code_reap' })],
        agentId: 'a',
        configurable,
        metadata: { thread_id: 'exec_convo_reap', run_id: 'msg-reap' },
      });

      /** Past the running TTL the registry reaps the never-settling task. */
      jest.advanceTimersByTime(31 * 60 * 1000);

      const poll = await runBatch(handler, {
        toolCalls: [
          {
            id: 'call_poll_reap',
            name: CHECK_BACKGROUND_TASK_NAME,
            args: { background_task_id: JSON.parse(dispatch[0].content).background_task_id },
          },
        ],
        agentId: 'a',
        configurable,
        metadata: { thread_id: 'exec_convo_reap', run_id: 'msg-reap-poll' },
      });
      await flushMicrotasks();

      expect(JSON.parse(poll[0].content).status).toBe('error');
      const reapply = persistCalls.find((call) => call.reapply === true);
      expect(reapply).toBeDefined();
      expect(String(reapply?.output)).toMatch(/^Error:\s*\[execute_code\]\s*tool call failed:/);
      expect(String(reapply?.output)).toContain('timed out');
    } finally {
      jest.useRealTimers();
    }
  });

  it('patches the dispatch turn with the error message when a backgrounded code call fails', async () => {
    const state: CodeToolState = { calls: 0, throwError: true };
    const persistCalls: Array<Record<string, unknown>> = [];
    const handler = createToolExecuteHandler({
      loadTools: async () => ({ loadedTools: [makeCodeTool(state)] }),
      persistBackgroundCodeResult: async (params) => {
        persistCalls.push(params as unknown as Record<string, unknown>);
        return { attachments: [] };
      },
    });
    const configurable = buildConfig(['execute_code']);
    const metadata = { thread_id: 'exec_convo_code_err', run_id: 'msg-err' };

    const dispatch = await runBatch(handler, {
      toolCalls: [codeCall({ id: 'call_code_err' })],
      agentId: 'a',
      configurable,
      metadata,
    });
    await flushMicrotasks();
    await flushMicrotasks();
    await flushMicrotasks();

    expect(persistCalls).toHaveLength(1);
    expect(String(persistCalls[0].output)).toContain('boom');
    /** Parity with foreground failures (the graph's error wrapper) so the
     *  client's `isError` detection flags the patched output on reload. */
    expect(String(persistCalls[0].output)).toMatch(
      /^Error:\s*\[execute_code\]\s*tool call failed:/,
    );
    expect(persistCalls[0].artifact).toBeUndefined();

    const poll = await runBatch(handler, {
      toolCalls: [
        {
          id: 'call_poll_err',
          name: CHECK_BACKGROUND_TASK_NAME,
          args: { background_task_id: JSON.parse(dispatch[0].content).background_task_id },
        },
      ],
      agentId: 'a',
      configurable,
      metadata: { thread_id: 'exec_convo_code_err', run_id: 'msg-err-poll' },
    });
    const polled = JSON.parse(poll[0].content);
    expect(polled.status).toBe('error');
    expect(polled.error).toContain('boom');
  });

  it('downgrades code calls to foreground when the host wires no persister (OpenAI-compat routes)', async () => {
    const state: CodeToolState = { calls: 0 };
    const handler = createToolExecuteHandler({
      loadTools: async () => ({ loadedTools: [makeCodeTool(state)] }),
      /** No persistBackgroundCodeResult: generated files could only anchor
       *  via a later poll (or never) — safer to run the call foreground. */
    });
    const configurable = buildConfig(['execute_code']);
    const metadata = { thread_id: 'exec_convo_code_fg', run_id: 'msg-fg' };

    const results = (await runBatch(handler, {
      toolCalls: [codeCall({ id: 'call_code_fg' })],
      agentId: 'a',
      configurable,
      metadata,
    })) as Array<{ content: string; artifact?: unknown }>;

    expect(state.calls).toBe(1);
    expect(results[0].content).not.toContain('background_task_id');
    expect(results[0].content).toContain('hello');
    expect(results[0].artifact).toEqual(CODE_ARTIFACT);
    /** The injected flag never reaches the real tool. */
    expect(state.lastInput).toEqual({ lang: 'py', code: 'print(1)' });
  });
});
