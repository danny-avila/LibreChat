import type {
  LCTool,
  StandardGraph,
  ToolCallRequest,
  ToolExecuteResult,
  ToolExecuteBatchRequest,
} from '@librechat/agents';
import type { RunStepHandler, ToolExecuteHandler } from './clientTools';
import type { FunctionTool, Tool } from './types';
import {
  validateClientTools,
  createClientToolHandoff,
  buildClientToolDefinitions,
  mergeClientToolDefinitions,
  clientToolDeferralContent,
  createClientToolRunStepHandler,
  createClientToolExecuteHandler,
} from './clientTools';

const fnTool = (name: string, overrides: Partial<FunctionTool> = {}): FunctionTool => ({
  type: 'function',
  name,
  ...overrides,
});

describe('validateClientTools', () => {
  it('accepts an absent, empty, or hosted-only tools list', () => {
    expect(validateClientTools(undefined)).toBeUndefined();
    expect(validateClientTools([])).toBeUndefined();
    expect(validateClientTools([{ type: 'librechat:web_search' }])).toBeUndefined();
  });

  it.each<[string, unknown, string]>([
    ['a missing name', [{ type: 'function' }], 'requires a name'],
    ['an empty name', [fnTool('')], 'requires a name'],
    ['an illegal character', [fnTool('open service page')], 'may contain only'],
    ['a duplicate name', [fnTool('dup'), fnTool('dup')], 'duplicate function tool name'],
    ['array parameters', [{ type: 'function', name: 'bad', parameters: [] }], 'JSON Schema'],
    [
      'a non-string description',
      [{ type: 'function', name: 'bad', description: 7 }],
      'description must be a string',
    ],
    ['a string entry', ['open_service_page'], 'tools[0] must be an object'],
    ['a null entry', [null], 'tools[0] must be an object'],
    ['an array entry', [[]], 'tools[0] must be an object'],
    ['an entry without a type', [{ name: 'no_type' }], 'tools[0] must be an object'],
    ['a non-string type', [{ type: 7 }], 'tools[0] must be an object'],
    ['a later malformed entry', [fnTool('ok'), 'nope'], 'tools[1] must be an object'],
  ])('rejects %s', (_label, tools, expected) => {
    expect(validateClientTools(tools)).toContain(expected);
  });

  it('rejects a non-array tools value', () => {
    expect(validateClientTools({})).toBe('tools must be an array');
  });
});

describe('buildClientToolDefinitions', () => {
  it('converts a function tool into a model-visible definition', () => {
    const parameters = {
      type: 'object',
      properties: { serviceId: { type: 'string' } },
      required: ['serviceId'],
    };

    expect(
      buildClientToolDefinitions([
        fnTool('open_service_page', { description: 'Open a service page', parameters }),
      ]),
    ).toEqual([
      {
        name: 'open_service_page',
        description: expect.stringMatching(/^Open a service page /),
        parameters,
        allowed_callers: ['direct'],
      },
    ]);
  });

  it('asks the model to call the tool alone, keeping the caller’s description', () => {
    const [definition] = buildClientToolDefinitions([
      fnTool('open_service_page', { description: 'Open a service page' }),
    ]);

    expect(definition.description).toContain('Open a service page');
    expect(definition.description).toContain('only tool call of its turn');
  });

  it('carries the notice alone when the caller declared no description', () => {
    const [definition] = buildClientToolDefinitions([fnTool('refresh')]);
    expect(definition.description).toContain('only tool call of its turn');
  });

  it('defaults a parameterless tool to an empty JSON Schema object', () => {
    const [definition] = buildClientToolDefinitions([fnTool('refresh')]);
    expect(definition.parameters).toEqual({ type: 'object', properties: {} });
  });

  it('ignores hosted tools, which the server owns', () => {
    const definitions = buildClientToolDefinitions([
      { type: 'librechat:web_search' } as Tool,
      fnTool('open_service_page'),
    ]);
    expect(definitions.map((d) => d.name)).toEqual(['open_service_page']);
  });

  it('treats an absent tools list as no client tools', () => {
    expect(buildClientToolDefinitions(undefined)).toEqual([]);
  });
});

describe('mergeClientToolDefinitions', () => {
  const serverTool: LCTool = { name: 'run_query', parameters: { type: 'object' } };

  it('appends client definitions after the agent’s own', () => {
    const merged = mergeClientToolDefinitions(
      [serverTool],
      buildClientToolDefinitions([fnTool('open_service_page')]),
    );

    expect(merged.toolDefinitions.map((d) => d.name)).toEqual(['run_query', 'open_service_page']);
    expect([...merged.names]).toEqual(['open_service_page']);
    expect(merged.shadowed).toEqual([]);
  });

  it('lets the server tool win a name collision, and reports it', () => {
    const merged = mergeClientToolDefinitions(
      [serverTool],
      buildClientToolDefinitions([fnTool('run_query')]),
    );

    expect(merged.toolDefinitions).toEqual([serverTool]);
    /** Not treated as a client tool, so the run will still execute the real one. */
    expect(merged.names.size).toBe(0);
    expect(merged.shadowed).toEqual(['run_query']);
  });

  it('leaves the definitions untouched when nothing was declared', () => {
    const existing = [serverTool];
    expect(mergeClientToolDefinitions(existing, []).toolDefinitions).toBe(existing);
  });

  it('handles an agent with no definitions of its own', () => {
    const merged = mergeClientToolDefinitions(undefined, [{ name: 'refresh' }]);
    expect(merged.toolDefinitions.map((d) => d.name)).toEqual(['refresh']);
  });
});

describe('createClientToolHandoff', () => {
  const serverTool: LCTool = { name: 'run_query', parameters: { type: 'object' } };
  const runStep: RunStepHandler = { handle: () => {} };
  const toolExecute: ToolExecuteHandler = { handle: () => {} };

  it('declares the caller’s function tools after the agent’s own', () => {
    const handoff = createClientToolHandoff({
      tools: [fnTool('open_service_page')],
      agentDefinitions: [serverTool],
      responseId: 'resp_1',
    });

    expect(handoff.toolDefinitions.map((d) => d.name)).toEqual(['run_query', 'open_service_page']);
  });

  it('reports the applied tools as the caller sent them, without the notice', () => {
    const declared = fnTool('open_service_page', { description: 'Open a service page' });
    const handoff = createClientToolHandoff({
      tools: [declared],
      agentDefinitions: [serverTool],
      responseId: 'resp_1',
    });

    expect(handoff.appliedTools).toEqual([declared]);
    expect(handoff.appliedTools[0].description).toBe('Open a service page');
  });

  it('omits a hosted tool from the applied tools, since the server ignores it', () => {
    const handoff = createClientToolHandoff({
      tools: [{ type: 'librechat:web_search' } as Tool, fnTool('open_service_page')],
      agentDefinitions: [],
      responseId: 'resp_1',
    });

    expect(handoff.appliedTools.map((t) => t.name)).toEqual(['open_service_page']);
  });

  it('omits a tool the agent already owns, since that one was dropped', () => {
    const handoff = createClientToolHandoff({
      tools: [fnTool('run_query'), fnTool('open_service_page')],
      agentDefinitions: [serverTool],
      responseId: 'resp_1',
    });

    expect(handoff.toolDefinitions).toEqual([
      serverTool,
      expect.objectContaining({ name: 'open_service_page' }),
    ]);
    expect(handoff.appliedTools.map((t) => t.name)).toEqual(['open_service_page']);
  });

  it('wraps both handlers once a client tool is in play', () => {
    const handoff = createClientToolHandoff({
      tools: [fnTool('open_service_page')],
      agentDefinitions: [serverTool],
      responseId: 'resp_1',
    });

    expect(handoff.wrapRunStep(runStep)).not.toBe(runStep);
    expect(handoff.wrapToolExecute(toolExecute)).not.toBe(toolExecute);
  });

  it.each([
    ['no tools at all', undefined],
    ['hosted tools only', [{ type: 'librechat:web_search' } as Tool]],
    ['a tool the agent already owns', [fnTool('run_query')]],
  ])('stays inert with %s', (_label, tools) => {
    const agentDefinitions = [serverTool];
    const handoff = createClientToolHandoff({ tools, agentDefinitions, responseId: 'resp_1' });

    expect(handoff.toolDefinitions).toEqual(agentDefinitions);
    expect(handoff.appliedTools).toEqual([]);
    expect(handoff.wrapRunStep(runStep)).toBe(runStep);
    expect(handoff.wrapToolExecute(toolExecute)).toBe(toolExecute);
  });
});

describe('createClientToolRunStepHandler', () => {
  const clientToolNames = new Set(['open_service_page']);
  const step = (tool_calls: Array<{ id?: string; name?: string }>) => ({
    stepDetails: { type: 'tool_calls', tool_calls },
  });

  const makeDelegate = () => ({ handle: jest.fn() });
  const asGraph = (graph: { invokedToolIds?: Set<string> }) => graph as unknown as StandardGraph;

  it('returns the delegate untouched when nothing was declared', () => {
    const delegate = makeDelegate();
    expect(createClientToolRunStepHandler({ delegate, clientToolNames: new Set() })).toBe(delegate);
  });

  it('marks only the client tool calls, after delegating', () => {
    const delegate = makeDelegate();
    const handler = createClientToolRunStepHandler({ delegate, clientToolNames });
    const graph: { invokedToolIds?: Set<string> } = {};
    const data = step([
      { id: 'call_1', name: 'run_query' },
      { id: 'call_2', name: 'open_service_page' },
    ]);

    handler.handle('on_run_step', data, undefined, asGraph(graph));

    expect(delegate.handle).toHaveBeenCalledWith('on_run_step', data, undefined, graph);
    expect([...(graph.invokedToolIds ?? [])]).toEqual(['call_2']);
  });

  it('adds to an existing set rather than replacing it', () => {
    const invokedToolIds = new Set(['call_0']);
    const graph = { invokedToolIds };
    const handler = createClientToolRunStepHandler({ delegate: makeDelegate(), clientToolNames });

    handler.handle(
      'on_run_step',
      step([{ id: 'call_2', name: 'open_service_page' }]),
      undefined,
      asGraph(graph),
    );

    expect(graph.invokedToolIds).toBe(invokedToolIds);
    expect([...invokedToolIds]).toEqual(['call_0', 'call_2']);
  });

  it('still delegates when there is no graph or no tool calls', () => {
    const delegate = makeDelegate();
    const handler = createClientToolRunStepHandler({ delegate, clientToolNames });
    const graph: { invokedToolIds?: Set<string> } = {};

    handler.handle(
      'on_run_step',
      step([{ id: 'call_1', name: 'run_query' }]),
      undefined,
      asGraph(graph),
    );
    handler.handle(
      'on_run_step',
      { stepDetails: { type: 'message_creation' } },
      undefined,
      asGraph(graph),
    );
    handler.handle('on_run_step', step([{ name: 'open_service_page' }]), undefined, asGraph(graph));
    handler.handle('on_run_step', step([{ id: 'call_2', name: 'open_service_page' }]));

    expect(delegate.handle).toHaveBeenCalledTimes(4);
    expect(graph.invokedToolIds?.size ?? 0).toBe(0);
  });
});

describe('createClientToolExecuteHandler', () => {
  const clientToolNames = new Set(['submit_sql']);
  const responseId = 'resp_1';

  const toolCall = (id: string, name: string): ToolCallRequest => ({ id, name, args: {} });

  const makeBatch = (toolCalls: ToolCallRequest[]) => {
    const resolve = jest.fn();
    const onResult = jest.fn();
    const data = { toolCalls, resolve, onResult } as unknown as ToolExecuteBatchRequest;
    return { data, resolve, onResult };
  };

  /** Stands in for the host executor: answers whatever batch it is handed. */
  const makeDelegate = (results: ToolExecuteResult[] = []) => ({
    handle: jest.fn((_event: string, data: ToolExecuteBatchRequest) => data.resolve(results)),
  });

  it('returns the delegate untouched when nothing was declared', () => {
    const delegate = makeDelegate();
    expect(
      createClientToolExecuteHandler({
        delegate,
        clientToolNames: new Set(),
        responseId,
      }),
    ).toBe(delegate);
  });

  it('passes a server-only batch through without touching it', () => {
    const delegate = makeDelegate();
    const handler = createClientToolExecuteHandler({ delegate, clientToolNames, responseId });
    const { data, onResult } = makeBatch([toolCall('call_1', 'list_tables')]);

    handler.handle('on_tool_execute', data);

    expect(delegate.handle).toHaveBeenCalledWith('on_tool_execute', data);
    expect(onResult).not.toHaveBeenCalled();
  });

  it('executes the server call and defers the client call of a mixed batch', () => {
    const executed: ToolExecuteResult = {
      toolCallId: 'call_1',
      status: 'success',
      content: 'default, analytics',
    };
    const delegate = makeDelegate([executed]);
    const handler = createClientToolExecuteHandler({ delegate, clientToolNames, responseId });
    const { data, resolve, onResult } = makeBatch([
      toolCall('call_1', 'list_tables'),
      toolCall('call_2', 'submit_sql'),
    ]);

    handler.handle('on_tool_execute', data);

    const delegated = delegate.handle.mock.calls[0][1] as ToolExecuteBatchRequest;
    expect(delegated.toolCalls).toEqual([toolCall('call_1', 'list_tables')]);

    const deferral: ToolExecuteResult = {
      toolCallId: 'call_2',
      status: 'success',
      content: clientToolDeferralContent('submit_sql'),
    };
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith([executed, deferral]);
    expect(onResult).toHaveBeenCalledWith(deferral);
  });

  it('tells the model to call the tool alone rather than reporting a failure', () => {
    const delegate = makeDelegate();
    const handler = createClientToolExecuteHandler({ delegate, clientToolNames, responseId });
    const { data, resolve } = makeBatch([
      toolCall('call_1', 'list_tables'),
      toolCall('call_2', 'submit_sql'),
    ]);

    handler.handle('on_tool_execute', data);

    const [[deferral]] = resolve.mock.calls as [[ToolExecuteResult[]]];
    const content = deferral.find((result) => result.toolCallId === 'call_2');
    expect(content?.status).toBe('success');
    expect(content?.content).toContain('submit_sql');
    expect(content?.content).toContain('only tool call of its turn');
  });

  it('answers a client-only batch without reaching the delegate', () => {
    const delegate = makeDelegate();
    const handler = createClientToolExecuteHandler({ delegate, clientToolNames, responseId });
    const { data, resolve } = makeBatch([toolCall('call_2', 'submit_sql')]);

    handler.handle('on_tool_execute', data);

    expect(delegate.handle).not.toHaveBeenCalled();
    expect(resolve).toHaveBeenCalledWith([
      {
        toolCallId: 'call_2',
        status: 'success',
        content: clientToolDeferralContent('submit_sql'),
      },
    ]);
  });

  it('keeps the batch fields the delegate depends on', () => {
    const delegate = makeDelegate();
    const handler = createClientToolExecuteHandler({ delegate, clientToolNames, responseId });
    const { data } = makeBatch([
      toolCall('call_1', 'list_tables'),
      toolCall('call_2', 'submit_sql'),
    ]);
    (data as ToolExecuteBatchRequest & { agentId?: string }).agentId = 'agent_7';

    handler.handle('on_tool_execute', data);

    const delegated = delegate.handle.mock.calls[0][1] as ToolExecuteBatchRequest & {
      agentId?: string;
    };
    expect(delegated.agentId).toBe('agent_7');
    expect(delegated.onResult).toBe(data.onResult);
  });
});
