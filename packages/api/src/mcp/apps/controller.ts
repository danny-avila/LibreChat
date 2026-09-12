import type { PluginAuthMethods, TokenMethods } from '@librechat/data-schemas';
import type { Request, RequestHandler, Response } from 'express';
import type { MCPAppsProxyManager, AuthenticatedMCPAppUser } from '../apps';
import type { UpstreamTokenProvider } from '../oauth/obo';
import type { FlowStateManager } from '~/flow/manager';
import type { MCPOAuthTokens } from '../oauth';
import type * as t from '../types';
import {
  readAppResource,
  listAppResources,
  listAppResourceTemplates,
  callAppTool,
  buildAppProxyErrorResponse,
  isDeniedAppRequest,
  resolveAppRequestContext,
} from '../apps';
import { buildSandboxResponse } from '../sandbox';

interface MCPAppsBody {
  serverName?: unknown;
  uri?: unknown;
  cursor?: unknown;
  toolName?: unknown;
  arguments?: unknown;
}

interface MCPAppsConfig {
  mcpSettings?: { apps?: boolean };
}

type MCPAppsRequest = Request<object, object, MCPAppsBody> & {
  user?: AuthenticatedMCPAppUser;
  config?: MCPAppsConfig;
};

interface Logger {
  error(message: string, error?: unknown): void;
}

export interface MCPAppsControllerDependencies {
  logger: Logger;
  sandboxPath: string;
  getManager: () => MCPAppsProxyManager;
  getFlowManager: () => FlowStateManager<MCPOAuthTokens | null>;
  getAppConfig: (request: MCPAppsRequest) => Promise<MCPAppsConfig | undefined>;
  resolveConfigServers: (request: MCPAppsRequest) => Promise<Record<string, t.ParsedServerConfig>>;
  findPluginAuthsByKeys: PluginAuthMethods['findPluginAuthsByKeys'];
  tokenMethods: TokenMethods;
  createOAuthCredentialsChanging: (
    request: MCPAppsRequest,
  ) => NonNullable<t.UserConnectionContext['onOAuthCredentialsChanging']>;
  createUpstreamTokenProvider: (
    request: MCPAppsRequest,
    response: Response,
    user: AuthenticatedMCPAppUser,
  ) => UpstreamTokenProvider;
}

type AppProxy = (
  manager: MCPAppsProxyManager,
  context: Awaited<ReturnType<typeof resolveAppRequestContext>>,
  body: MCPAppsBody,
) => Promise<unknown>;

interface AppProxyOptions {
  label: string;
  fallback: string;
  proxy: AppProxy;
  logExpectedErrors?: boolean;
}

function getServerName(body: MCPAppsBody): string {
  if (typeof body.serverName !== 'string' || body.serverName.length === 0) {
    return '';
  }
  return body.serverName;
}

function attachCancellation(
  request: MCPAppsRequest,
  response: Response,
): {
  signal: AbortSignal;
  dispose: () => void;
} {
  const controller = new AbortController();
  const abort = () => {
    if (!response.writableEnded && !controller.signal.aborted) {
      controller.abort(new Error('MCP App request cancelled'));
    }
  };
  request.once('aborted', abort);
  response.once('close', abort);
  return {
    signal: controller.signal,
    dispose: () => {
      request.off('aborted', abort);
      response.off('close', abort);
    },
  };
}

function canWriteResponse(response: Response): boolean {
  return !response.headersSent && !response.writableEnded && !response.destroyed;
}

export function createMCPAppsController(dependencies: MCPAppsControllerDependencies): {
  readMCPResource: RequestHandler;
  listMCPResources: RequestHandler;
  listMCPResourceTemplates: RequestHandler;
  appToolCall: RequestHandler;
  serveMCPSandbox: RequestHandler;
  requireMCPAppsEnabled: RequestHandler;
} {
  const sendError = (
    response: Response,
    error: unknown,
    options: Omit<AppProxyOptions, 'proxy'>,
  ) => {
    if (options.logExpectedErrors || !isDeniedAppRequest(error)) {
      dependencies.logger.error(`[${options.label}] Error:`, error);
    }
    if (!canWriteResponse(response)) {
      return;
    }
    const { status, body } = buildAppProxyErrorResponse(error, options.fallback);
    response.status(status).json(body);
  };

  const createProxyHandler =
    (options: AppProxyOptions): RequestHandler =>
    async (baseRequest, response): Promise<void> => {
      const request = baseRequest as MCPAppsRequest;
      if (!request.user?.id) {
        response.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const cancellation = attachCancellation(request, response);
      try {
        const body = request.body ?? {};
        const serverName = getServerName(body);
        const context = await resolveAppRequestContext({
          user: request.user,
          serverName,
          resolveConfigServers: () => dependencies.resolveConfigServers(request),
          findPluginAuthsByKeys: dependencies.findPluginAuthsByKeys,
          flowManager: dependencies.getFlowManager(),
          tokenMethods: dependencies.tokenMethods,
          onOAuthCredentialsChanging: dependencies.createOAuthCredentialsChanging(request),
          upstreamTokenProvider: dependencies.createUpstreamTokenProvider(
            request,
            response,
            request.user,
          ),
          signal: cancellation.signal,
        });
        const result = await options.proxy(dependencies.getManager(), context, body);
        if (canWriteResponse(response)) {
          response.json(result);
        }
      } catch (error) {
        if (!cancellation.signal.aborted) {
          sendError(response, error, options);
        }
      } finally {
        cancellation.dispose();
      }
    };

  const readMCPResource = createProxyHandler({
    label: 'readMCPResource',
    fallback: 'Failed to read resource',
    proxy: (manager, context, body) => readAppResource(manager, context, body.uri),
  });
  const listMCPResources = createProxyHandler({
    label: 'listMCPResources',
    fallback: 'Failed to list resources',
    proxy: (manager, context, body) => listAppResources(manager, context, body.cursor),
  });
  const listMCPResourceTemplates = createProxyHandler({
    label: 'listMCPResourceTemplates',
    fallback: 'Failed to list resource templates',
    proxy: (manager, context, body) => listAppResourceTemplates(manager, context, body.cursor),
  });
  const appToolCall = createProxyHandler({
    label: 'appToolCall',
    fallback: 'Failed to execute tool',
    logExpectedErrors: true,
    proxy: (manager, context, body) => callAppTool(manager, context, body.toolName, body.arguments),
  });

  const serveMCPSandbox: RequestHandler = async (request, response): Promise<void> => {
    try {
      const { headers, body } = buildSandboxResponse({
        sandboxPath: dependencies.sandboxPath,
        csp: typeof request.query.csp === 'string' ? request.query.csp : undefined,
      });
      for (const [name, value] of Object.entries(headers)) {
        response.setHeader(name, value);
      }
      response.send(body);
    } catch (error) {
      dependencies.logger.error('[serveMCPSandbox] Error:', error);
      if (response.headersSent) {
        response.end();
        return;
      }
      response.status(500).json({ error: 'Failed to load MCP sandbox' });
    }
  };

  const requireMCPAppsEnabled: RequestHandler = async (
    baseRequest,
    response,
    next,
  ): Promise<void> => {
    const request = baseRequest as MCPAppsRequest;
    try {
      const appConfig = request.config ?? (await dependencies.getAppConfig(request));
      request.config = appConfig;
      if (appConfig?.mcpSettings?.apps === false) {
        response.status(403).json({ error: 'MCP Apps are disabled' });
        return;
      }
      next();
    } catch (error) {
      dependencies.logger.error('[requireMCPAppsEnabled] Error:', error);
      response.status(500).json({ error: 'Failed to resolve MCP Apps configuration' });
    }
  };

  return {
    readMCPResource,
    listMCPResources,
    listMCPResourceTemplates,
    appToolCall,
    serveMCPSandbox,
    requireMCPAppsEnabled,
  };
}
