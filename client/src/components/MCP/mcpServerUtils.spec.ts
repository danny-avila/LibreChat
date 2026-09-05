import type { MCPServerStatus } from 'librechat-data-provider';
import {
  getHiddenEmptyServers,
  isMCPServerReadyForAgent,
  resolveHiddenEmptyServers,
  shouldShowActionButton,
} from './mcpServerUtils';

const status = (
  connectionState: MCPServerStatus['connectionState'],
  authorizationState: MCPServerStatus['authorizationState'],
): MCPServerStatus => ({ connectionState, authorizationState, requiresOAuth: false });

describe('isMCPServerReadyForAgent', () => {
  it('treats an authorized idle request-scoped server as ready', () => {
    expect(isMCPServerReadyForAgent(status('disconnected', 'authorized'), true)).toBe(true);
  });

  it('treats an idle request-scoped server without an auth requirement as ready', () => {
    expect(isMCPServerReadyForAgent(status('disconnected', 'not_required'), true)).toBe(true);
  });

  it('keeps request-scoped servers gated while authorization is incomplete or failed', () => {
    expect(isMCPServerReadyForAgent(status('disconnected', 'needs_authorization'), true)).toBe(
      false,
    );
    expect(isMCPServerReadyForAgent(status('error', 'error'), true)).toBe(false);
  });

  it('requires declared custom variables before an on-demand server is ready', () => {
    const missingConfiguration = {
      ...status('disconnected', 'not_required'),
      configurationState: 'needs_configuration' as const,
    };
    const configured = {
      ...missingConfiguration,
      configurationState: 'configured' as const,
    };

    expect(isMCPServerReadyForAgent(missingConfiguration, true, true)).toBe(false);
    expect(isMCPServerReadyForAgent(configured, true, true)).toBe(true);
  });

  it('requires a live connection for servers that are not request-scoped', () => {
    expect(isMCPServerReadyForAgent(status('disconnected', 'not_required'), false)).toBe(false);
    expect(isMCPServerReadyForAgent(status('connected', 'not_required'), false)).toBe(true);
  });
});

describe('shouldShowActionButton', () => {
  it('keeps configuration actionable for an idle request-scoped server', () => {
    const serverStatus: MCPServerStatus = {
      connectionState: 'disconnected',
      authorizationState: 'not_required',
      requiresOAuth: false,
      requestScoped: true,
      configurationState: 'needs_configuration',
    };
    const baseProps = {
      serverName: 'server',
      serverStatus,
      isInitializing: false,
      canCancel: false,
      onCancel: jest.fn(),
      onConfigClick: jest.fn(),
    };

    expect(shouldShowActionButton({ ...baseProps, hasCustomUserVars: true })).toBe(true);
    expect(shouldShowActionButton({ ...baseProps, hasCustomUserVars: false })).toBe(false);
  });
});

describe('getHiddenEmptyServers', () => {
  const definition = (serverName: string, hideWhenEmpty?: boolean) =>
    ({
      serverName,
      config: { type: 'streamable-http', url: 'https://example.com/mcp', hideWhenEmpty },
      effectivePermissions: 1,
    }) as Parameters<typeof getHiddenEmptyServers>[0][number];

  const toolServer = (catalogLoaded: boolean | undefined, toolCount: number) => ({
    name: 'srv',
    icon: '',
    authenticated: true,
    authConfig: [],
    tools: Array.from({ length: toolCount }, (_, i) => ({
      name: `tool-${i}`,
      pluginKey: `tool-${i}_mcp_srv`,
      description: '',
    })),
    ...(catalogLoaded !== undefined && { catalogLoaded }),
  });

  it('hides an opted-in server whose catalog loaded with zero tools', () => {
    const hidden = getHiddenEmptyServers([definition('empty', true)], {
      empty: toolServer(true, 0),
    });
    expect(hidden).toEqual(new Set(['empty']));
  });

  it('keeps servers without the hideWhenEmpty opt-in', () => {
    const hidden = getHiddenEmptyServers([definition('empty')], {
      empty: toolServer(true, 0),
    });
    expect(hidden.size).toBe(0);
  });

  it('keeps an opted-in server whose catalog has tools', () => {
    const hidden = getHiddenEmptyServers([definition('busy', true)], {
      busy: toolServer(true, 2),
    });
    expect(hidden.size).toBe(0);
  });

  it('keeps an opted-in server whose catalog did not load (connection or OAuth pending)', () => {
    const hidden = getHiddenEmptyServers([definition('pending', true)], {
      pending: toolServer(false, 0),
    });
    expect(hidden.size).toBe(0);
  });

  it('keeps an opted-in server absent from the tools response or on legacy backends', () => {
    expect(getHiddenEmptyServers([definition('missing', true)], {}).size).toBe(0);
    expect(
      getHiddenEmptyServers([definition('legacy', true)], {
        legacy: toolServer(undefined, 0),
      }).size,
    ).toBe(0);
    expect(getHiddenEmptyServers([definition('noData', true)], undefined).size).toBe(0);
  });
});

describe('resolveHiddenEmptyServers', () => {
  const definition = (serverName: string, hideWhenEmpty?: boolean) =>
    ({
      serverName,
      config: { type: 'streamable-http', url: 'https://example.com/mcp', hideWhenEmpty },
      effectivePermissions: 1,
    }) as Parameters<typeof resolveHiddenEmptyServers>[0][number];

  const emptyLoadedServer = {
    name: 'srv',
    icon: '',
    authenticated: true,
    authConfig: [],
    tools: [],
    catalogLoaded: true,
  };

  it('fails open: hides nothing when the catalog query errored, even with loaded-empty data', () => {
    const definitions = [definition('empty', true), definition('other', true)];
    expect(resolveHiddenEmptyServers(definitions, { empty: emptyLoadedServer }, true).size).toBe(0);
    expect(resolveHiddenEmptyServers(definitions, undefined, true).size).toBe(0);
  });

  it('keeps flagged servers out of pickers while the catalog is pending, but never unflagged ones', () => {
    const hidden = resolveHiddenEmptyServers(
      [definition('flagged', true), definition('unflagged')],
      undefined,
      false,
    );
    expect(hidden).toEqual(new Set(['flagged']));
  });

  it('hides exactly the flagged loaded-empty servers once the catalog is available', () => {
    const hidden = resolveHiddenEmptyServers(
      [definition('empty', true), definition('unflaggedEmpty')],
      { empty: emptyLoadedServer, unflaggedEmpty: emptyLoadedServer },
      false,
    );
    expect(hidden).toEqual(new Set(['empty']));
  });

  it('returns an empty set when no server opts in, regardless of catalog state', () => {
    expect(resolveHiddenEmptyServers([definition('plain')], undefined, false).size).toBe(0);
  });
});
