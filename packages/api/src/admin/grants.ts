import { PrincipalType } from 'librechat-data-provider';
import {
  logger,
  isValidCapability,
  SystemCapabilities,
  expandImplications,
} from '@librechat/data-schemas';
import type { ISystemGrant, SystemCapability } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { Types } from 'mongoose';
import type { ResolvedPrincipal } from '~/types/principal';
import type { ServerRequest } from '~/types/http';
import { parsePagination } from './pagination';

interface GrantRequestBody {
  principalType?: string;
  principalId?: string | null;
  capability?: string;
}

export interface AdminGrantsDeps {
  listGrants: (options?: {
    tenantId?: string;
    principalTypes?: PrincipalType[];
    limit?: number;
    offset?: number;
  }) => Promise<ISystemGrant[]>;
  countGrants: (options?: {
    tenantId?: string;
    principalTypes?: PrincipalType[];
  }) => Promise<number>;
  getCapabilitiesForPrincipal: (params: {
    principalType: PrincipalType;
    principalId: string | Types.ObjectId;
    tenantId?: string;
  }) => Promise<ISystemGrant[]>;
  getCapabilitiesForPrincipals: (params: {
    principals: Array<{ principalType: PrincipalType; principalId: string | Types.ObjectId }>;
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
  getUserPrincipals: (params: {
    userId: string;
    role?: string | null;
    tenantId?: string;
  }) => Promise<ResolvedPrincipal[]>;
  hasCapabilityForPrincipals: (params: {
    principals: ResolvedPrincipal[];
    capability: SystemCapability;
    tenantId?: string;
  }) => Promise<boolean>;
  getHeldCapabilities: (params: {
    principals: ResolvedPrincipal[];
    capabilities: SystemCapability[];
    tenantId?: string;
  }) => Promise<Set<SystemCapability>>;
  getCachedPrincipals?: (user: {
    id: string;
    role: string;
    tenantId?: string;
  }) => ResolvedPrincipal[] | undefined;
  checkRoleExists?: (roleId: string) => Promise<boolean>;
}

/** Currently ROLE-only; Record/Set structure preserved for future principal-type expansion. */
export type GrantPrincipalType = PrincipalType.ROLE;

/** Creates admin grant handlers with dependency injection for the /api/admin/grants routes. */
export function createAdminGrantsHandlers(deps: AdminGrantsDeps) {
  const {
    listGrants,
    countGrants,
    getCapabilitiesForPrincipal,
    getCapabilitiesForPrincipals,
    grantCapability,
    revokeCapability,
    getUserPrincipals,
    hasCapabilityForPrincipals,
    getHeldCapabilities,
    getCachedPrincipals,
    checkRoleExists,
  } = deps;

  const MANAGE_CAPABILITY_BY_TYPE: Record<GrantPrincipalType, SystemCapability> = {
    [PrincipalType.ROLE]: SystemCapabilities.MANAGE_ROLES,
  };

  const READ_CAPABILITY_BY_TYPE: Record<GrantPrincipalType, SystemCapability> = {
    [PrincipalType.ROLE]: SystemCapabilities.READ_ROLES,
  };

  const VALID_PRINCIPAL_TYPES = new Set(
    Object.keys(MANAGE_CAPABILITY_BY_TYPE) as GrantPrincipalType[],
  );

  function resolveUser(
    req: ServerRequest,
  ): { userId: string; role: string; tenantId?: string } | null {
    const user = req.user;
    if (!user) {
      return null;
    }
    const userId = user._id?.toString() ?? user.id;
    if (!userId || !user.role) {
      return null;
    }
    return { userId, role: user.role, tenantId: user.tenantId };
  }

  async function resolvePrincipals(user: {
    userId: string;
    role: string;
    tenantId?: string;
  }): Promise<ResolvedPrincipal[]> {
    if (getCachedPrincipals) {
      const cached = getCachedPrincipals({
        id: user.userId,
        role: user.role,
        tenantId: user.tenantId,
      });
      if (cached) {
        return cached;
      }
    }
    return getUserPrincipals({ userId: user.userId, role: user.role, tenantId: user.tenantId });
  }

  function validatePrincipal(principalType: string, principalId: string): string | null {
    if (!principalType || !VALID_PRINCIPAL_TYPES.has(principalType as GrantPrincipalType)) {
      return 'Invalid principal type';
    }
    if (!principalId) {
      return 'Principal ID is required';
    }
    return null;
  }

  function validateGrantBody(body: GrantRequestBody): string | null {
    const { principalType, principalId, capability } = body;
    if (typeof principalType !== 'string') {
      return 'Invalid principal type';
    }
    if (principalId == null) {
      return 'Principal ID is required';
    }
    if (typeof principalId !== 'string') {
      return 'Principal ID must be a string';
    }
    const principalError = validatePrincipal(principalType, principalId);
    if (principalError) {
      return principalError;
    }
    if (!capability || typeof capability !== 'string' || !isValidCapability(capability)) {
      return 'Invalid capability';
    }
    return null;
  }

  async function listGrantsHandler(req: ServerRequest, res: Response) {
    try {
      const user = resolveUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { limit, offset } = parsePagination(req.query as { limit?: string; offset?: string });
      const { tenantId } = user;
      const principals = await resolvePrincipals(user);
      const entries = Object.entries(READ_CAPABILITY_BY_TYPE) as [
        GrantPrincipalType,
        SystemCapability,
      ][];

      const heldCaps = await getHeldCapabilities({
        principals,
        capabilities: entries.map(([, cap]) => cap),
        tenantId,
      });
      const allowedTypes = entries
        .filter(([, cap]) => heldCaps.has(cap))
        .map(([type]) => type) as PrincipalType[];

      if (!allowedTypes.length) {
        return res.status(200).json({ grants: [], total: 0, limit, offset });
      }
      const [grants, total] = await Promise.all([
        listGrants({ tenantId, principalTypes: allowedTypes, limit, offset }),
        countGrants({ tenantId, principalTypes: allowedTypes }),
      ]);
      return res.status(200).json({ grants, total, limit, offset });
    } catch (error) {
      logger.error('[adminGrants] listGrants error:', error);
      return res.status(500).json({ error: 'Failed to list grants' });
    }
  }

  /**
   * Returns the caller's effective capabilities: direct grants plus base-level
   * implications (e.g. manage:roles → read:roles).
   *
   * Note: this endpoint does NOT expand parent capabilities into their
   * section-level children (e.g. manage:configs does NOT expand into
   * manage:configs:endpoints, manage:configs:models, etc.). Section-level
   * capabilities are resolved dynamically by the authorization layer
   * (hasCapabilityForPrincipals / getHeldCapabilities) at check time via
   * getParentCapabilities. The admin UI should treat a base capability like
   * manage:configs as implying authority over all its sections.
   */
  async function getEffectiveCapabilitiesHandler(req: ServerRequest, res: Response) {
    try {
      const user = resolveUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { tenantId } = user;
      const principals = await resolvePrincipals(user);
      const filteredPrincipals = principals.filter(
        (p): p is ResolvedPrincipal & { principalId: string | Types.ObjectId } =>
          p.principalId != null,
      );

      if (!filteredPrincipals.length) {
        return res.status(200).json({ capabilities: [] });
      }

      const grants = await getCapabilitiesForPrincipals({
        principals: filteredPrincipals,
        tenantId,
      });

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
      const user = resolveUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { principalType, principalId } = req.params as {
        principalType: string;
        principalId: string;
      };

      const principalError = validatePrincipal(principalType, principalId);
      if (principalError) {
        return res.status(400).json({ error: principalError });
      }

      const { tenantId } = user;
      const readCap = READ_CAPABILITY_BY_TYPE[principalType as GrantPrincipalType];
      const principals = await resolvePrincipals(user);
      const allowed = await hasCapabilityForPrincipals({
        principals,
        capability: readCap,
        tenantId,
      });
      if (!allowed) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const grants = await getCapabilitiesForPrincipal({
        principalType: principalType as PrincipalType,
        principalId,
        tenantId,
      });
      return res.status(200).json({ grants });
    } catch (error) {
      logger.error('[adminGrants] getPrincipalGrants error:', error);
      return res.status(500).json({ error: 'Failed to get grants' });
    }
  }

  async function assignGrantHandler(req: ServerRequest, res: Response) {
    try {
      const caller = resolveUser(req);
      if (!caller) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const bodyError = validateGrantBody(req.body as GrantRequestBody);
      if (bodyError) {
        return res.status(400).json({ error: bodyError });
      }

      const { principalType, principalId, capability } = req.body as {
        principalType: GrantPrincipalType;
        principalId: string;
        capability: SystemCapability;
      };

      const { tenantId } = caller;
      const principals = await resolvePrincipals(caller);

      const manageCap = MANAGE_CAPABILITY_BY_TYPE[principalType];
      const held = await getHeldCapabilities({
        principals,
        capabilities: [manageCap, capability],
        tenantId,
      });
      if (!held.has(manageCap)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      if (!held.has(capability)) {
        return res.status(403).json({ error: 'Cannot grant a capability you do not possess' });
      }

      /** Reject grants targeting non-existent roles when the dep is provided. */
      if (checkRoleExists) {
        const exists = await checkRoleExists(principalId);
        if (!exists) {
          return res.status(400).json({ error: 'Role not found' });
        }
      }

      const grant = await grantCapability({
        principalType,
        principalId,
        capability,
        tenantId,
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
      const caller = resolveUser(req);
      if (!caller) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { principalType, principalId, capability } = req.params as {
        principalType: string;
        principalId: string;
        capability?: string;
      };

      const principalError = validatePrincipal(principalType, principalId);
      if (principalError) {
        return res.status(400).json({ error: principalError });
      }
      if (!capability || !isValidCapability(capability)) {
        return res.status(400).json({ error: 'Invalid capability' });
      }

      const { tenantId } = caller;
      const principals = await resolvePrincipals(caller);
      const manageCap = MANAGE_CAPABILITY_BY_TYPE[principalType as GrantPrincipalType];
      if (!(await hasCapabilityForPrincipals({ principals, capability: manageCap, tenantId }))) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      await revokeCapability({
        principalType: principalType as PrincipalType,
        principalId,
        capability: capability as SystemCapability,
        tenantId,
      });
      return res.status(200).json({ success: true });
    } catch (error) {
      logger.error('[adminGrants] revokeGrant error:', error);
      return res.status(500).json({ error: 'Failed to revoke grant' });
    }
  }

  return {
    listGrants: listGrantsHandler,
    getEffectiveCapabilities: getEffectiveCapabilitiesHandler,
    getPrincipalGrants: getPrincipalGrantsHandler,
    assignGrant: assignGrantHandler,
    revokeGrant: revokeGrantHandler,
  };
}
