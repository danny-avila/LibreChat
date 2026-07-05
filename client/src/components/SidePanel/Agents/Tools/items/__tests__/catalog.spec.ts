import { AgentCapabilities } from 'librechat-data-provider';
import type { BuildCatalogInputs } from '../catalog';
import { makePlugin, makeSkill, makeAction } from 'test/itemFactories';
import { buildCatalog } from '../catalog';

const emptyInputs: BuildCatalogInputs = {
  agentsConfig: { capabilities: [] },
  regularTools: [],
  mcpServersMap: new Map(),
  skills: [],
  actions: [],
  permissions: { mcp: true, skills: true },
};

const toolInputs: BuildCatalogInputs = {
  ...emptyInputs,
  agentsConfig: { capabilities: [AgentCapabilities.tools] },
};

describe('buildCatalog', () => {
  test('returns empty when nothing is enabled', () => {
    expect(buildCatalog(emptyInputs)).toEqual([]);
  });

  test('emits built-in items only for capabilities the admin enabled', () => {
    const items = buildCatalog({
      ...emptyInputs,
      agentsConfig: {
        capabilities: [AgentCapabilities.execute_code, AgentCapabilities.web_search],
      },
    });
    expect(items.filter((i) => i.kind === 'builtin').map((i) => i.id)).toEqual([
      AgentCapabilities.execute_code,
      AgentCapabilities.web_search,
    ]);
  });

  test('emits the memory builtin only when showMemory is set', () => {
    const memoryId = (i: { kind: string; id: string }) =>
      i.kind === 'builtin' && i.id === AgentCapabilities.memory;
    expect(buildCatalog(emptyInputs).find(memoryId)).toBeUndefined();
    expect(buildCatalog({ ...emptyInputs, showMemory: true }).find(memoryId)).toBeDefined();
  });

  test('flags web_search userProvidedAuth from the webSearchUserProvided input', () => {
    const findWebSearch = (inputs: BuildCatalogInputs) =>
      buildCatalog(inputs).find(
        (i) => i.kind === 'builtin' && i.id === AgentCapabilities.web_search,
      );
    const base = {
      ...emptyInputs,
      agentsConfig: { capabilities: [AgentCapabilities.web_search] },
    };
    const userProvided = findWebSearch({ ...base, webSearchUserProvided: true });
    const systemDefined = findWebSearch({ ...base, webSearchUserProvided: false });
    expect(userProvided?.kind === 'builtin' && userProvided.userProvidedAuth).toBe(true);
    expect(systemDefined?.kind === 'builtin' && systemDefined.userProvidedAuth).toBe(false);
  });

  test('hides MCP items when the user lacks MCP permission', () => {
    const map = new Map();
    map.set('srv', { serverName: 'srv', isConfigured: true, tools: [] });
    const items = buildCatalog({
      ...emptyInputs,
      mcpServersMap: map,
      permissions: { mcp: false, skills: true },
    });
    expect(items.find((i) => i.kind === 'mcp')).toBeUndefined();
  });

  test('emits MCP items with tool counts', () => {
    const map = new Map();
    map.set('everything', {
      serverName: 'everything',
      isConfigured: true,
      tools: [{}, {}, {}],
    });
    const items = buildCatalog({ ...emptyInputs, mcpServersMap: map });
    const mcp = items.find((i) => i.kind === 'mcp');
    expect(mcp).toBeDefined();
    if (mcp?.kind === 'mcp') {
      expect(mcp.toolCount).toBe(3);
      expect(mcp.id).toBe('everything');
    }
  });

  test('excludes consume-only MCP servers from the catalog', () => {
    const map = new Map();
    map.set('attachable', { serverName: 'attachable', isConfigured: true, tools: [] });
    map.set('chat-only', {
      serverName: 'chat-only',
      isConfigured: true,
      tools: [],
      consumeOnly: true,
    });
    const items = buildCatalog({ ...emptyInputs, mcpServersMap: map });
    expect(items.filter((i) => i.kind === 'mcp').map((i) => i.id)).toEqual(['attachable']);
  });

  test('emits skill items when permission granted', () => {
    const items = buildCatalog({
      ...emptyInputs,
      skills: [
        makeSkill({ _id: 's1', name: 'Reviewer', description: 'Reviews', category: 'code' }),
      ],
    });
    const skill = items.find((i) => i.kind === 'skill');
    expect(skill?.name).toBe('Reviewer');
  });

  test('emits tool items when the tools capability is enabled', () => {
    const items = buildCatalog({
      ...toolInputs,
      regularTools: [makePlugin({ pluginKey: 'dalle', name: 'DALL-E', description: 'Images' })],
    });
    const tool = items.find((i) => i.kind === 'tool');
    expect(tool?.id).toBe('dalle');
  });

  test('hides tool items when the admin disabled the tools capability', () => {
    const items = buildCatalog({
      ...emptyInputs,
      regularTools: [makePlugin({ pluginKey: 'dalle', name: 'DALL-E', description: 'Images' })],
    });
    expect(items.find((i) => i.kind === 'tool')).toBeUndefined();
  });

  test('marks an auth-requiring, unauthenticated tool as needs_setup', () => {
    const items = buildCatalog({
      ...toolInputs,
      regularTools: [
        makePlugin({
          pluginKey: 'serpapi',
          name: 'SerpApi',
          description: 'Search',
          authConfig: [{ authField: 'SERPAPI_API_KEY', label: 'Key', description: '' }],
          authenticated: false,
        }),
      ],
    });
    const tool = items.find((i) => i.kind === 'tool');
    expect(tool?.status).toBe('needs_setup');
  });

  test('leaves status undefined for an authenticated auth-requiring tool', () => {
    const items = buildCatalog({
      ...toolInputs,
      regularTools: [
        makePlugin({
          pluginKey: 'serpapi',
          name: 'SerpApi',
          description: 'Search',
          authConfig: [{ authField: 'SERPAPI_API_KEY', label: 'Key', description: '' }],
          authenticated: true,
        }),
      ],
    });
    const tool = items.find((i) => i.kind === 'tool');
    expect(tool?.status).toBeUndefined();
  });

  test('leaves status undefined for a tool with no authConfig', () => {
    const items = buildCatalog({
      ...toolInputs,
      regularTools: [makePlugin({ pluginKey: 'dalle', name: 'DALL-E', description: 'Images' })],
    });
    const tool = items.find((i) => i.kind === 'tool');
    expect(tool?.status).toBeUndefined();
  });

  test('flags builtin status from builtinAuthMap', () => {
    const items = buildCatalog({
      ...emptyInputs,
      agentsConfig: { capabilities: [AgentCapabilities.web_search] },
      builtinAuthMap: new Map([[AgentCapabilities.web_search, true]]),
    });
    const builtin = items.find((i) => i.kind === 'builtin');
    expect(builtin?.status).toBe('needs_setup');
  });

  test('marks a skill authored by the current user as ownedByUser', () => {
    const items = buildCatalog({
      ...emptyInputs,
      currentUserId: 'u1',
      skills: [
        makeSkill({ _id: 's1', name: 'Mine', description: '', category: 'code', author: 'u1' }),
        makeSkill({ _id: 's2', name: 'Theirs', description: '', category: 'code', author: 'u2' }),
      ],
    });
    const skills = items.filter((i) => i.kind === 'skill');
    expect(skills.find((s) => s.id === 's1')?.ownedByUser).toBe(true);
    expect(skills.find((s) => s.id === 's2')?.ownedByUser).toBe(false);
  });

  test('leaves ownedByUser false when no currentUserId is provided', () => {
    const items = buildCatalog({
      ...emptyInputs,
      skills: [makeSkill({ _id: 's1', name: 'S1', description: '', author: 'u1' })],
    });
    const skill = items.find((i) => i.kind === 'skill');
    expect(skill?.ownedByUser).toBe(false);
  });

  test('emits action items with endpoint counts', () => {
    const items = buildCatalog({
      ...emptyInputs,
      actions: [
        makeAction({
          action_id: 'a1',
          metadata: { domain: 'linear.app', oauth_client_id: 'x' },
          settings: { paths: { '/issues': {}, '/teams': {} } },
        }),
      ],
    });
    const action = items.find((i) => i.kind === 'action');
    expect(action?.id).toBe('a1');
    if (action?.kind === 'action') {
      expect(action.endpointCount).toBe(2);
    }
  });

  test('returns items in stable order: builtin -> mcp -> tool -> skill -> action', () => {
    const map = new Map();
    map.set('srv', { serverName: 'srv', isConfigured: true, tools: [] });
    const items = buildCatalog({
      ...emptyInputs,
      agentsConfig: { capabilities: [AgentCapabilities.execute_code, AgentCapabilities.tools] },
      regularTools: [makePlugin({ pluginKey: 't1', name: 'T1', description: '' })],
      mcpServersMap: map,
      skills: [makeSkill({ _id: 's1', name: 'S1', description: '' })],
      actions: [
        makeAction({ action_id: 'a1', metadata: { domain: 'd' }, settings: { paths: {} } }),
      ],
    });
    expect(items.map((i) => i.kind)).toEqual(['builtin', 'mcp', 'tool', 'skill', 'action']);
  });
});
