import { Constants } from 'librechat-data-provider';
import type { AgentToolOptions } from 'librechat-data-provider';
import type { LCAvailableTools, ParsedServerConfig } from '~/mcp/types';
import { createMCPOAuthDeferral, shouldDeferMCPOAuthSignIn } from './defer';

const key = (tool: string, server: string) => `${tool}${Constants.mcp_delimiter}${server}`;

const onUseConfig: ParsedServerConfig = {
  type: 'streamable-http',
  url: 'https://sheets.example.com/mcp',
  source: 'yaml',
  requiresOAuth: true,
  oauthPrompt: 'on_use',
  oauthToolCatalog: [{ name: 'read', description: 'Read a sheet' }],
};

const sheetsTools = [key('read', 'sheets'), key('write', 'sheets')];
const deferredOptions: AgentToolOptions = {
  [key('read', 'sheets')]: { defer_loading: true },
  [key('write', 'sheets')]: { defer_loading: true },
};

const decide = (overrides: Partial<Parameters<typeof shouldDeferMCPOAuthSignIn>[0]> = {}) =>
  shouldDeferMCPOAuthSignIn({
    serverName: 'sheets',
    serverConfig: onUseConfig,
    tools: [...sheetsTools, key('list', 'drive')],
    toolOptions: deferredOptions,
    deferredToolsEnabled: true,
    knownServerNames: ['sheets', 'drive'],
    ...overrides,
  });

describe('shouldDeferMCPOAuthSignIn', () => {
  it('defers a server whose selected tools are all deferred', () => {
    expect(decide()).toBe(true);
  });

  it('ignores server pins and tools from other servers', () => {
    expect(
      decide({ tools: [...sheetsTools, key(Constants.mcp_server, 'sheets'), key('x', 'drive')] }),
    ).toBe(true);
  });

  it('keeps the turn-start prompt when any selected tool loads up front', () => {
    expect(decide({ toolOptions: { ...deferredOptions, [key('write', 'sheets')]: {} } })).toBe(
      false,
    );
  });

  it('keeps the turn-start prompt for a whole-server selection', () => {
    expect(decide({ tools: [key(Constants.mcp_all, 'sheets')] })).toBe(false);
  });

  it('keeps the turn-start prompt when only a pin attaches the server', () => {
    expect(decide({ tools: [key(Constants.mcp_server, 'sheets')] })).toBe(false);
  });

  it('keeps the turn-start prompt when deferred tools are disabled', () => {
    expect(decide({ deferredToolsEnabled: false })).toBe(false);
  });

  it('keeps the turn-start prompt unless the server opts in', () => {
    expect(decide({ serverConfig: { ...onUseConfig, oauthPrompt: undefined } })).toBe(false);
    expect(decide({ serverConfig: { ...onUseConfig, oauthPrompt: 'on_start' } })).toBe(false);
  });

  it('keeps the turn-start prompt without a declared catalog', () => {
    expect(decide({ serverConfig: { ...onUseConfig, oauthToolCatalog: undefined } })).toBe(false);
    expect(decide({ serverConfig: { ...onUseConfig, oauthToolCatalog: [] } })).toBe(false);
  });
});

describe('createMCPOAuthDeferral', () => {
  const declaredCatalog: LCAvailableTools = {
    [key('read', 'sheets')]: {
      type: 'function',
      ['function']: {
        name: key('read', 'sheets'),
        description: 'Read a sheet',
        parameters: { type: 'object', properties: {} },
      },
    },
  };

  const create = () => {
    const pendingOAuthServers = new Set(['sheets']);
    const pendingOAuthStarts = new Map<string, unknown>([['sheets', { authURL: 'x' }]]);
    const rememberAvailableTools = jest.fn();
    const tracker = createMCPOAuthDeferral({
      tools: sheetsTools,
      toolOptions: deferredOptions,
      deferredToolsEnabled: true,
      knownServerNames: ['sheets'],
      pendingOAuthServers,
      pendingOAuthStarts,
      rememberAvailableTools,
    });
    return { tracker, pendingOAuthServers, pendingOAuthStarts, rememberAvailableTools };
  };

  it('withdraws the turn-start prompt and offers the declared catalog', () => {
    const { tracker, pendingOAuthServers, pendingOAuthStarts, rememberAvailableTools } = create();

    expect(tracker.deferSignIn('sheets', onUseConfig)).toEqual(declaredCatalog);
    expect(pendingOAuthServers.has('sheets')).toBe(false);
    expect(pendingOAuthStarts.has('sheets')).toBe(false);
    expect(rememberAvailableTools).toHaveBeenCalledWith('sheets', declaredCatalog);
    expect(tracker.hasSignInDecision('sheets')).toBe(true);
  });

  it('keeps the turn-start prompt for a server that does not qualify', () => {
    const { tracker, pendingOAuthServers, rememberAvailableTools } = create();
    const onStart = { ...onUseConfig, oauthPrompt: 'on_start' as const };

    expect(tracker.deferSignIn('sheets', onStart)).toBeNull();
    expect(pendingOAuthServers.has('sheets')).toBe(true);
    expect(rememberAvailableTools).not.toHaveBeenCalled();
  });

  it('defers after a reconnect that found no tools while sign-in is pending', () => {
    const { tracker } = create();

    expect(tracker.resolveReconnectTools('sheets', onUseConfig, {})).toEqual(declaredCatalog);
  });

  it('keeps the tools a reconnect found', () => {
    const { tracker, pendingOAuthServers } = create();

    expect(tracker.resolveReconnectTools('sheets', onUseConfig, declaredCatalog)).toBe(
      declaredCatalog,
    );
    expect(pendingOAuthServers.has('sheets')).toBe(true);
  });

  it('does not defer a reconnect that failed without a pending sign-in', () => {
    const { tracker, pendingOAuthServers } = create();
    pendingOAuthServers.delete('sheets');

    expect(tracker.resolveReconnectTools('sheets', onUseConfig, null)).toBeNull();
    expect(tracker.hasSignInDecision('sheets')).toBe(false);
  });

  it('queues the turn-start prompt only for a server that does not defer', async () => {
    const { tracker } = create();
    const prompt = jest.fn().mockResolvedValue(true);

    await tracker.promptUnlessDeferred('sheets', onUseConfig, prompt);
    expect(prompt).not.toHaveBeenCalled();

    await tracker.promptUnlessDeferred(
      'sheets',
      { ...onUseConfig, oauthPrompt: 'on_start' },
      prompt,
    );
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('records a server deferred with its own catalog', async () => {
    const { tracker, pendingOAuthServers } = create();
    pendingOAuthServers.delete('sheets');

    await tracker.promptUnlessDeferred('sheets', onUseConfig, jest.fn());
    expect(tracker.hasSignInDecision('sheets')).toBe(true);
  });
});
