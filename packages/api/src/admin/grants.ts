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
import type { ResolvedPrincipal } from '~/types/principal';
import type { ServerRequest } from '~/types/http';

interface GrantRequestBody {
  principalType?: unknown;
  principalId?: unknown;
  capability?: unknown;
}

export interface AdminGrantsDeps {
  listAllGrants: (tenantId?: string) => Promise<ISystemGrant[]>;
  getCapabilitiesForPrincipal: (params: {
    principalType: PrincipalType;
    principalId: string | Types.ObjectId;
    tenantId?: string;
  }) => Promise<ISystemGrant[]>;
  getCapabilitiesForPrincipals: (params: {
    principals: Array<{ principalType: string; principalId: string | Types.ObjectId }>;
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
  getUserPrincipals: (params: { userId: string; role?: string | null }) => Promise<ResolvedPrincipal[]>;
  hasCapabilityForPrincipals: (params: {
    principals: ResolvedPrincipal[];
    capability: SystemCapability;
    tenantId?: string;
  }) => Promise<boolean>;
}

/**
 * Creates admin grant handlers with dependency injection for the /api/admin/grants routes.
 * All operations are currently platform-scoped (no tenantId threading).
 * Multi-tenant grant management will require threading req.user.tenantId through dep calls.
 */
export function createAdminGrantsHandlers(deps: AdminGrantsDeps) {
  const {
    listAllGrants,
    getCapabilitiesForPrincipal,
    getCapabilitiesForPrincipals,
    grantCapability,
    revokeCapability,
    getUserPrincipals,
    hasCapabilityForPrincipals,
  } = deps;

  const VALID_CAPABILITIES = new Set<string>(Object.values(SystemCapabilities));

  type GrantPrincipalType = PrincipalType.ROLE | PrincipalType.GROUP | PrincipalType.USER;

  const MANAGE_CAPABILITY_BY_TYPE: Record<GrantPrincipalType, SystemCapability> = {
    [PrincipalType.ROLE]: SystemCapabilities.MANAGE_ROLES,
    [PrincipalType.GROUP]: SystemCapabilities.MANAGE_GROUPS,
    [PrincipalType.USER]: SystemCapabilities.MANAGE_USERS,
  };

  const READ_CAPABILITY_BY_TYPE: Record<GrantPrincipalType, SystemCapability> = {
    [PrincipalType.ROLE]: SystemCapabilities.READ_ROLES,
    [PrincipalType.GROUP]: SystemCapabilities.READ_GROUPS,
    [PrincipalType.USER]: SystemCapabilities.READ_USERS,
  };

  const VALID_PRINCIPAL_TYPES = new Set<string>(Object.keys(MANAGE_CAPABILITY_BY_TYPE));

  function resolveUser(req: ServerRequest): { userId: string; role: string } | null {
    const user = req.user;
    if (!user) {
      return null;
    }
    const userId = user._id?.toString() ?? user.id;
    if (!userId || !user.role) {
      return null;
    }
    return { userId, role: user.role };
  }

  function validatePrincipal(principalType: string, principalId: string): string | null {
    if (!principalType || !VALID_PRINCIPAL_TYPES.has(principalType)) {
      return 'Invalid principal type';
    }
    if (!principalId) {
      return 'principalId is required';
    }
    if (principalType !== PrincipalType.ROLE && !isValidObjectIdString(principalId)) {
      return 'Invalid principalId format';
    }
    return null;
  }

  function validateGrantBody(body: GrantRequestBody): string | null {
    const { principalType, principalId, capability } = body;
    if (typeof principalType !== 'string') {
      return 'Invalid principal type';
    }
    if (typeof principalId !== 'string') {
      return 'principalId is required';
    }
    const principalError = validatePrincipal(principalType, principalId);
    if (principalError) {
      return principalError;
    }
    if (!capability || typeof capability !== 'string' || !VALID_CAPABILITIES.has(capability)) {
      return 'Invalid capability';
    }
    return null;
  }

  async function listAllGrantsHandler(req: ServerRequest, res: Response) {
    try {
      const user = resolveUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const principals = await getUserPrincipals(user);
      const allowedTypes = new Set<string>();
      for (const [type, cap] of Object.entries(READ_CAPABILITY_BY_TYPE)) {
        if (await hasCapabilityForPrincipals({ principals, capability: cap })) {
          allowedTypes.add(type);
        }
      }

      const allGrants = await listAllGrants();
      const grants = allGrants.filter((g) => allowedTypes.has(g.principalType));
      return res.status(200).json({ grants });
    } catch (error) {
      logger.error('[adminGrants] listAllGrants error:', error);
      return res.status(500).json({ error: 'Failed to list grants' });
    }
  }

  async function getEffectiveCapabilitiesHandler(req: ServerRequest, res: Response) {
    try {
      const user = resolveUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const principals = await getUserPrincipals(user);
      const filteredPrincipals = principals.filter(
        (p): p is ResolvedPrincipal & { principalId: string | Types.ObjectId } =>
          p.principalId != null,
      );

      const grants = await getCapabilitiesForPrincipals({ principals: filteredPrincipals });

      const directCaps = new Set<string>();
      for (const grant of grants) {
        directCaps.add(grant.capability);
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

      const principalError = validatePrincipal(principalType, principalId);
      if (principalError) {
        return res.status(400).json({ error: principalError });
      }

      const user = resolveUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const readCap = READ_CAPABILITY_BY_TYPE[principalType as PrincipalType];
      if (!readCap) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      const principals = await getUserPrincipals(user);
      const allowed = await hasCapabilityForPrincipals({ principals, capability: readCap });
      if (!allowed) {
        return res.status(403).json({ error: 'Insufficient permissions' });
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
      const bodyError = validateGrantBody(req.body as GrantRequestBody);
      if (bodyError) {
        return res.status(400).json({ error: bodyError });
      }

      const { principalType, principalId, capability } = req.body as {
        principalType: PrincipalType;
        principalId: string;
        capability: SystemCapability;
      };

      const caller = resolveUser(req);
      if (!caller) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const principals = await getUserPrincipals(caller);

      const manageCap = MANAGE_CAPABILITY_BY_TYPE[principalType];
      if (
        !manageCap ||
        !(await hasCapabilityForPrincipals({ principals, capability: manageCap }))
      ) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      if (!(await hasCapabilityForPrincipals({ principals, capability }))) {
        return res.status(403).json({ error: 'Cannot grant a capability you do not possess' });
      }

      const grant = await grantCapability({
        principalType,
        principalId,
        capability,
        grantedBy: caller.userId,
      });
      if (!grant) {
        return res.status(500).json({ error: 'Grant operation returned no result' });
      }
      return res.status(201).json({ grant });
    } catch (error) {
      logger.error('[adminGrants] assignGrant error:', error);
      return res.status(500).json({ error: 'Failed to assign grant' });
    }
  }

  /**
   * Revocation requires MANAGE on the target principal type but does NOT
   * require the caller to possess the capability being revoked. This avoids
   * a bootstrap deadlock where no one can clean up grants they don't hold.
   */
  async function revokeGrantHandler(req: ServerRequest, res: Response) {
    try {
      const { principalType, principalId, capability } = req.params as {
        principalType: string;
        principalId: string;
        capability: string;
      };

      const principalError = validatePrincipal(principalType, principalId);
      if (principalError) {
        return res.status(400).json({ error: principalError });
      }
      if (!capability || !VALID_CAPABILITIES.has(capability)) {
        return res.status(400).json({ error: 'Invalid capability' });
      }

      const caller = resolveUser(req);
      if (!caller) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const principals = await getUserPrincipals(caller);
      const manageCap = MANAGE_CAPABILITY_BY_TYPE[principalType as PrincipalType];
      if (
        !manageCap ||
        !(await hasCapabilityForPrincipals({ principals, capability: manageCap }))
      ) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      await revokeCapability({
        principalType: principalType as PrincipalType,
        principalId,
        capability: capability as SystemCapability,
      });
      return res.status(200).json({ success: true });
    } catch (error) {
      logger.error('[adminGrants] revokeGrant error:', error);
      return res.status(500).json({ error: 'Failed to revoke grant' });
    }
  }

  return {
    listAllGrants: listAllGrantsHandler,
    getEffectiveCapabilities: getEffectiveCapabilitiesHandler,
    getPrincipalGrants: getPrincipalGrantsHandler,
    assignGrant: assignGrantHandler,
    revokeGrant: revokeGrantHandler,
  };
}
