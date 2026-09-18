import type { StandardGraph, LCTool } from '@librechat/agents';
import type { Tool } from './types';
import {
  validateClientTools,
  buildClientToolDefinitions,
  mergeClientToolDefinitions,
  createClientToolRunStepHandler,
} from './clientTools';

const fnTool = (name: string, overrides: Partial<Tool> = {}): Tool =>
  ({ type: 'function', name, ...overrides }) as Tool;

describe('validateClientTools', () => {
  it('accepts an absent, empty, or hosted-only tools list', () => {
    expect(validateClientTools(undefined)).toBeUndefined();
    expect(validateClientTools([])).toBeUndefined();
    expect(validateClientTools([{ type: 'librechat:web_search' }])).toBeUndefined();
  });

  it.each([
    ['a missing name', [{ type: 'function' }], 'requires a name'],
    ['an empty name', [fnTool('')], 'requires a name'],
    ['an illegal character', [fnTool('open service page')], 'may contain only'],
    ['a duplicate name', [fnTool('dup'), fnTool('dup')], 'duplicate function tool name'],
    ['array parameters', [fnTool('bad', { parameters: [] as never })], 'must be a JSON Schema'],
    [
      'a non-string description',
      [fnTool('bad', { description: 7 as unknown as string })],
      'description must be a string',
    ],
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
        description: 'Open a service page',
        parameters,
        allowed_callers: ['direct'],
      },
    ]);
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
