import { EventEmitter } from 'events';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { RequestHandler, Response } from 'express';
import type { MCPAppsControllerDependencies } from './controller';
import type { MCPAppsProxyManager } from '../apps';
import { createMCPAppsController } from './controller';
import { getPluginAuthMap } from '~/agents/auth';

jest.mock('~/agents/auth', () => ({ getPluginAuthMap: jest.fn() }));

const mockGetPluginAuthMap = getPluginAuthMap as jest.MockedFunction<typeof getPluginAuthMap>;

type MockRequest = EventEmitter & {
  body: Record<string, unknown>;
  query: Record<string, unknown>;
  user?: { id: string; role?: string };
  config?: { mcpSettings?: { apps?: boolean } };
};

type MockResponse = EventEmitter & {
  headersSent: boolean;
  writableEnded: boolean;
  destroyed: boolean;
  status: jest.Mock;
  json: jest.Mock;
  send: jest.Mock;
  setHeader: jest.Mock;
  end: jest.Mock;
};

const makeRequest = (overrides: Partial<MockRequest> = {}): MockRequest =>
  Object.assign(new EventEmitter(), {
    body: { serverName: 'srv', uri: 'ui://view' },
    query: {},
    user: { id: 'user-1', role: 'USER' },
    ...overrides,
  });

const makeResponse = (): MockResponse => {
  const response = Object.assign(new EventEmitter(), {
    headersSent: false,
    writableEnded: false,
    destroyed: false,
    status: jest.fn(),
    json: jest.fn(),
    send: jest.fn(),
    setHeader: jest.fn(),
    end: jest.fn(),
  });
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  response.send.mockReturnValue(response);
  response.end.mockReturnValue(response);
  return response;
};

const asHandlerRequest = (request: MockRequest): Parameters<RequestHandler>[0] =>
  request as unknown as Parameters<RequestHandler>[0];
const asHandlerResponse = (response: MockResponse): Response => response as unknown as Response;

function makeDependencies(manager: MCPAppsProxyManager) {
  const provider = jest.fn();
  const onOAuthCredentialsChanging = jest.fn(async () => async () => undefined);
  const dependencies: MCPAppsControllerDependencies = {
    logger: { error: jest.fn() },
    sandboxPath: '/tmp/mcp-sandbox.html',
    getManager: jest.fn(() => manager),
    getFlowManager: jest.fn(
      () => ({}) as ReturnType<MCPAppsControllerDependencies['getFlowManager']>,
    ),
    getAppConfig: jest.fn(async () => ({ mcpSettings: { apps: true } })),
    resolveConfigServers: jest.fn(async () => ({
      srv: { type: 'stdio', command: 'test' },
    })),
    findPluginAuthsByKeys: jest.fn(),
    tokenMethods: {
      findToken: jest.fn(),
      createToken: jest.fn(),
      updateToken: jest.fn(),
      deleteTokens: jest.fn(),
    },
    createOAuthCredentialsChanging: jest.fn(() => onOAuthCredentialsChanging),
    createUpstreamTokenProvider: jest.fn(() => provider),
  } as unknown as MCPAppsControllerDependencies;
  return { dependencies, provider, onOAuthCredentialsChanging };
}

const makeManager = (): jest.Mocked<MCPAppsProxyManager> => ({
  readResource: jest.fn(),
  listResources: jest.fn(),
  listResourceTemplates: jest.fn(),
  appToolCall: jest.fn(),
});

describe('createMCPAppsController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPluginAuthMap.mockResolvedValue({ mcp_srv: { API_KEY: 'secret' } });
  });

  it('passes the authenticated user, resolved config, provider, and request signal to the manager', async () => {
    const manager = makeManager();
    manager.readResource.mockResolvedValue({ contents: [] });
    const { dependencies, provider, onOAuthCredentialsChanging } = makeDependencies(manager);
    const controller = createMCPAppsController(dependencies);
    const request = makeRequest();
    const response = makeResponse();

    await controller.readMCPResource(
      asHandlerRequest(request),
      asHandlerResponse(response),
      jest.fn(),
    );

    expect(manager.readResource).toHaveBeenCalledWith(
      expect.objectContaining({
        serverName: 'srv',
        uri: 'ui://view',
        user: request.user,
        configServers: { srv: { type: 'stdio', command: 'test' } },
        customUserVars: { API_KEY: 'secret' },
        upstreamTokenProvider: provider,
        onOAuthCredentialsChanging,
        signal: expect.any(AbortSignal),
      }),
    );
    expect(dependencies.createOAuthCredentialsChanging).toHaveBeenCalledWith(request);
    expect(response.json).toHaveBeenCalledWith({ contents: [] });
    expect(request.listenerCount('aborted')).toBe(0);
    expect(response.listenerCount('close')).toBe(0);
  });

  it('aborts the manager operation when the HTTP request closes and does not write afterward', async () => {
    const manager = makeManager();
    let operationStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      operationStarted = resolve;
    });
    let operationSignal: AbortSignal | undefined;
    manager.readResource.mockImplementation(async ({ signal }) => {
      operationSignal = signal;
      operationStarted();
      await new Promise<void>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    });
    const { dependencies } = makeDependencies(manager);
    const controller = createMCPAppsController(dependencies);
    const request = makeRequest();
    const response = makeResponse();

    const handled = controller.readMCPResource(
      asHandlerRequest(request),
      asHandlerResponse(response),
      jest.fn(),
    );
    await started;
    request.emit('aborted');
    await handled;

    expect(operationSignal?.aborted).toBe(true);
    expect(response.json).not.toHaveBeenCalled();
    expect(dependencies.logger.error).not.toHaveBeenCalled();
    expect(request.listenerCount('aborted')).toBe(0);
    expect(response.listenerCount('close')).toBe(0);
  });

  it('rejects unauthenticated requests before resolving config or auth', async () => {
    const manager = makeManager();
    const { dependencies } = makeDependencies(manager);
    const controller = createMCPAppsController(dependencies);
    const response = makeResponse();

    await controller.readMCPResource(
      asHandlerRequest(makeRequest({ user: undefined })),
      asHandlerResponse(response),
      jest.fn(),
    );

    expect(response.status).toHaveBeenCalledWith(401);
    expect(dependencies.resolveConfigServers).not.toHaveBeenCalled();
    expect(manager.readResource).not.toHaveBeenCalled();
  });

  it('returns an ordinary 400 response for a manager authorization rejection', async () => {
    const manager = makeManager();
    manager.readResource.mockRejectedValue(
      new McpError(ErrorCode.InvalidRequest, 'Server "srv" is not available to this user.'),
    );
    const { dependencies } = makeDependencies(manager);
    const controller = createMCPAppsController(dependencies);
    const response = makeResponse();

    await controller.readMCPResource(
      asHandlerRequest(makeRequest()),
      asHandlerResponse(response),
      jest.fn(),
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      error: 'MCP error -32600: Server "srv" is not available to this user.',
    });
    expect(dependencies.logger.error).not.toHaveBeenCalled();
  });

  it('reuses request config and rejects requests when MCP Apps are disabled', async () => {
    const manager = makeManager();
    const { dependencies } = makeDependencies(manager);
    const controller = createMCPAppsController(dependencies);
    const request = makeRequest({ config: { mcpSettings: { apps: false } } });
    const response = makeResponse();
    const next = jest.fn();

    await controller.requireMCPAppsEnabled(
      asHandlerRequest(request),
      asHandlerResponse(response),
      next,
    );

    expect(dependencies.getAppConfig).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects requests when MCP Apps are omitted from the effective config', async () => {
    const manager = makeManager();
    const { dependencies } = makeDependencies(manager);
    dependencies.getAppConfig = jest.fn(async () => ({ mcpSettings: {} }));
    const controller = createMCPAppsController(dependencies);
    const request = makeRequest();
    const response = makeResponse();
    const next = jest.fn();

    await controller.requireMCPAppsEnabled(
      asHandlerRequest(request),
      asHandlerResponse(response),
      next,
    );

    expect(request.config).toEqual({ mcpSettings: {} });
    expect(response.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
