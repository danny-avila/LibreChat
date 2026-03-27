import { PrincipalType } from 'librechat-data-provider';
import {
  logger,
  isValidObjectIdString,
  SystemCapabilities,
  expandImplications,
} from '@librechat/data-schemas';
import type { ISystemGrant, SystemCapability } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { Types } from 'mongoose';
import type { ServerRequest } from '~/types/http';

const VALID_PRINCIPAL_TYPES = new Set<string>([
  PrincipalType.ROLE,
  PrincipalType.GROUP,
  PrincipalType.USER,
]);

const VALID_CAPABILITIES = new Set<string>(Object.values(SystemCapabilities));

const MANAGE_CAPABILITY_BY_TYPE: Partial<Record<PrincipalType, SystemCapability>> = {
  [PrincipalType.ROLE]: SystemCapabilities.MANAGE_ROLES,
  [PrincipalType.GROUP]: SystemCapabilities.MANAGE_GROUPS,
  [PrincipalType.USER]: SystemCapabilities.MANAGE_USERS,
};

interface ResolvedPrincipal {
  principalType: PrincipalType;
  principalId?: string | Types.ObjectId;
}

export interface AdminGrantsDeps {
  getCapabilitiesForPrincipal: (params: {
    principalType: PrincipalType;
    principalId: string | Types.ObjectId;
    tenantId?: string;
  }) => Promise<ISystemGrant[]>;
  grantCapability: (params: {
    principalType: PrincipalType;
    principalId: string | Types.ObjectId;
    capability: SystemCapability;
    tenantId?: string;
    grantedBy?: string | Types.ObjectId;
  }) => Promise<ISystemGrant | null>;
  revokeCapability: (params: {
    principalType: PrincipalType;
    principalId: string | Types.ObjectId;
    capability: SystemCapability;
    tenantId?: string;
  }) => Promise<void>;
  getUserPrincipals: (params: { userId: string; role: string }) => Promise<ResolvedPrincipal[]>;
  hasCapabilityForPrincipals: (params: {
    principals: ResolvedPrincipal[];
    capability: SystemCapability;
    tenantId?: string;
  }) => Promise<boolean>;
}

export function createAdminGrantsHandlers(deps: AdminGrantsDeps) {
  const {
    getCapabilitiesForPrincipal,
    grantCapability,
    revokeCapability,
    getUserPrincipals,
    hasCapabilityForPrincipals,
  } = deps;

  function resolveUser(req: ServerRequest): { userId: string; role: string } | null {
    const user = req.user;
    if (!user) {
      return null;
    }
    const userId = user._id?.toString();
    if (!userId || !user.role) {
      return null;
    }
    return { userId, role: user.role };
  }

  function validateGrantBody(body: Record<string, unknown>): string | null {
    const { principalType, principalId, capability } = body;
    if (
      !principalType ||
      typeof principalType !== 'string' ||
      !VALID_PRINCIPAL_TYPES.has(principalType)
    ) {
      return 'Invalid principal type';
    }
    if (!principalId || typeof principalId !== 'string') {
      return 'principalId is required';
    }
    if (principalType !== PrincipalType.ROLE && !isValidObjectIdString(principalId)) {
      return 'Invalid principalId format';
    }
    if (!capability || typeof capability !== 'string' || !VALID_CAPABILITIES.has(capability)) {
      return 'Invalid capability';
    }
    return null;
  }

  async function callerHasManageCapability(
    req: ServerRequest,
    principalType: PrincipalType,
  ): Promise<boolean> {
    const user = resolveUser(req);
    if (!user) {
      return false;
    }
    const capability = MANAGE_CAPABILITY_BY_TYPE[principalType];
    if (!capability) {
      return false;
    }
    const principals = await getUserPrincipals(user);
    return hasCapabilityForPrincipals({ principals, capability });
  }

  async function getEffectiveCapabilitiesHandler(req: ServerRequest, res: Response) {
    try {
      const user = resolveUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const principals = await getUserPrincipals(user);
      const grantArrays = await Promise.all(
        principals
          .filter(
            (p): p is ResolvedPrincipal & { principalId: string | Types.ObjectId } =>
              p.principalId != null,
          )
          .map((p) =>
            getCapabilitiesForPrincipal({
              principalType: p.principalType,
              principalId: p.principalId,
            }),
          ),
      );

      const directCaps = new Set<string>();
      for (const grants of grantArrays) {
        for (const grant of grants) {
          directCaps.add(grant.capability);
        }
      }

      return res.status(200).json({ capabilities: expandImplications(Array.from(directCaps)) });
    } catch (error) {
      logger.error('[adminGrants] getEffectiveCapabilities error:', error);
      return res.status(500).json({ error: 'Failed to get effective capabilities' });
    }
  }

  async function getPrincipalGrantsHandler(req: ServerRequest, res: Response) {
    try {
      const { principalType, principalId } = req.params as {
        principalType: string;
        principalId: string;
      };

      if (!VALID_PRINCIPAL_TYPES.has(principalType)) {
        return res.status(400).json({ error: 'Invalid principal type' });
      }
      if (!principalId) {
        return res.status(400).json({ error: 'principalId is required' });
      }
      if (principalType !== PrincipalType.ROLE && !isValidObjectIdString(principalId)) {
        return res.status(400).json({ error: 'Invalid principalId format' });
      }

      const grants = await getCapabilitiesForPrincipal({
        principalType: principalType as PrincipalType,
        principalId,
      });
      return res.status(200).json({ grants });
    } catch (error) {
      logger.error('[adminGrants] getPrincipalGrants error:', error);
      return res.status(500).json({ error: 'Failed to get grants' });
    }
  }

  async function assignGrantHandler(req: ServerRequest, res: Response) {
    try {
      const bodyError = validateGrantBody(req.body as Record<string, unknown>);
      if (bodyError) {
        return res.status(400).json({ error: bodyError });
      }

      const { principalType, principalId, capability } = req.body as {
        principalType: PrincipalType;
        principalId: string;
        capability: SystemCapability;
      };

      if (!(await callerHasManageCapability(req, principalType))) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const grant = await grantCapability({
        principalType,
        principalId,
        capability,
        grantedBy: resolveUser(req)?.userId,
      });
      return res.status(200).json({ grant });
    } catch (error) {
      logger.error('[adminGrants] assignGrant error:', error);
      return res.status(500).json({ error: 'Failed to assign grant' });
    }
  }

  async function revokeGrantHandler(req: ServerRequest, res: Response) {
    try {
      const bodyError = validateGrantBody(req.body as Record<string, unknown>);
      if (bodyError) {
        return res.status(400).json({ error: bodyError });
      }

      const { principalType, principalId, capability } = req.body as {
        principalType: PrincipalType;
        principalId: string;
        capability: SystemCapability;
      };

      if (!(await callerHasManageCapability(req, principalType))) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      await revokeCapability({ principalType, principalId, capability });
      return res.status(200).json({ success: true });
    } catch (error) {
      logger.error('[adminGrants] revokeGrant error:', error);
      return res.status(500).json({ error: 'Failed to revoke grant' });
    }
  }

  return {
    getEffectiveCapabilities: getEffectiveCapabilitiesHandler,
    getPrincipalGrants: getPrincipalGrantsHandler,
    assignGrant: assignGrantHandler,
    revokeGrant: revokeGrantHandler,
  };
}
