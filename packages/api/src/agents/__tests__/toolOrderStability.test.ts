/**
 * Provider payload stability of the `tools` array and the MCP instructions.
 *
 * Providers cache from the start of the request, and `tools` is serialized
 * before the system prompt, so the same MCP servers selected in a different
 * order, or a server whose tool map keys come back in a different order after
 * a reconnect, must not change a single byte of either.
 *
 * Each case assembles a realistic mixed tool set through the real code paths:
 * `loadEphemeralAgent` (picker selection and spec servers), `loadToolDefinitions`
 * (MCP catalogs, deferred tools plus `tool_search`, built-ins, an action tool),
 * the capability registrars `initializeAgent` runs (code execution, memory, file
 * authoring), the real `MCPManager` instruction formatter, and `createRun` with
 * self-spawn subagents. The serialized request is captured right before it would
 * leave the process (mocked `fetch`, or an injected Bedrock client) and aborted
 * there; nothing reaches the network.
 *
 * Not driven through the real path: skill tools (they need the skill catalog and
 * file storage that `initializeAgent` hydrates) are covered by the registrar
 * seam only, and saved-agent graph handoff tools by the dedicated graph specs.
 */
import { HumanMessage } from '@langchain/core/messages';
import { Providers } from '@librechat/agents';
import { Tools } from 'librechat-data-provider';
import type { LCTool } from '@librechat/agents';
import type { LoadAgentDeps } from '../load';
import { registerCodeExecutionTools, registerFileAuthoringTools } from '../tools';
import { getToolDefinition } from '~/tools/registry/definitions';
import { loadToolDefinitions } from '~/tools/definitions';
import { applyContextToAgent } from '../context';
import { registerMemoryTools } from '../memory';
import { formatMCPServerTools } from '~/mcp/tools';
import { loadEphemeralAgent } from '../load';
import { MCPManager } from '~/mcp/MCPManager';
import { createRun } from '../run';

const mockServerConfigs: Record<string, { serverInstructions: string }> = {};

jest.mock('~/mcp/registry/MCPServersRegistry', () => ({
  MCPServersRegistry: {
    getInstance: () => ({
      getAllServerConfigs: async () => mockServerConfigs,
    }),
  },
}));

jest.setTimeout(60000);

const CAPTURED = 'request captured before network';
const ACTION_TOOL = 'getForecast_action_weather---example---com';

const SERVERS = ['alpha', 'beta', 'gamma', 'a_b'] as const;
type Server = (typeof SERVERS)[number];

const TOOL_NAMES: Record<Server, string[]> = {
  alpha: ['search_docs', 'fetch_page', 'list_sources'],
  beta: ['run_query', 'describe_table', 'list_tables'],
  gamma: ['create_ticket', 'close_ticket'],
  a_b: ['ping'],
};

/** One tool per server is deferred, so `tool_search` is part of every payload. */
const DEFERRED = new Set(['fetch_page_mcp_alpha', 'list_tables_mcp_beta']);

for (const server of SERVERS) {
  mockServerConfigs[server] = { serverInstructions: `Rules for ${server}.` };
}

function catalogFor(server: Server, reverseKeys: boolean): Record<string, unknown> {
  const catalog = formatMCPServerTools(
    server,
    TOOL_NAMES[server].map((name) => ({
      name,
      description: `${name} on ${server}`,
      inputSchema: {
        type: 'object',
        properties: { input: { type: 'string', description: `Input for ${name}` } },
        required: ['input'],
      },
    })),
  ) as Record<string, unknown>;
  const entries = Object.entries(catalog);
  return Object.fromEntries(reverseKeys ? entries.reverse() : entries);
}

interface Scenario {
  picker: string[];
  reverseKeys?: boolean;
  specServers?: string[];
  failServer?: Server;
}

interface Assembled {
  agent: Record<string, unknown>;
  toolNames: string[];
  instructions: string;
}

async function assemble(provider: Providers, scenario: Scenario): Promise<Assembled> {
  const { picker, reverseKeys = false, specServers, failServer } = scenario;
  const deps: LoadAgentDeps = {
    getAgent: async () => null,
    getMCPServerTools: async (_userId, serverName) =>
      serverName === failServer ? null : catalogFor(serverName as Server, reverseKeys),
  };
  const req = {
    user: { id: 'user-1' },
    config: specServers
      ? { modelSpecs: { list: [{ name: 'pinned', mcpServers: specServers }] } }
      : {},
    body: {
      ephemeralAgent: {
        mcp: picker,
        web_search: true,
        execute_code: true,
        file_search: true,
        memory: true,
      },
    },
  } as unknown as Parameters<typeof loadEphemeralAgent>[0]['req'];

  const ephemeral = await loadEphemeralAgent(
    {
      req,
      spec: specServers ? 'pinned' : undefined,
      endpoint: 'custom',
      model_parameters: { model: 'm' } as never,
    },
    deps,
  );
  const tools = [...(ephemeral?.tools ?? []), ACTION_TOOL];

  const toolOptions = Object.fromEntries(
    [...DEFERRED].map((name) => [name, { defer_loading: true }]),
  );
  const loaded = await loadToolDefinitions(
    {
      userId: 'user-1',
      agentId: 'agent_stable',
      tools,
      provider,
      toolOptions,
      deferredToolsEnabled: true,
      mcpServerNames: [...SERVERS],
      rawServerNames: [...SERVERS],
    },
    {
      getOrFetchMCPServerTools: async (_userId, serverName) =>
        serverName === failServer ? null : (catalogFor(serverName as Server, reverseKeys) as never),
      isBuiltInTool: (name) => getToolDefinition(name) != null,
      getActionToolDefinitions: async () => [
        {
          name: ACTION_TOOL,
          description: 'Gets a forecast',
          parameters: { type: 'object', properties: { city: { type: 'string' } } },
        },
      ],
    },
  );

  /** Same registrars, same order as `initializeAgent`. */
  let toolDefinitions = loaded.toolDefinitions as LCTool[];
  const code = registerCodeExecutionTools({
    toolRegistry: loaded.toolRegistry,
    toolDefinitions,
    includeBash: true,
    includeSkillFileInstructions: false,
    enableToolOutputReferences: true,
  });
  toolDefinitions = code.toolDefinitions;
  toolDefinitions = registerMemoryTools({
    toolRegistry: loaded.toolRegistry,
    toolDefinitions,
  }).toolDefinitions;
  toolDefinitions = registerFileAuthoringTools({
    toolRegistry: loaded.toolRegistry,
    toolDefinitions,
    includeSkillFileInstructions: false,
  }).toolDefinitions;

  const agent: Record<string, unknown> = {
    id: 'agent_stable',
    name: 'Stable Agent',
    instructions: 'You are a careful assistant.',
    additional_instructions: 'Answer in the language of the user.',
    tools: [],
    toolDefinitions,
    toolRegistry: loaded.toolRegistry,
    hasDeferredTools: loaded.hasDeferredTools,
    subagents: { enabled: true, allowSelf: true },
    maxContextTokens: 100000,
  };
  const manager = Object.create(MCPManager.prototype) as MCPManager;
  await applyContextToAgent({
    agent: agent as never,
    sharedRunContext: '',
    mcpManager: manager,
    ephemeralAgent: req.body?.ephemeralAgent,
  });

  return {
    agent,
    toolNames: toolDefinitions.map((def) => def.name),
    instructions: String(agent.instructions),
  };
}

type ProviderCase = {
  name: string;
  provider: Providers;
  modelParameters: Record<string, unknown>;
};

type Captured = { system: unknown; tools: unknown };

async function capture(providerCase: ProviderCase, assembled: Assembled): Promise<Captured> {
  let captured: Captured | undefined;
  const modelParameters: Record<string, unknown> = { ...providerCase.modelParameters };
  const agent = {
    ...assembled.agent,
    provider: providerCase.provider,
    endpoint: providerCase.provider,
    model_parameters: modelParameters,
  };

  const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : undefined;
    const raw = request ? await request.clone().text() : String(init?.body ?? '{}');
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (providerCase.provider === Providers.GOOGLE) {
      captured = { system: body.systemInstruction, tools: body.tools };
    } else if (providerCase.provider === Providers.ANTHROPIC) {
      captured = { system: body.system, tools: body.tools };
    } else {
      const messages = body.messages as Array<{ role: string }>;
      captured = {
        system: messages.filter((message) => message.role === 'system'),
        tools: body.tools,
      };
    }
    throw new Error(CAPTURED);
  });
  if (providerCase.provider === Providers.BEDROCK) {
    modelParameters.client = {
      send: async (command: { input: Record<string, unknown> }) => {
        captured = { system: command.input.system, tools: command.input.toolConfig };
        throw new Error(CAPTURED);
      },
      config: {},
      destroy: () => undefined,
      middlewareStack: { add: () => undefined, use: () => undefined },
    };
  }

  try {
    const messages = [new HumanMessage('Hello')];
    const runId = `tool-order-${providerCase.name}-${Math.random()}`;
    const run = await createRun({
      agents: [agent] as never,
      messages: [] as never,
      runId,
      signal: new AbortController().signal,
      streaming: false,
      streamUsage: false,
    });
    await run
      .processStream(
        { messages: messages as never },
        { configurable: { thread_id: runId }, version: 'v2' },
      )
      .catch(() => undefined);
  } finally {
    fetchMock.mockRestore();
  }
  if (captured == null) {
    throw new Error(`No request captured for ${providerCase.name}`);
  }
  return captured;
}

const toolNamesIn = (tools: unknown): string[] =>
  [...JSON.stringify(tools).matchAll(/"name":"([^"]+)"/g)].map((match) => match[1]);

const MCP_ALPHA = ['fetch_page_mcp_alpha', 'list_sources_mcp_alpha', 'search_docs_mcp_alpha'];
const MCP_BETA = ['describe_table_mcp_beta', 'list_tables_mcp_beta', 'run_query_mcp_beta'];
const MCP_GAMMA = ['close_ticket_mcp_gamma', 'create_ticket_mcp_gamma'];

/**
 * Explicit group order of the final definitions list: MCP tools (sorted by
 * server, then tool), `tool_search`, actions, ephemeral built-ins in their
 * existing order, then the capability registrars in `initializeAgent` order.
 * Only the MCP group is sorted; every other group keeps the order it had before.
 */
const EXPECTED_ORDER = [
  'ping_mcp_a_b',
  ...MCP_ALPHA,
  ...MCP_BETA,
  ...MCP_GAMMA,
  'tool_search',
  ACTION_TOOL,
  Tools.file_search,
  Tools.web_search,
  'read_file',
  'bash_tool',
  'set_memory',
  'delete_memory',
  'create_file',
  'edit_file',
];

/** Deferred tools are discoverable through `tool_search` and are not sent; `subagent` is added by `createRun`. */
const PAYLOAD_ORDER = [...EXPECTED_ORDER.filter((name) => !DEFERRED.has(name)), 'subagent'];

const PICKER_ORDERS: string[][] = [
  ['alpha', 'beta', 'gamma', 'a_b'],
  ['gamma', 'a_b', 'beta', 'alpha'],
  ['beta', 'alpha', 'a_b', 'gamma', 'beta'],
];

const PROVIDERS: ProviderCase[] = [
  {
    name: 'openAI',
    provider: Providers.OPENAI,
    modelParameters: { model: 'gpt-4.1', apiKey: 'test-key', maxRetries: 0 },
  },
  {
    name: 'custom OpenAI-compatible',
    provider: Providers.OPENAI,
    modelParameters: {
      model: 'local-model',
      apiKey: 'test-key',
      maxRetries: 0,
      configuration: { baseURL: 'https://compat.invalid/v1' },
    },
  },
  {
    name: 'anthropic with promptCache',
    provider: Providers.ANTHROPIC,
    modelParameters: {
      model: 'claude-sonnet-4-5',
      apiKey: 'test-key',
      maxRetries: 0,
      promptCache: true,
    },
  },
  {
    name: 'bedrock with promptCache',
    provider: Providers.BEDROCK,
    modelParameters: {
      model: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
      region: 'us-east-1',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      maxRetries: 0,
      promptCache: true,
    },
  },
  {
    name: 'google',
    provider: Providers.GOOGLE,
    modelParameters: { model: 'gemini-2.5-flash', apiKey: 'test-key', maxRetries: 0 },
  },
];

describe('definition assembly order', () => {
  it('sorts the MCP group and keeps the built-in group order', async () => {
    const { toolNames } = await assemble(Providers.OPENAI, { picker: PICKER_ORDERS[1] });
    expect(toolNames).toEqual(EXPECTED_ORDER);
  });

  it('is identical for every picker order and tool map key order', async () => {
    const baseline = (await assemble(Providers.OPENAI, { picker: PICKER_ORDERS[0] })).toolNames;
    for (const picker of PICKER_ORDERS) {
      for (const reverseKeys of [false, true]) {
        const result = await assemble(Providers.OPENAI, { picker, reverseKeys });
        expect(result.toolNames).toEqual(baseline);
      }
    }
  });

  it('keeps a failed server as an ordered placeholder without moving other tools', async () => {
    const result = await assemble(Providers.OPENAI, {
      picker: PICKER_ORDERS[1],
      failServer: 'beta',
    });
    expect(result.toolNames.filter((name) => name.includes('_mcp_'))).toEqual([
      'ping_mcp_a_b',
      ...MCP_ALPHA,
      ...MCP_GAMMA,
    ]);
    const baseline = await assemble(Providers.OPENAI, {
      picker: PICKER_ORDERS[0],
      failServer: 'beta',
    });
    expect(result.toolNames).toEqual(baseline.toolNames);
  });

  it('orders spec-pinned servers together with the picker selection', async () => {
    const merged = await assemble(Providers.OPENAI, {
      picker: ['gamma', 'alpha'],
      specServers: ['beta', 'a_b'],
    });
    const plain = await assemble(Providers.OPENAI, { picker: PICKER_ORDERS[0] });
    expect(merged.toolNames).toEqual(plain.toolNames);
    expect(merged.instructions).toBe(plain.instructions);
  });

  it('orders MCP instructions by server name', async () => {
    const first = await assemble(Providers.OPENAI, { picker: PICKER_ORDERS[0] });
    const second = await assemble(Providers.OPENAI, { picker: PICKER_ORDERS[1] });
    expect(second.instructions).toBe(first.instructions);
    const positions = ['a_b', 'alpha', 'beta', 'gamma'].map((name) =>
      first.instructions.indexOf(`## ${name} MCP Server Instructions`),
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});

describe('provider payload tool order stability', () => {
  describe.each(PROVIDERS.map((providerCase) => [providerCase.name, providerCase] as const))(
    '%s',
    (_name, providerCase) => {
      let baseline: Captured;

      beforeAll(async () => {
        baseline = await capture(
          providerCase,
          await assemble(providerCase.provider, { picker: PICKER_ORDERS[0] }),
        );
      });

      it('serializes the expected tool group order', () => {
        const names = toolNamesIn(baseline.tools);
        expect(names).toEqual(PAYLOAD_ORDER);
        expect(JSON.stringify(baseline.system)).toContain('## alpha MCP Server Instructions');
      });

      it.each(PICKER_ORDERS.slice(1).map((order, i) => [i + 1, order] as const))(
        'keeps tools and system identical for picker order %i',
        async (_index, picker) => {
          const next = await capture(
            providerCase,
            await assemble(providerCase.provider, { picker }),
          );
          expect(JSON.stringify(next.tools)).toBe(JSON.stringify(baseline.tools));
          expect(JSON.stringify(next.system)).toBe(JSON.stringify(baseline.system));
        },
      );

      it('keeps tools and system identical when tool map keys are shuffled', async () => {
        const next = await capture(
          providerCase,
          await assemble(providerCase.provider, {
            picker: PICKER_ORDERS[1],
            reverseKeys: true,
          }),
        );
        expect(JSON.stringify(next.tools)).toBe(JSON.stringify(baseline.tools));
        expect(JSON.stringify(next.system)).toBe(JSON.stringify(baseline.system));
      });

      it('keeps tools and system identical on a repeated turn', async () => {
        const next = await capture(
          providerCase,
          await assemble(providerCase.provider, { picker: PICKER_ORDERS[0] }),
        );
        expect(JSON.stringify(next.tools)).toBe(JSON.stringify(baseline.tools));
        expect(JSON.stringify(next.system)).toBe(JSON.stringify(baseline.system));
      });
    },
  );
});
