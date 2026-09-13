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
  aborted: boolean;
  complete: boolean;
  destroyed: boolean;
  body: Record<string, unknown>;
  query: Record<string, unknown>;
  user?: { id: string; role?: string };
  config?: {
    mcpSettings?: { apps?: boolean };
    mcpConfig?: Record<string, { type?: string; command?: string; args?: string[] }>;
  };
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
    aborted: false,
    complete: true,
    destroyed: false,
    body: { serverName: 'srv', serverBinding: 'binding', uri: 'ui://view' },
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
    sandboxFrameAncestors: 'https://host.example.com',
    readSandboxFile: jest.fn(() => '<script>/*__CSP_APPLIED__*/ /*__VIEW_CSP__*/</script>'),
    getManager: jest.fn(() => manager),
    getFlowManager: jest.fn(
      () => ({}) as ReturnType<MCPAppsControllerDependencies['getFlowManager']>,
    ),
    getAppConfig: jest.fn(async () => ({
      mcpSettings: { apps: true },
      mcpConfig: { srv: { type: 'stdio', command: 'test', args: [] } },
    })),
    getSandboxCspLimits: jest.fn(async () => ({
      maxSourcesPerDirective: 32,
      maxSerializedLength: 4096,
    })),
    ensureConfigServers: jest.fn(async () => ({
      srv: { type: 'stdio', command: 'test', args: [] },
    })),
    getAllServerConfigs: jest.fn(async () => ({
      srv: { type: 'stdio', command: 'effective', args: [] },
    })),
    recoverServerConfig: jest.fn(async (_serverName, config) => config),
    isAppServerConfig: jest.fn(async () => false),
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
  validateAppBinding: jest.fn(),
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

  it('validates a persisted binding through the admitted target context', async () => {
    const manager = makeManager();
    manager.validateAppBinding.mockResolvedValue({ valid: true });
    const { dependencies } = makeDependencies(manager);
    const controller = createMCPAppsController(dependencies);
    const request = makeRequest();
    const response = makeResponse();

    await controller.validateMCPApp(
      asHandlerRequest(request),
      asHandlerResponse(response),
      jest.fn(),
    );

    expect(manager.validateAppBinding).toHaveBeenCalledWith(
      expect.objectContaining({ serverName: 'srv', serverBinding: 'binding' }),
    );
    expect(response.json).toHaveBeenCalledWith({ valid: true });
  });

  it('reuses the admitted config snapshot for manager resolution', async () => {
    const manager = makeManager();
    manager.readResource.mockResolvedValue({ contents: [] });
    const { dependencies, provider, onOAuthCredentialsChanging } = makeDependencies(manager);
    const controller = createMCPAppsController(dependencies);
    const request = makeRequest();
    const response = makeResponse();
    const next = jest.fn();

    await controller.requireMCPAppsEnabled(
      asHandlerRequest(request),
      asHandlerResponse(response),
      next,
    );

    await controller.readMCPResource(
      asHandlerRequest(request),
      asHandlerResponse(response),
      jest.fn(),
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(dependencies.getAppConfig).toHaveBeenCalledTimes(1);
    expect(dependencies.ensureConfigServers).toHaveBeenCalledWith({
      srv: { type: 'stdio', command: 'test', args: [] },
    });
    expect(dependencies.getAllServerConfigs).toHaveBeenCalledWith(
      'user-1',
      { srv: { type: 'stdio', command: 'test', args: [] } },
      'USER',
    );
    expect(dependencies.recoverServerConfig).not.toHaveBeenCalled();
    expect(manager.readResource).toHaveBeenCalledWith(
      expect.objectContaining({
        serverName: 'srv',
        serverBinding: 'binding',
        uri: 'ui://view',
        user: request.user,
        connectionTarget: {
          serverConfig: { type: 'stdio', command: 'effective', args: [] },
          connectionOwner: 'principal',
        },
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
    const request = makeRequest({
      config: {
        mcpSettings: { apps: true },
        mcpConfig: { srv: { type: 'stdio', command: 'test', args: [] } },
      },
    });
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

  it('does not mistake a fully consumed request for a lost response transport', async () => {
    const manager = makeManager();
    manager.readResource.mockResolvedValue({ contents: [] });
    const { dependencies } = makeDependencies(manager);
    const controller = createMCPAppsController(dependencies);
    const request = makeRequest({
      destroyed: true,
      complete: true,
      config: {
        mcpSettings: { apps: true },
        mcpConfig: { srv: { type: 'stdio', command: 'test', args: [] } },
      },
    });
    const response = makeResponse();

    await controller.readMCPResource(
      asHandlerRequest(request),
      asHandlerResponse(response),
      jest.fn(),
    );

    expect(manager.readResource).toHaveBeenCalledTimes(1);
    expect(response.json).toHaveBeenCalledWith({ contents: [] });
  });

  it.each([{ aborted: true }, { destroyed: true, complete: false }])(
    'stops before context work for an already terminated request: %p',
    async (terminal) => {
      const manager = makeManager();
      const { dependencies } = makeDependencies(manager);
      const controller = createMCPAppsController(dependencies);
      const request = makeRequest({
        ...terminal,
        config: {
          mcpSettings: { apps: true },
          mcpConfig: { srv: { type: 'stdio', command: 'test', args: [] } },
        },
      });
      const response = makeResponse();

      await controller.readMCPResource(
        asHandlerRequest(request),
        asHandlerResponse(response),
        jest.fn(),
      );

      expect(dependencies.ensureConfigServers).not.toHaveBeenCalled();
      expect(dependencies.getAllServerConfigs).not.toHaveBeenCalled();
      expect(dependencies.getManager).not.toHaveBeenCalled();
      expect(manager.readResource).not.toHaveBeenCalled();
      expect(response.json).not.toHaveBeenCalled();
      expect(request.listenerCount('aborted')).toBe(0);
      expect(response.listenerCount('close')).toBe(0);
    },
  );

  it('stops before context work when the request terminates during admission', async () => {
    const manager = makeManager();
    const { dependencies } = makeDependencies(manager);
    let finishAdmission!: (value: {
      mcpSettings: { apps: true };
      mcpConfig: { srv: { type: 'stdio'; command: string; args: string[] } };
    }) => void;
    dependencies.getAppConfig = jest.fn(
      () =>
        new Promise((resolve) => {
          finishAdmission = resolve;
        }),
    );
    const controller = createMCPAppsController(dependencies);
    const request = makeRequest();
    const response = makeResponse();
    const next = jest.fn();

    const admission = controller.requireMCPAppsEnabled(
      asHandlerRequest(request),
      asHandlerResponse(response),
      next,
    );
    request.aborted = true;
    finishAdmission({
      mcpSettings: { apps: true },
      mcpConfig: { srv: { type: 'stdio', command: 'test', args: [] } },
    });
    await admission;
    expect(next).toHaveBeenCalledTimes(1);

    await controller.readMCPResource(
      asHandlerRequest(request),
      asHandlerResponse(response),
      jest.fn(),
    );

    expect(dependencies.ensureConfigServers).not.toHaveBeenCalled();
    expect(dependencies.getAllServerConfigs).not.toHaveBeenCalled();
    expect(dependencies.getManager).not.toHaveBeenCalled();
    expect(manager.readResource).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });

  it('stops after cancellation during effective config resolution without manager lookup', async () => {
    const manager = makeManager();
    const { dependencies } = makeDependencies(manager);
    let finishResolution!: (
      value: Record<string, { type: 'stdio'; command: string; args: string[] }>,
    ) => void;
    dependencies.getAllServerConfigs = jest.fn(
      () =>
        new Promise((resolve) => {
          finishResolution = resolve;
        }),
    );
    const controller = createMCPAppsController(dependencies);
    const request = makeRequest({
      config: {
        mcpSettings: { apps: true },
        mcpConfig: { srv: { type: 'stdio', command: 'test', args: [] } },
      },
    });
    const response = makeResponse();

    const handled = controller.readMCPResource(
      asHandlerRequest(request),
      asHandlerResponse(response),
      jest.fn(),
    );
    await Promise.resolve();
    await Promise.resolve();
    request.aborted = true;
    request.emit('aborted');
    finishResolution({ srv: { type: 'stdio', command: 'effective', args: [] } });
    await handled;

    expect(dependencies.getManager).not.toHaveBeenCalled();
    expect(manager.readResource).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
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
    expect(dependencies.ensureConfigServers).not.toHaveBeenCalled();
    expect(dependencies.getAllServerConfigs).not.toHaveBeenCalled();
    expect(manager.readResource).not.toHaveBeenCalled();
  });

  it('fails closed when a proxy handler is invoked without admitted request config', async () => {
    const manager = makeManager();
    const { dependencies } = makeDependencies(manager);
    const controller = createMCPAppsController(dependencies);
    const response = makeResponse();

    await controller.readMCPResource(
      asHandlerRequest(makeRequest()),
      asHandlerResponse(response),
      jest.fn(),
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(dependencies.ensureConfigServers).not.toHaveBeenCalled();
    expect(dependencies.getAllServerConfigs).not.toHaveBeenCalled();
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
      asHandlerRequest(
        makeRequest({
          config: {
            mcpSettings: { apps: true },
            mcpConfig: { srv: { type: 'stdio', command: 'test', args: [] } },
          },
        }),
      ),
      asHandlerResponse(response),
      jest.fn(),
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      error: 'MCP error -32600: Server "srv" is not available to this user.',
    });
    expect(dependencies.logger.error).not.toHaveBeenCalled();
  });

  it('stops before registry and manager work when strict admission config fails', async () => {
    const manager = makeManager();
    const { dependencies } = makeDependencies(manager);
    dependencies.getAppConfig = jest.fn().mockRejectedValue(new Error('config unavailable'));
    const controller = createMCPAppsController(dependencies);
    const response = makeResponse();
    const next = jest.fn();

    await controller.requireMCPAppsEnabled(
      asHandlerRequest(makeRequest()),
      asHandlerResponse(response),
      next,
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
    expect(dependencies.ensureConfigServers).not.toHaveBeenCalled();
    expect(dependencies.getAllServerConfigs).not.toHaveBeenCalled();
    expect(manager.readResource).not.toHaveBeenCalled();
  });

  it('fails closed before manager use when admitted config initialization fails', async () => {
    const manager = makeManager();
    const { dependencies } = makeDependencies(manager);
    dependencies.ensureConfigServers = jest
      .fn()
      .mockRejectedValue(new Error('registry unavailable'));
    const controller = createMCPAppsController(dependencies);
    const request = makeRequest({
      config: {
        mcpSettings: { apps: true },
        mcpConfig: { srv: { type: 'stdio', command: 'scoped' } },
      },
    });
    const response = makeResponse();

    await controller.readMCPResource(
      asHandlerRequest(request),
      asHandlerResponse(response),
      jest.fn(),
    );

    expect(dependencies.ensureConfigServers).toHaveBeenCalledWith({
      srv: { type: 'stdio', command: 'scoped' },
    });
    expect(response.status).toHaveBeenCalledWith(500);
    expect(dependencies.getAllServerConfigs).not.toHaveBeenCalled();
    expect(manager.readResource).not.toHaveBeenCalled();
  });

  it('rejects an unavailable config-tier stub before manager lookup', async () => {
    const manager = makeManager();
    const { dependencies } = makeDependencies(manager);
    const stub = {
      type: 'stdio' as const,
      command: 'test',
      source: 'config' as const,
      inspectionFailed: true,
    };
    dependencies.ensureConfigServers = jest.fn().mockResolvedValue({ srv: stub });
    dependencies.getAllServerConfigs = jest.fn().mockResolvedValue({ srv: stub });
    dependencies.recoverServerConfig = jest.fn().mockResolvedValue(undefined);
    const controller = createMCPAppsController(dependencies);
    const request = makeRequest({
      config: {
        mcpSettings: { apps: true },
        mcpConfig: { srv: { type: 'stdio', command: 'test', args: [] } },
      },
    });
    const response = makeResponse();

    await controller.readMCPResource(
      asHandlerRequest(request),
      asHandlerResponse(response),
      jest.fn(),
    );

    expect(dependencies.recoverServerConfig).toHaveBeenCalledWith('srv', stub, 'user-1');
    expect(dependencies.getManager).not.toHaveBeenCalled();
    expect(manager.readResource).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(400);
  });

  it('passes the recovered YAML target to the manager instead of its failed stub', async () => {
    const manager = makeManager();
    manager.readResource.mockResolvedValue({ contents: [] });
    const { dependencies } = makeDependencies(manager);
    const stub = {
      type: 'sse' as const,
      url: 'https://unavailable.example.com',
      source: 'yaml' as const,
      inspectionFailed: true,
    };
    const recovered = {
      type: 'sse' as const,
      url: 'https://recovered.example.com',
      source: 'yaml' as const,
    };
    dependencies.getAllServerConfigs = jest.fn().mockResolvedValue({ srv: stub });
    dependencies.recoverServerConfig = jest.fn().mockResolvedValue(recovered);
    const controller = createMCPAppsController(dependencies);
    const request = makeRequest({
      config: { mcpSettings: { apps: true }, mcpConfig: {} },
    });
    const response = makeResponse();

    await controller.readMCPResource(
      asHandlerRequest(request),
      asHandlerResponse(response),
      jest.fn(),
    );

    expect(dependencies.recoverServerConfig).toHaveBeenCalledWith('srv', stub, 'user-1');
    expect(manager.readResource).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionTarget: { serverConfig: recovered, connectionOwner: 'principal' },
      }),
    );
    expect(response.json).toHaveBeenCalledWith({ contents: [] });
  });

  it('fails closed when failed-target recovery rejects', async () => {
    const manager = makeManager();
    const { dependencies } = makeDependencies(manager);
    const stub = {
      type: 'sse' as const,
      url: 'https://unavailable.example.com',
      source: 'yaml' as const,
      inspectionFailed: true,
    };
    dependencies.getAllServerConfigs = jest.fn().mockResolvedValue({ srv: stub });
    dependencies.recoverServerConfig = jest.fn().mockRejectedValue(new Error('recovery failed'));
    const controller = createMCPAppsController(dependencies);
    const request = makeRequest({
      config: { mcpSettings: { apps: true }, mcpConfig: {} },
    });
    const response = makeResponse();

    await controller.readMCPResource(
      asHandlerRequest(request),
      asHandlerResponse(response),
      jest.fn(),
    );

    expect(dependencies.getManager).not.toHaveBeenCalled();
    expect(manager.readResource).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(500);
  });

  it('finishes shared failed-target recovery but stops before manager lookup after cancellation', async () => {
    const manager = makeManager();
    const { dependencies } = makeDependencies(manager);
    const stub = {
      type: 'sse' as const,
      url: 'https://unavailable.example.com',
      source: 'yaml' as const,
      inspectionFailed: true,
    };
    const recovered = {
      type: 'sse' as const,
      url: 'https://recovered.example.com',
      source: 'yaml' as const,
    };
    dependencies.getAllServerConfigs = jest.fn().mockResolvedValue({ srv: stub });
    let recoveryStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      recoveryStarted = resolve;
    });
    let finishRecovery!: (value: typeof recovered) => void;
    dependencies.recoverServerConfig = jest.fn(
      () =>
        new Promise((resolve) => {
          finishRecovery = resolve;
          recoveryStarted();
        }),
    );
    const controller = createMCPAppsController(dependencies);
    const request = makeRequest({
      config: { mcpSettings: { apps: true }, mcpConfig: {} },
    });
    const response = makeResponse();

    const handled = controller.readMCPResource(
      asHandlerRequest(request),
      asHandlerResponse(response),
      jest.fn(),
    );
    await started;
    request.aborted = true;
    request.emit('aborted');
    finishRecovery(recovered);
    await handled;

    expect(dependencies.recoverServerConfig).toHaveBeenCalledWith('srv', stub, 'user-1');
    expect(dependencies.getManager).not.toHaveBeenCalled();
    expect(manager.readResource).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
    expect(request.listenerCount('aborted')).toBe(0);
    expect(response.listenerCount('close')).toBe(0);
  });

  it('loads the sandbox document lazily and caches only a successful read', async () => {
    const manager = makeManager();
    const { dependencies } = makeDependencies(manager);
    const controller = createMCPAppsController(dependencies);
    expect(dependencies.readSandboxFile).not.toHaveBeenCalled();

    for (let index = 0; index < 2; index++) {
      await controller.serveMCPSandbox(
        asHandlerRequest(makeRequest()),
        asHandlerResponse(makeResponse()),
        jest.fn(),
      );
    }

    expect(dependencies.readSandboxFile).toHaveBeenCalledTimes(1);
    expect(dependencies.readSandboxFile).toHaveBeenCalledWith('/tmp/mcp-sandbox.html', 'utf8');
    expect(dependencies.getSandboxCspLimits).toHaveBeenCalledTimes(2);
  });

  it('fails closed when trusted sandbox limits cannot be resolved', async () => {
    const manager = makeManager();
    const { dependencies } = makeDependencies(manager);
    dependencies.getSandboxCspLimits = jest.fn(async () => {
      throw new Error('config unavailable');
    });
    const controller = createMCPAppsController(dependencies);
    const response = makeResponse();

    await controller.serveMCPSandbox(
      asHandlerRequest(makeRequest()),
      asHandlerResponse(response),
      jest.fn(),
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.send).not.toHaveBeenCalled();
  });

  it('retries a sandbox document read after a request-time failure', async () => {
    const manager = makeManager();
    const { dependencies } = makeDependencies(manager);
    const readSandboxFile = dependencies.readSandboxFile as jest.Mock;
    readSandboxFile
      .mockImplementationOnce(() => {
        throw new Error('file unavailable');
      })
      .mockReturnValueOnce('<script>/*__CSP_APPLIED__*/ /*__VIEW_CSP__*/</script>');
    const controller = createMCPAppsController(dependencies);
    const failedResponse = makeResponse();
    const recoveredResponse = makeResponse();

    await controller.serveMCPSandbox(
      asHandlerRequest(makeRequest()),
      asHandlerResponse(failedResponse),
      jest.fn(),
    );
    await controller.serveMCPSandbox(
      asHandlerRequest(makeRequest()),
      asHandlerResponse(recoveredResponse),
      jest.fn(),
    );

    expect(failedResponse.status).toHaveBeenCalledWith(500);
    expect(recoveredResponse.send).toHaveBeenCalledWith(
      expect.stringContaining('window.__MCP_SANDBOX_CSP_APPLIED = true;'),
    );
    expect(recoveredResponse.setHeader).toHaveBeenCalledWith(
      'Content-Security-Policy',
      expect.arrayContaining(['frame-ancestors https://host.example.com']),
    );
    expect(readSandboxFile).toHaveBeenCalledTimes(2);
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
