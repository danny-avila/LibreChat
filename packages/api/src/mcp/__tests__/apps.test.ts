import { logger } from '@librechat/data-schemas';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { PluginAuthMethods } from '@librechat/data-schemas';
import type { ToolWithMeta } from '../apps';
import {
  buildAppProxyErrorResponse,
  isDeniedAppRequest,
  isToolHiddenFromApp,
  isToolHiddenFromModel,
  resolveAppRequestContext,
} from '../apps';
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

  beforeEach(() => jest.clearAllMocks());

  it('resolves the request config and the server customUserVars together', async () => {
    mockGetPluginAuthMap.mockResolvedValue({ mcp_srv: { API_KEY: 'secret' } });

    const ctx = await resolveAppRequestContext({
      userId: 'user-1',
      serverName: 'srv',
      resolveConfigServers: () =>
        Promise.resolve({ srv: { type: 'sse', url: 'https://a.example.com' } }),
      findPluginAuthsByKeys,
    });

    expect(ctx.configServers).toEqual({ srv: { type: 'sse', url: 'https://a.example.com' } });
    expect(ctx.customUserVars).toEqual({ API_KEY: 'secret' });
    expect(ctx.userId).toBe('user-1');
    expect(ctx.serverName).toBe('srv');
  });

  it('fails closed when config resolution fails', async () => {
    await expect(
      resolveAppRequestContext({
        userId: 'user-1',
        serverName: 'srv',
        resolveConfigServers: () => Promise.reject(new Error('config unavailable')),
        findPluginAuthsByKeys,
      }),
    ).rejects.toThrow('config unavailable');
  });

  it('fails closed when auth-value resolution fails rather than proceeding unresolved', async () => {
    mockGetPluginAuthMap.mockRejectedValue(new Error('db down'));

    await expect(
      resolveAppRequestContext({
        userId: 'user-1',
        serverName: 'srv',
        resolveConfigServers: () => Promise.resolve({}),
        findPluginAuthsByKeys,
      }),
    ).rejects.toThrow('db down');
    expect(logger.error).toHaveBeenCalled();
  });

  it('resolves without customUserVars for a user with no stored vars', async () => {
    mockGetPluginAuthMap.mockResolvedValue({});

    const ctx = await resolveAppRequestContext({
      userId: 'user-1',
      serverName: 'srv',
      resolveConfigServers: () => Promise.resolve({}),
      findPluginAuthsByKeys,
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
});
