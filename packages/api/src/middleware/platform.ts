import { logger, SystemCapabilities } from '@librechat/data-schemas';
import type { NextFunction, Response } from 'express';
import type { Types, ClientSession } from 'mongoose';
import type { ResolvedPrincipal } from '~/types/principal';
import type { ServerRequest } from '~/types/http';
import type { CapabilityUser } from './capabilities';
import { getCachedPrincipals } from './capabilities';

interface PlatformAdminDeps {
  getUserPrincipals: (
    params: { userId: string | Types.ObjectId; role?: string | null },
    session?: ClientSession,
  ) => Promise<ResolvedPrincipal[]>;
  hasCapabilityForPrincipals: (params: {
    principals: ResolvedPrincipal[];
    capability: typeof SystemCapabilities.ACCESS_ADMIN;
    tenantId?: string;
  }) => Promise<boolean>;
}

function toCapabilityUser(req: ServerRequest): CapabilityUser | null {
  const user = req.user;
  if (!user) {
    return null;
  }
  const id = user.id ?? user._id?.toString();
  if (!id) {
    return null;
  }
  return {
    id,
    role: user.role ?? '',
    tenantId: (user as CapabilityUser).tenantId,
  };
}

export function generatePlatformAdminCheck(deps: PlatformAdminDeps) {
  const { getUserPrincipals, hasCapabilityForPrincipals } = deps;

  async function isPlatformAdmin(user: CapabilityUser): Promise<boolean> {
    if (user.tenantId) {
      return false;
    }
    const principals =
      getCachedPrincipals(user) ?? (await getUserPrincipals({ userId: user.id, role: user.role }));
    return hasCapabilityForPrincipals({
      principals,
      capability: SystemCapabilities.ACCESS_ADMIN,
      tenantId: undefined,
    });
  }

  function requirePlatformAdmin() {
    return async (req: ServerRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const capabilityUser = toCapabilityUser(req);
        if (!capabilityUser) {
          res.status(401).json({ message: 'Authentication required' });
          return;
        }
        if (await isPlatformAdmin(capabilityUser)) {
          next();
          return;
        }
        logger.warn(
          `[requirePlatformAdmin] Forbidden: user ${capabilityUser.id} is not a platform admin`,
        );
        res.status(403).json({ message: 'Forbidden: platform admin privileges required' });
      } catch (err) {
        logger.error('[requirePlatformAdmin] Error checking platform admin status', err);
        res.status(500).json({ message: 'Internal Server Error' });
      }
    };
  }

  return { isPlatformAdmin, requirePlatformAdmin };
}

export type IsPlatformAdminFn = ReturnType<typeof generatePlatformAdminCheck>['isPlatformAdmin'];
export type RequirePlatformAdminFn = ReturnType<
  typeof generatePlatformAdminCheck
>['requirePlatformAdmin'];
