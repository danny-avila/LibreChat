import { PrincipalType, SystemRoles } from 'librechat-data-provider';
import type { Types, Model, ClientSession } from 'mongoose';
import type { SystemCapability } from '~/systemCapabilities';
import type { ISystemGrant } from '~/types';
import { SystemCapabilities, CapabilityImplications } from '~/systemCapabilities';
import { normalizePrincipalId } from '~/utils/principal';

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
    principals: Array<{ principalType: PrincipalType; principalId?: string | Types.ObjectId }>;
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

    /* Expand to include capabilities that imply the requested one, so a
    MANAGE_USERS grant satisfies a READ_USERS check without a separate grant.
    */
    const impliedBy = (
      Object.entries(CapabilityImplications) as [SystemCapability, SystemCapability[]][]
    )
      .filter(([, implied]) => implied.includes(capability))
      .map(([cap]) => cap);
    const capabilityQuery = impliedBy.length ? { $in: [capability, ...impliedBy] } : capability;

    const query: Record<string, unknown> = {
      $or: principalsQuery,
      capability: capabilityQuery,
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
      principalType: PrincipalType;
      principalId: string | Types.ObjectId;
      capability: SystemCapability;
      tenantId?: string;
      grantedBy?: string | Types.ObjectId;
    },
    session?: ClientSession,
  ): Promise<ISystemGrant | null> {
    const SystemGrant = mongoose.models.SystemGrant as Model<ISystemGrant>;

    const normalizedPrincipalId = normalizePrincipalId(principalId, principalType);

    const filter: Record<string, unknown> = {
      principalType,
      principalId: normalizedPrincipalId,
      capability,
    };

    if (tenantId != null) {
      filter.tenantId = tenantId;
    } else {
      filter.tenantId = { $exists: false };
    }

    const update = {
      $set: {
        grantedAt: new Date(),
        ...(grantedBy != null && { grantedBy }),
      },
      $setOnInsert: {
        principalType,
        principalId: normalizedPrincipalId,
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
      principalType: PrincipalType;
      principalId: string | Types.ObjectId;
      capability: SystemCapability;
      tenantId?: string;
    },
    session?: ClientSession,
  ): Promise<void> {
    const SystemGrant = mongoose.models.SystemGrant as Model<ISystemGrant>;

    const normalizedPrincipalId = normalizePrincipalId(principalId, principalType);

    const filter: Record<string, unknown> = {
      principalType,
      principalId: normalizedPrincipalId,
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
    principalType: PrincipalType;
    principalId: string | Types.ObjectId;
    tenantId?: string;
  }): Promise<ISystemGrant[]> {
    const SystemGrant = mongoose.models.SystemGrant as Model<ISystemGrant>;

    const filter: Record<string, unknown> = {
      principalType,
      principalId: normalizePrincipalId(principalId, principalType),
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
   * Idempotent and concurrency-safe: uses bulkWrite with ordered:false so parallel
   * server instances (K8s rolling deploy, PM2 cluster) do not race on E11000.
   */
  async function seedSystemGrants(): Promise<void> {
    const SystemGrant = mongoose.models.SystemGrant as Model<ISystemGrant>;
    const now = new Date();
    const ops = Object.values(SystemCapabilities).map((capability) => ({
      updateOne: {
        filter: {
          principalType: PrincipalType.ROLE,
          principalId: SystemRoles.ADMIN,
          capability,
          tenantId: { $exists: false },
        },
        update: {
          $setOnInsert: {
            principalType: PrincipalType.ROLE,
            principalId: SystemRoles.ADMIN,
            capability,
            grantedAt: now,
          },
        },
        upsert: true,
      },
    }));
    await SystemGrant.bulkWrite(ops, { ordered: false });
  }

  return {
    grantCapability,
    seedSystemGrants,
    revokeCapability,
    hasCapabilityForPrincipals,
    getCapabilitiesForPrincipal,
  };
}

export type SystemGrantMethods = ReturnType<typeof createSystemGrantMethods>;
