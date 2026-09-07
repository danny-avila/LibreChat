import { logger } from '@librechat/data-schemas';
import type { RequestHandler, Request, Response, NextFunction } from 'express';
import type { AppConfig } from '@librechat/data-schemas';
import type { GetAppConfigOptions } from '../app/service';

export interface ConversationManagementAuthDeps {
  getAppConfig: (options?: GetAppConfigOptions) => Promise<AppConfig>;
  remoteAuth: RequestHandler;
  managementAuth: RequestHandler;
}

function sendUnauthorized(res: Response): void {
  res.status(401).json({ error: 'Unauthorized' });
}

export function createConversationManagementAuth({
  getAppConfig,
  remoteAuth,
  managementAuth,
}: ConversationManagementAuthDeps): RequestHandler {
  const handler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const config = await getAppConfig({ baseOnly: true });
      const mode = config.endpoints?.agents?.conversationApi?.auth;
      if (mode !== 'management' && mode !== 'remote') {
        sendUnauthorized(res);
        return;
      }

      const selected = mode === 'management' ? managementAuth : remoteAuth;
      await Promise.resolve(selected(req, res, next));
    } catch (error) {
      logger.error('[conversationManagementAuth] Failed to resolve authentication policy', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
  return handler as RequestHandler;
}
