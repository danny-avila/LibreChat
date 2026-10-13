import { TERMS_NOT_ACCEPTED_CODE } from 'librechat-data-provider';
import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from '@librechat/data-schemas';
import type { AppConfigUserLike, GetAppConfigOptions } from '~/app/service';
import { getAppConfigOptionsFromUser } from '~/app/service';

type TermsUser = AppConfigUserLike & { termsAccepted?: boolean };

export interface TermsAcceptanceGateDependencies {
  getAppConfig: (options: GetAppConfigOptions) => Promise<AppConfig | undefined>;
}

/** Reads never start new processing, so the app can load behind the acceptance modal. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Writes a user must be able to make without having accepted: sign-in flows, accepting, or leaving. */
function isExempt(method: string, pathname: string): boolean {
  if (pathname === '/api/auth' || pathname.startsWith('/api/auth/')) {
    return true;
  }
  if (method === 'POST' && pathname === '/api/user/terms/accept') {
    return true;
  }
  return method === 'DELETE' && pathname === '/api/user/delete';
}

/** The mount point plus the route path, as the two-factor gate reads it; neither carries a query. */
function getPathname(req: Request): string {
  const pathname = `${req.baseUrl ?? ''}${req.path ?? ''}`.toLowerCase().replace(/\/+$/, '');
  return pathname || '/';
}

/**
 * Enforces `interface.termsOfService.modalAcceptance` on the server: an authenticated user who has
 * not accepted the terms may read but not write, so a client that skips the modal cannot start
 * chats, uploads or any other processing. Runs after authentication and reads `termsAccepted` from
 * the user document already on the request; the config is resolved only for a user who has not
 * accepted and is attempting a write.
 */
export function createTermsAcceptanceGate(deps: TermsAcceptanceGateDependencies) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.user as TermsUser | undefined;
    if (
      user == null ||
      user.termsAccepted === true ||
      SAFE_METHODS.has(req.method) ||
      isExempt(req.method, getPathname(req))
    ) {
      next();
      return;
    }

    try {
      const appConfig = await deps.getAppConfig(getAppConfigOptionsFromUser(user));
      if (appConfig?.interfaceConfig?.termsOfService?.modalAcceptance !== true) {
        next();
        return;
      }
    } catch (error) {
      next(error);
      return;
    }

    res.status(403).json({
      code: TERMS_NOT_ACCEPTED_CODE,
      message: 'Terms of service must be accepted before using this feature',
    });
  };
}
