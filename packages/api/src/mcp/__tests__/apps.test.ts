import { logger } from '@librechat/data-schemas';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { PluginAuthMethods } from '@librechat/data-schemas';
import type { MCPAppRequestContext, MCPAppsProxyManager, ToolWithMeta } from '../apps';
import {
  buildAppProxyErrorResponse,
  callAppTool,
  isDeniedAppRequest,
  isToolHiddenFromApp,
  isToolHiddenFromModel,
  listAppResources,
  listAppResourceTemplates,
  readAppResource,
  resolveAppRequestContext,
} from '../apps';
import { MCPAuthenticationRefreshError, MCPAuthenticationRejectedError } from '../errors';
import { OpenIDReauthRequiredError } from '~/utils/oidc';
import { getPluginAuthMap } from '~/agents/auth';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

jest.mock('~/agents/auth', () => ({ getPluginAuthMap: jest.fn() }));

const tool = (visibility?: unknown): ToolWithMeta =>
  ({
    name: 'do_thing',
    ...(visibility === undefined ? {} : { _meta: { ui: { visibility } } }),
  }) as ToolWithMeta;

describe('tool visibility', () => {
  describe('isToolHiddenFromApp', () => {
    it('treats an absent visibility field as both scopes (not hidden)', () => {
      expect(isToolHiddenFromApp(tool())).toBe(false);
    });

    it('does not hide tools whose explicit visibility includes app', () => {
      expect(isToolHiddenFromApp(tool(['app']))).toBe(false);
      expect(isToolHiddenFromApp(tool(['model', 'app']))).toBe(false);
      expect(isToolHiddenFromApp(tool(['app', 'internal']))).toBe(false);
    });

    it('hides tools whose explicit visibility omits app, including empty/future arrays', () => {
      expect(isToolHiddenFromApp(tool(['model']))).toBe(true);
      expect(isToolHiddenFromApp(tool([]))).toBe(true);
      expect(isToolHiddenFromApp(tool(['model', 'internal']))).toBe(true);
    });
  });

  describe('isToolHiddenFromModel', () => {
    it('treats an absent visibility field as both scopes (not hidden)', () => {
      expect(isToolHiddenFromModel(tool())).toBe(false);
    });

    it('does not hide tools whose explicit visibility includes model', () => {
      expect(isToolHiddenFromModel(tool(['model']))).toBe(false);
      expect(isToolHiddenFromModel(tool(['model', 'app']))).toBe(false);
      expect(isToolHiddenFromModel(tool(['model', 'internal']))).toBe(false);
    });

    it('hides tools whose explicit visibility omits model, including empty/future arrays', () => {
      expect(isToolHiddenFromModel(tool(['app']))).toBe(true);
      expect(isToolHiddenFromModel(tool([]))).toBe(true);
      expect(isToolHiddenFromModel(tool(['app', 'internal']))).toBe(true);
    });
  });
});

describe('resolveAppRequestContext', () => {
  const findPluginAuthsByKeys = jest.fn() as unknown as PluginAuthMethods['findPluginAuthsByKeys'];
  const mockGetPluginAuthMap = getPluginAuthMap as jest.MockedFunction<typeof getPluginAuthMap>;
  const user = { id: 'user-1' } as Parameters<typeof resolveAppRequestContext>[0]['user'];
  const flowManager = {} as Parameters<typeof resolveAppRequestContext>[0]['flowManager'];
  const onOAuthCredentialsChanging = jest.fn(async () => async () => undefined);

  beforeEach(() => jest.clearAllMocks());

  it('resolves the request config and the server customUserVars together', async () => {
    mockGetPluginAuthMap.mockResolvedValue({ mcp_srv: { API_KEY: 'secret' } });

    const ctx = await resolveAppRequestContext({
      user,
      serverName: 'srv',
      resolveConfigServers: () =>
        Promise.resolve({ srv: { type: 'sse', url: 'https://a.example.com' } }),
      findPluginAuthsByKeys,
      flowManager,
      onOAuthCredentialsChanging,
    });

    expect(ctx.configServers).toEqual({ srv: { type: 'sse', url: 'https://a.example.com' } });
    expect(ctx.customUserVars).toEqual({ API_KEY: 'secret' });
    expect(ctx.user).toBe(user);
    expect(ctx.serverName).toBe('srv');
    expect(ctx.onOAuthCredentialsChanging).toBe(onOAuthCredentialsChanging);
  });

  it('fails closed when config resolution fails', async () => {
    await expect(
      resolveAppRequestContext({
        user,
        serverName: 'srv',
        resolveConfigServers: () => Promise.reject(new Error('config unavailable')),
        findPluginAuthsByKeys,
        flowManager,
        onOAuthCredentialsChanging,
      }),
    ).rejects.toThrow('config unavailable');
  });

  it('fails closed when auth-value resolution fails rather than proceeding unresolved', async () => {
    mockGetPluginAuthMap.mockRejectedValue(new Error('db down'));

    await expect(
      resolveAppRequestContext({
        user,
        serverName: 'srv',
        resolveConfigServers: () => Promise.resolve({}),
        findPluginAuthsByKeys,
        flowManager,
        onOAuthCredentialsChanging,
      }),
    ).rejects.toThrow('db down');
    expect(logger.error).toHaveBeenCalled();
  });

  it('resolves without customUserVars for a user with no stored vars', async () => {
    mockGetPluginAuthMap.mockResolvedValue({});

    const ctx = await resolveAppRequestContext({
      user,
      serverName: 'srv',
      resolveConfigServers: () => Promise.resolve({}),
      findPluginAuthsByKeys,
      flowManager,
      onOAuthCredentialsChanging,
    });

    expect(ctx.customUserVars).toBeUndefined();
    expect(ctx.configServers).toEqual({});
  });
});

describe('app proxy error mapping', () => {
  it('treats an InvalidRequest denial as a client error and surfaces its message', () => {
    const denial = new McpError(ErrorCode.InvalidRequest, 'Resource "x" is not permitted.');
    expect(isDeniedAppRequest(denial)).toBe(true);
    expect(buildAppProxyErrorResponse(denial, 'Failed to read resource')).toEqual({
      status: 400,
      body: { error: denial.message },
    });
  });

  it.each([new McpError(ErrorCode.InternalError, 'boom'), new Error('boom'), null, 'boom'])(
    'hides an unexpected failure behind the fallback message: %s',
    (error) => {
      expect(isDeniedAppRequest(error)).toBe(false);
      expect(buildAppProxyErrorResponse(error, 'Failed to read resource')).toEqual({
        status: 500,
        body: { error: 'Failed to read resource' },
      });
    },
  );

  it('returns the established actionable response for expired OpenID sessions', () => {
    const error = new OpenIDReauthRequiredError('Please sign in again.');

    expect(buildAppProxyErrorResponse(error, 'Failed to read resource')).toEqual({
      status: 401,
      body: { error: 'invalid_token', message: 'Please sign in again.' },
    });
    expect(isDeniedAppRequest(error)).toBe(true);
  });

  it('returns bounded authentication rejection and refresh responses', () => {
    const rejected = new MCPAuthenticationRejectedError('srv', true);
    const refresh = new MCPAuthenticationRefreshError();

    expect(buildAppProxyErrorResponse(rejected, 'Failed to read resource')).toEqual({
      status: 403,
      body: {
        error: 'invalid_token',
        code: 'MCP_AUTHENTICATION_REJECTED',
        message:
          'MCP server "srv" rejected the bearer credential. The connection was refreshed; retry the tool deliberately.',
        retryable: true,
        connectionRefreshed: true,
      },
    });
    expect(buildAppProxyErrorResponse(refresh, 'Failed to read resource')).toEqual({
      status: 503,
      body: {
        code: 'MCP_AUTHENTICATION_REFRESH_FAILED',
        message: 'The OpenID session could not refresh the MCP bearer credential temporarily.',
        retryable: true,
      },
    });
  });
});

describe('app proxy input validation', () => {
  const manager = {
    readResource: jest.fn(),
    listResources: jest.fn(),
    listResourceTemplates: jest.fn(),
    appToolCall: jest.fn(),
  } as jest.Mocked<MCPAppsProxyManager>;
  const context = { serverName: 'srv' } as MCPAppRequestContext;

  beforeEach(() => jest.clearAllMocks());

  it('rejects malformed values before calling the manager', async () => {
    await expect(readAppResource(manager, context, 42)).rejects.toMatchObject({
      code: ErrorCode.InvalidRequest,
    });
    await expect(listAppResources(manager, context, 42)).rejects.toMatchObject({
      code: ErrorCode.InvalidRequest,
    });
    await expect(listAppResourceTemplates(manager, context, null)).rejects.toMatchObject({
      code: ErrorCode.InvalidRequest,
    });
    await expect(callAppTool(manager, context, 42, {})).rejects.toMatchObject({
      code: ErrorCode.InvalidRequest,
    });
    await expect(callAppTool(manager, context, 'tool', [])).rejects.toMatchObject({
      code: ErrorCode.InvalidRequest,
    });

    expect(manager.readResource).not.toHaveBeenCalled();
    expect(manager.listResources).not.toHaveBeenCalled();
    expect(manager.listResourceTemplates).not.toHaveBeenCalled();
    expect(manager.appToolCall).not.toHaveBeenCalled();
  });
});
