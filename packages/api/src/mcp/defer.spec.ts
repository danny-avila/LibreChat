import { Constants } from 'librechat-data-provider';
import type { AgentToolOptions } from 'librechat-data-provider';
import type { ParsedServerConfig } from '~/mcp/types';
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
  const deferral = () =>
    createMCPOAuthDeferral({
      tools: sheetsTools,
      toolOptions: deferredOptions,
      deferredToolsEnabled: true,
      knownServerNames: ['sheets'],
    });

  it('defers with the catalog the operator declared', () => {
    const tracker = deferral();
    const catalog = tracker.takeDeclaredCatalog('sheets', onUseConfig);

    expect(catalog).toEqual({
      [key('read', 'sheets')]: {
        type: 'function',
        ['function']: {
          name: key('read', 'sheets'),
          description: 'Read a sheet',
          parameters: { type: 'object', properties: {} },
        },
      },
    });
    expect(tracker.isDeferred('sheets')).toBe(true);
  });

  it('keeps the prompt for a server that does not qualify', () => {
    const tracker = deferral();
    const onStart = { ...onUseConfig, oauthPrompt: 'on_start' as const };

    expect(tracker.takeDeclaredCatalog('sheets', onStart)).toBeNull();
    expect(tracker.defer('sheets', onStart)).toBe(false);
    expect(tracker.isDeferred('sheets')).toBe(false);
  });

  it('records a server deferred with its own catalog', () => {
    const tracker = deferral();

    expect(tracker.defer('sheets', onUseConfig)).toBe(true);
    expect(tracker.isDeferred('sheets')).toBe(true);
  });
});
