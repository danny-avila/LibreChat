import { Types } from 'mongoose';
import { PrincipalType, SystemCapabilities, SystemRoles } from 'librechat-data-provider';
import type { Model, ClientSession } from 'mongoose';
import type { SystemCapability } from 'librechat-data-provider';
import type { ISystemGrant } from '~/types';

export function createSystemGrantMethods(mongoose: typeof import('mongoose')) {
  /**
   * Check if any of the given principals holds a specific capability.
   * Follows the same principal-resolution pattern as AclEntry:
   * getUserPrincipals → $or query.
   *
   * @param principals - Resolved principal list from getUserPrincipals
   * @param capability - The capability to check
   * @param tenantId  - If present, checks tenant-scoped grant; if absent, checks platform-level
   */
  async function hasCapabilityForPrincipals({
    principals,
    capability,
    tenantId,
  }: {
    principals: Array<{ principalType: string; principalId?: string | Types.ObjectId }>;
    capability: SystemCapability;
    tenantId?: string;
  }): Promise<boolean> {
    const SystemGrant = mongoose.models.SystemGrant as Model<ISystemGrant>;
    const principalsQuery = principals
      .filter((p) => p.principalType !== PrincipalType.PUBLIC)
      .map((p) => ({ principalType: p.principalType, principalId: p.principalId }));

    if (!principalsQuery.length) {
      return false;
    }

    const query: Record<string, unknown> = {
      $or: principalsQuery,
      capability,
    };

    if (tenantId != null) {
      query.tenantId = tenantId;
    } else {
      query.tenantId = { $exists: false };
    }

    const doc = await SystemGrant.exists(query);
    return doc != null;
  }

  /**
   * Grant a capability to a principal. Upsert — idempotent.
   */
  async function grantCapability(
    {
      principalType,
      principalId,
      capability,
      tenantId,
      grantedBy,
    }: {
      principalType: string;
      principalId: string | Types.ObjectId;
      capability: SystemCapability;
      tenantId?: string;
      grantedBy?: string | Types.ObjectId;
    },
    session?: ClientSession,
  ): Promise<ISystemGrant | null> {
    const SystemGrant = mongoose.models.SystemGrant as Model<ISystemGrant>;

    const filter: Record<string, unknown> = {
      principalType,
      principalId,
      capability,
    };

    if (tenantId != null) {
      filter.tenantId = tenantId;
    }

    const update = {
      $set: {
        grantedAt: new Date(),
        ...(grantedBy != null && { grantedBy }),
      },
      $setOnInsert: {
        principalType,
        principalId,
        capability,
        ...(tenantId != null && { tenantId }),
      },
    };

    const options = {
      upsert: true,
      new: true,
      ...(session ? { session } : {}),
    };

    return await SystemGrant.findOneAndUpdate(filter, update, options);
  }

  /**
   * Revoke a capability from a principal.
   */
  async function revokeCapability(
    {
      principalType,
      principalId,
      capability,
      tenantId,
    }: {
      principalType: string;
      principalId: string | Types.ObjectId;
      capability: SystemCapability;
      tenantId?: string;
    },
    session?: ClientSession,
  ): Promise<void> {
    const SystemGrant = mongoose.models.SystemGrant as Model<ISystemGrant>;

    const filter: Record<string, unknown> = {
      principalType,
      principalId,
      capability,
    };

    if (tenantId != null) {
      filter.tenantId = tenantId;
    } else {
      filter.tenantId = { $exists: false };
    }

    const options = session ? { session } : {};
    await SystemGrant.deleteOne(filter, options);
  }

  /**
   * List all capabilities held by a principal — used by the capabilities
   * introspection endpoint.
   */
  async function getCapabilitiesForPrincipal({
    principalType,
    principalId,
    tenantId,
  }: {
    principalType: string;
    principalId: string | Types.ObjectId;
    tenantId?: string;
  }): Promise<ISystemGrant[]> {
    const SystemGrant = mongoose.models.SystemGrant as Model<ISystemGrant>;

    const filter: Record<string, unknown> = {
      principalType,
      principalId,
    };

    if (tenantId != null) {
      filter.tenantId = tenantId;
    } else {
      filter.tenantId = { $exists: false };
    }

    return await SystemGrant.find(filter).lean();
  }

  /**
   * Seed the ADMIN role with all system capabilities (no tenantId — single-instance mode).
   * Idempotent: safe to call on every startup.
   */
  async function seedSystemGrants(): Promise<void> {
    for (const capability of Object.values(SystemCapabilities)) {
      await grantCapability({
        principalType: PrincipalType.ROLE,
        principalId: SystemRoles.ADMIN,
        capability,
      });
    }
  }

  return {
    hasCapabilityForPrincipals,
    grantCapability,
    revokeCapability,
    getCapabilitiesForPrincipal,
    seedSystemGrants,
  };
}

export type SystemGrantMethods = ReturnType<typeof createSystemGrantMethods>;
