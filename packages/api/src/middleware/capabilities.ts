import { logger } from '@librechat/data-schemas';
import {
  configCapability,
  SystemCapabilities,
  readConfigCapability,
} from '@librechat/data-schemas';
import type { SystemCapability, ConfigSection } from '@librechat/data-schemas';
import type { NextFunction, Response } from 'express';
import type { Types } from 'mongoose';
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

export type HasConfigCapabilityFn = (
  user: CapabilityUser,
  section: ConfigSection,
  verb?: 'manage' | 'read',
) => Promise<boolean>;

/**
 * Factory that creates `hasCapability` and `requireCapability` with injected
 * database methods. Follows the same dependency-injection pattern as
 * `generateCheckAccess`.
 */
export function generateCapabilityCheck(deps: CapabilityDeps): {
  hasCapability: HasCapabilityFn;
  requireCapability: RequireCapabilityFn;
  hasConfigCapability: HasConfigCapabilityFn;
} {
  const { getUserPrincipals, hasCapabilityForPrincipals } = deps;

  async function hasCapability(
    user: CapabilityUser,
    capability: SystemCapability,
  ): Promise<boolean> {
    const principals = await getUserPrincipals({ userId: user.id, role: user.role });
    return hasCapabilityForPrincipals({ principals, capability, tenantId: user.tenantId });
  }

  /**
   * Checks if a user can manage or read a specific config section.
   * First checks the broad capability (manage:configs / read:configs),
   * then falls back to the section-specific capability (manage:configs:<section>).
   */
  async function hasConfigCapability(
    user: CapabilityUser,
    section: ConfigSection,
    verb: 'manage' | 'read' = 'manage',
  ): Promise<boolean> {
    const broadCap =
      verb === 'manage' ? SystemCapabilities.MANAGE_CONFIGS : SystemCapabilities.READ_CONFIGS;
    if (await hasCapability(user, broadCap)) {
      return true;
    }
    const sectionCap =
      verb === 'manage' ? configCapability(section) : readConfigCapability(section);
    return hasCapability(user, sectionCap);
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

  return { hasCapability, requireCapability, hasConfigCapability };
}
