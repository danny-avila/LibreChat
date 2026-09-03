import { EModelEndpoint, parseEphemeralAgentId } from 'librechat-data-provider';
import type { LoadAgentDeps } from './load';
import { loadAddedAgent } from './added';
import { loadEphemeralAgent } from './load';
import { resolveSender } from './sender';

const deps: LoadAgentDeps = {
  getAgent: async () => null,
  getMCPServerTools: async () => null,
};

const baseReq = {
  user: { id: 'user-1' },
  config: {
    modelSpecs: { list: [{ name: 'my-opus-spec', label: 'Spec Label' }] },
  },
  body: {},
} as unknown as Parameters<typeof loadEphemeralAgent>[0]['req'];

async function idFor(modelParameters: Record<string, unknown>) {
  const agent = await loadEphemeralAgent(
    {
      req: baseReq,
      spec: 'my-opus-spec',
      endpoint: 'my-custom-endpoint',
      model_parameters: modelParameters as never,
    },
    deps,
  );
  return agent?.id;
}

/**
 * Documents the #14253 Bug 2 mechanism: the ephemeral agent id (LangGraph node /
 * HITL checkpoint namespace) is derived from `sender = modelLabel ?? modelSpec.label`.
 * When the resume drops `modelLabel`, the id drifts and the paused checkpoint can't be
 * re-entered. The fix keeps `modelLabel` across resume (RESUME_CONTEXT_KEYS), so the
 * original and resumed ids stay equal.
 */
describe('loadEphemeralAgent ephemeral id stability (#14253 Bug 2)', () => {
  test('id changes when modelLabel is lost vs preserved', async () => {
    const withLabel = await idFor({ model: 'claude-opus-4', modelLabel: 'My Opus' });
    const withoutLabel = await idFor({ model: 'claude-opus-4' });
    expect(withLabel).toBeTruthy();
    expect(withoutLabel).toBeTruthy();
    // Original turn (has modelLabel) vs a resume that dropped it → different namespace.
    expect(withLabel).not.toEqual(withoutLabel);
  });

  test('id is stable when modelLabel is preserved across turns', async () => {
    const a = await idFor({ model: 'claude-opus-4', modelLabel: 'My Opus' });
    const b = await idFor({ model: 'claude-opus-4', modelLabel: 'My Opus' });
    expect(a).toEqual(b);
  });
});

/** Custom endpoints carry their configured name in `endpoint` at runtime,
 *  which `TEndpointOption` types as `EModelEndpoint`. */
const customEndpointOption = {
  endpoint: 'my-custom-endpoint' as EModelEndpoint,
  model: 'claude-opus-4',
};

describe('loadEphemeralAgent → resolveSender parity', () => {
  test('the persisted sender matches the spec label encoded into the agent id', async () => {
    const agent = await loadEphemeralAgent(
      {
        req: baseReq,
        spec: 'my-opus-spec',
        endpoint: 'my-custom-endpoint',
        model_parameters: { model: 'claude-opus-4' } as never,
      },
      deps,
    );
    expect(agent?.id).toBeTruthy();
    const sender = resolveSender({
      agent: { id: agent?.id },
      specLabel: 'Spec Label',
      endpointOption: customEndpointOption,
    });
    expect(sender).toBe('Spec Label');
    expect(sender).toBe(parseEphemeralAgentId(agent?.id ?? '')?.sender);
  });

  test('a user modelLabel wins over the spec label in the persisted sender', async () => {
    const agent = await loadEphemeralAgent(
      {
        req: baseReq,
        spec: 'my-opus-spec',
        endpoint: 'my-custom-endpoint',
        model_parameters: { model: 'claude-opus-4', modelLabel: 'My Opus' } as never,
      },
      deps,
    );
    const sender = resolveSender({
      agent: { id: agent?.id },
      specLabel: 'Spec Label',
      endpointOption: { ...customEndpointOption, modelLabel: 'My Opus' },
    });
    expect(sender).toBe('My Opus');
    expect(sender).toBe(parseEphemeralAgentId(agent?.id ?? '')?.sender);
  });
});

describe('loadEphemeralAgent model-spec defaults', () => {
  const modelSpec = {
    name: 'tool-defaults',
    label: 'Tool Defaults',
    preset: { endpoint: 'agents', model: 'gpt-4' },
    mcpServers: ['spec-server'],
    webSearch: true,
    fileSearch: true,
    executeCode: true,
    memory: true,
    askUserQuestion: true,
    skills: true,
  };
  const explicitDisabledSelections = {
    mcp: [],
    web_search: false,
    file_search: false,
    execute_code: false,
    memory: false,
    ask_user_question: false,
    skills: false,
  };

  test('explicit request selections override optional defaults but retain model-spec MCP pins', async () => {
    const getMCPServerTools = jest.fn(async () => ({ spec_tool: {} }));
    const agent = await loadEphemeralAgent(
      {
        req: {
          user: { id: 'user-1' },
          config: {
            modelSpecs: { list: [modelSpec] },
          },
          body: {
            ephemeralAgent: explicitDisabledSelections,
          },
        } as unknown as Parameters<typeof loadEphemeralAgent>[0]['req'],
        spec: 'tool-defaults',
        endpoint: 'agents',
        model_parameters: { model: 'gpt-4' } as never,
      },
      { ...deps, getMCPServerTools },
    );

    expect(agent?.tools).toEqual(['spec_tool']);
    expect(agent?.skills_enabled).toBe(false);
    expect(agent?.skills).toEqual([]);
    expect(getMCPServerTools).toHaveBeenCalledWith('user-1', 'spec-server', undefined);
  });

  test('model-spec defaults apply when the request omits selections', async () => {
    const getMCPServerTools = jest.fn(async () => ({ spec_tool: {} }));
    const agent = await loadEphemeralAgent(
      {
        req: {
          user: { id: 'user-1' },
          config: { modelSpecs: { list: [modelSpec] } },
          body: { ephemeralAgent: {} },
        } as unknown as Parameters<typeof loadEphemeralAgent>[0]['req'],
        spec: 'tool-defaults',
        endpoint: 'agents',
        model_parameters: { model: 'gpt-4' } as never,
      },
      { ...deps, getMCPServerTools },
    );

    expect(agent?.tools).toEqual([
      'execute_code',
      'file_search',
      'web_search',
      'memory',
      'ask_user_question',
      'spec_tool',
    ]);
    expect(agent?.skills_enabled).toBe(true);
    expect(getMCPServerTools).toHaveBeenCalledWith('user-1', 'spec-server', undefined);
  });

  test('added agents override optional defaults but retain model-spec MCP pins', async () => {
    const getMCPServerTools = jest.fn(async () => ({ spec_tool: {} }));
    const agent = await loadAddedAgent(
      {
        req: {
          user: { id: 'user-1' },
          config: {
            modelSpecs: { list: [modelSpec] },
          },
        },
        conversation: {
          endpoint: 'agents',
          model: 'gpt-4',
          spec: 'tool-defaults',
          ephemeralAgent: explicitDisabledSelections,
        } as never,
      },
      { ...deps, getMCPServerTools },
    );

    expect(agent?.tools).toEqual(['spec_tool']);
    expect(agent?.skills_enabled).toBe(false);
    expect(agent?.skills).toEqual([]);
    expect(getMCPServerTools).toHaveBeenCalledWith('user-1', 'spec-server', undefined);
  });
});
