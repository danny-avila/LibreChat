import { logger } from '@librechat/data-schemas';
import type { Types } from 'mongoose';
import type { NextFunction, Response } from 'express';
import type { SystemCapability } from 'librechat-data-provider';
import type { ServerRequest } from '~/types/http';

interface ResolvedPrincipal {
  principalType: string;
  principalId?: string | Types.ObjectId;
}

interface CapabilityDeps {
  getUserPrincipals: (params: { userId: string; role: string }) => Promise<ResolvedPrincipal[]>;
  hasCapabilityForPrincipals: (params: {
    principals: ResolvedPrincipal[];
    capability: SystemCapability;
    tenantId?: string;
  }) => Promise<boolean>;
}

interface CapabilityUser {
  id: string;
  role: string;
  tenantId?: string;
}

export type HasCapabilityFn = (
  user: CapabilityUser,
  capability: SystemCapability,
) => Promise<boolean>;

export type RequireCapabilityFn = (
  capability: SystemCapability,
) => (req: ServerRequest, res: Response, next: NextFunction) => Promise<unknown>;

/**
 * Factory that creates `hasCapability` and `requireCapability` with injected
 * database methods. Follows the same dependency-injection pattern as
 * `generateCheckAccess`.
 */
export function generateCapabilityCheck(deps: CapabilityDeps): {
  hasCapability: HasCapabilityFn;
  requireCapability: RequireCapabilityFn;
} {
  const { getUserPrincipals, hasCapabilityForPrincipals } = deps;

  async function hasCapability(
    user: CapabilityUser,
    capability: SystemCapability,
  ): Promise<boolean> {
    const principals = await getUserPrincipals({ userId: user.id, role: user.role });
    return hasCapabilityForPrincipals({ principals, capability, tenantId: user.tenantId });
  }

  function requireCapability(capability: SystemCapability) {
    return async (req: ServerRequest, res: Response, next: NextFunction) => {
      try {
        if (!req.user) {
          return res.status(401).json({ message: 'Authentication required' });
        }

        const user: CapabilityUser = {
          id: req.user.id ?? req.user._id?.toString(),
          role: req.user.role ?? '',
          tenantId: (req.user as CapabilityUser).tenantId,
        };

        if (await hasCapability(user, capability)) {
          return next();
        }

        return res.status(403).json({ message: 'Forbidden' });
      } catch (err) {
        logger.error(`[requireCapability] Error checking capability: ${capability}`, err);
        return res.status(500).json({ message: 'Internal Server Error' });
      }
    };
  }

  return { hasCapability, requireCapability };
}
