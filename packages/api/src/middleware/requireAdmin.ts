import { logger } from '@librechat/data-schemas';
import { SystemRoles } from 'librechat-data-provider';
import type { NextFunction, Request as ServerRequest, Response as ServerResponse } from 'express';

interface UserWithRole {
  role?: string;
  email?: string;
}

interface RequestWithUser extends ServerRequest {
  user?: UserWithRole;
}

/**
 * Middleware to check if authenticated user has admin role.
 * Should be used AFTER authentication middleware (requireJwtAuth, requireLocalAuth, etc.)
 */
export const requireAdmin = (req: RequestWithUser, res: ServerResponse, next: NextFunction) => {
  if (!req.user) {
    logger.warn('[requireAdmin] No user found in request');
    return res.status(401).json({
      error: 'Authentication required',
      error_code: 'AUTHENTICATION_REQUIRED',
    });
  }

  if (!req.user.role || req.user.role !== SystemRoles.ADMIN) {
    logger.debug(`[requireAdmin] Access denied for non-admin user: ${req.user.email}`);
    return res.status(403).json({
      error: 'Access denied: Admin privileges required',
      error_code: 'ADMIN_REQUIRED',
    });
  }

  next();
};
