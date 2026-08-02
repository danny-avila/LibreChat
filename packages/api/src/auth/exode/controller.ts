import { logger } from '@librechat/data-schemas';
import { SystemRoles } from 'librechat-data-provider';
import type { IUser, IPluginAuth, BalanceConfig } from '@librechat/data-schemas';
import type { RequestHandler } from 'express';
import type { ExodeUserDeps } from './user';
import type { ExodeExchangeResponse } from './types';
import { getExodeAuthConfig, getExodeEmbedConfig, EXODE_MCP_AUTH_FIELD } from './config';
import { exchangeExodeBootstrap } from './client';
import { exodeExchangeInputSchema, ExodeExchangeError } from './types';
import { serializeExodeUser, upsertExodeUser } from './user';

interface MCPManager {
  disconnectUserConnection: (userId: string, serverName: string) => Promise<void>;
}

export interface ExodeExchangeDeps extends ExodeUserDeps {
  generateToken: (user: IUser, expiresIn?: number) => Promise<string>;
  updateUserPluginAuth: (
    userId: string,
    authField: string,
    pluginKey: string,
    value: string,
  ) => Promise<IPluginAuth | Error>;
  invalidateCachedTools: (options: { userId: string; serverName: string }) => Promise<void>;
  getMCPManager: () => MCPManager;
  getTenantId: () => string | undefined;
  /**
   * Resolved per request, not at construction: the app config is loaded asynchronously and can
   * change without a restart, so capturing it once would pin the balance settings forever.
   */
  getAppConfig?: (options?: { role?: string }) => Promise<{ balance?: BalanceConfig } | undefined>;
  fetcher?: typeof fetch;
  now?: () => number;
}

function normalizeAndAuthorizeOrigin(origin: string, allowedOrigins: string[]): string {
  let normalized: string;
  try {
    normalized = new URL(origin).origin;
  } catch {
    throw new ExodeExchangeError('INVALID_HANDSHAKE', 400, 'Invalid parent origin');
  }
  if (normalized !== origin || !allowedOrigins.includes(normalized)) {
    throw new ExodeExchangeError('INVALID_HANDSHAKE', 400, 'Parent origin is not allowed');
  }
  return normalized;
}

function sendError(error: ExodeExchangeError, res: Parameters<RequestHandler>[1]) {
  return res.status(error.status).json({
    code: error.code,
    message: error.message,
  });
}

export function createExodeConfigController(): RequestHandler {
  return (_req, res) => res.status(200).json(getExodeEmbedConfig());
}

export function createExodeExchangeController(deps: ExodeExchangeDeps): RequestHandler {
  return async (req, res) => {
    const parsed = exodeExchangeInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        new ExodeExchangeError('INVALID_HANDSHAKE', 400, 'Invalid exchange request'),
        res,
      );
    }

    try {
      const config = getExodeAuthConfig();
      const parentOrigin = normalizeAndAuthorizeOrigin(
        parsed.data.parentOrigin,
        config.allowedOrigins,
      );
      const exchange = await exchangeExodeBootstrap(
        { ...parsed.data, parentOrigin },
        config,
        deps.fetcher,
      );
      /** Same balance settings every other registration path uses (see AuthService.registerUser) */
      const appConfig = await deps.getAppConfig?.({ role: SystemRoles.USER });

      const user = await upsertExodeUser(exchange.identity, config.issuer, deps.getTenantId(), {
        ...deps,
        balanceConfig: appConfig?.balance,
      });
      const userId = String(user._id);
      const pluginKey = `mcp_${config.mcpServerName}`;
      const pluginAuth = await deps.updateUserPluginAuth(
        userId,
        EXODE_MCP_AUTH_FIELD,
        pluginKey,
        exchange.token,
      );
      if (pluginAuth instanceof Error) {
        throw pluginAuth;
      }

      const mcpManager = deps.getMCPManager();
      await Promise.all([
        mcpManager.disconnectUserConnection(userId, config.mcpServerName),
        deps.invalidateCachedTools({ userId, serverName: config.mcpServerName }),
      ]);

      const token = await deps.generateToken(user, config.embedJwtTtlMs);
      const now = deps.now?.() ?? Date.now();
      const response: ExodeExchangeResponse = {
        token,
        tokenExpiresAt: new Date(now + config.embedJwtTtlMs).toISOString(),
        mcpExpiresAt: exchange.expiresAt,
        user: serializeExodeUser(user),
        /** Forwarded verbatim — only exode knows which agents this principal may open */
        agents: exchange.agents,
      };
      return res.status(200).json(response);
    } catch (error) {
      if (error instanceof ExodeExchangeError) {
        return sendError(error, res);
      }
      const details = error instanceof Error ? { name: error.name, message: error.message } : {};
      logger.error('[exodeExchange] Failed to establish embedded session', details);
      return sendError(
        new ExodeExchangeError('INTERNAL_ERROR', 500, 'Failed to establish embedded session'),
        res,
      );
    }
  };
}
