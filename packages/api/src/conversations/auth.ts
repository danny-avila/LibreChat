import { logger } from '@librechat/data-schemas';
import type { RequestHandler, Request, Response, NextFunction } from 'express';
import type { AppConfig } from '@librechat/data-schemas';
import type { GetAppConfigOptions } from '../app/service';

export interface ConversationManagementAuthDeps {
  getAppConfig: (options?: GetAppConfigOptions) => Promise<AppConfig>;
  remoteAuth: (getConfig: ConversationManagementAuthDeps['getAppConfig']) => RequestHandler;
  remoteAccess: RequestHandler;
  managementAuth: (getConfig: ConversationManagementAuthDeps['getAppConfig']) => RequestHandler;
}

function sendUnauthorized(res: Response): void {
  res.status(401).json({ error: 'Unauthorized' });
}

export function createConversationManagementAuth({
  getAppConfig,
  remoteAuth,
  remoteAccess,
  managementAuth,
}: ConversationManagementAuthDeps): RequestHandler {
  const handler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const config = await getAppConfig({ baseOnly: true });
      const getRequestConfig: ConversationManagementAuthDeps['getAppConfig'] = (options) =>
        options?.baseOnly === true && !options.refresh
          ? Promise.resolve(config)
          : getAppConfig(options);
      const mode = config.endpoints?.agents?.conversationApi?.auth;
      if (mode !== 'management' && mode !== 'remote') {
        sendUnauthorized(res);
        return;
      }

      if (mode === 'management') {
        await Promise.resolve(managementAuth(getRequestConfig)(req, res, next));
        return;
      }
      await Promise.resolve(
        remoteAuth(getRequestConfig)(req, res, (error) => {
          if (error) return next(error);
          return Promise.resolve(remoteAccess(req, res, next)).catch(next);
        }),
      );
    } catch (error) {
      logger.error('[conversationManagementAuth] Failed to resolve authentication policy', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
  return handler as RequestHandler;
}
