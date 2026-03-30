import { PrincipalType, SystemRoles } from 'librechat-data-provider';
import type { Types, Model, ClientSession } from 'mongoose';
import type { SystemCapability } from '~/types/admin';
import type { ISystemGrant } from '~/types';
import { SystemCapabilities, CapabilityImplications } from '~/admin/capabilities';
import { normalizePrincipalId } from '~/utils/principal';
import logger from '~/config/winston';

/**
 * Precomputed reverse map: for each capability, which broader capabilities imply it.
 * Built once at module load so `hasCapabilityForPrincipals` avoids O(N×M) per call.
 */
type BaseSystemCapability = (typeof SystemCapabilities)[keyof typeof SystemCapabilities];
const reverseImplications: Partial<Record<BaseSystemCapability, BaseSystemCapability[]>> = {};
for (const [broad, implied] of Object.entries(CapabilityImplications)) {
  for (const cap of implied as BaseSystemCapability[]) {
    (reverseImplications[cap] ??= []).push(broad as BaseSystemCapability);
  }
}

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

    const impliedBy = reverseImplications[capability as keyof typeof reverseImplications] ?? [];
    const capabilityQuery = impliedBy.length ? { $in: [capability, ...impliedBy] } : capability;

    const query: Record<string, unknown> = {
      $or: principalsQuery,
      capability: capabilityQuery,
    };

    if (tenantId != null) {
      query.$and = [{ $or: [{ tenantId }, { tenantId: { $exists: false } }] }];
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

    try {
      return await SystemGrant.findOneAndUpdate(filter, update, options);
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        return (await SystemGrant.findOne(filter).lean()) as ISystemGrant | null;
      }
      throw err;
    }
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
      filter.$or = [{ tenantId }, { tenantId: { $exists: false } }];
    } else {
      filter.tenantId = { $exists: false };
    }

    return await SystemGrant.find(filter).lean();
  }

  /**
   * Seed the ADMIN role with all system capabilities (no tenantId — single-instance mode).
   * Idempotent and concurrency-safe: uses bulkWrite with ordered:false so parallel
   * server instances (K8s rolling deploy, PM2 cluster) do not race on E11000.
   * Retries up to 3 times with exponential backoff on transient failures.
   */
  async function seedSystemGrants(): Promise<void> {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
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
        return;
      } catch (err) {
        if (attempt < maxRetries) {
          const delay = 1000 * Math.pow(2, attempt - 1);
          logger.warn(
            `[seedSystemGrants] Attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms: ${(err as Error).message ?? String(err)}`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          logger.error(
            '[seedSystemGrants] Failed to seed capabilities after all retries. ' +
              'Admin panel access requires these grants. Manual recovery: ' +
              'db.systemgrants.insertMany([...]) with ADMIN role grants for each capability.',
            err,
          );
        }
      }
    }
  }

  /**
   * Delete all system grants for a principal.
   * Used for cascade cleanup when a principal (group, role) is deleted.
   */
  async function deleteGrantsForPrincipal(
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<void> {
    const SystemGrant = mongoose.models.SystemGrant as Model<ISystemGrant>;
    const normalizedPrincipalId = normalizePrincipalId(principalId, principalType);
    const options = session ? { session } : {};
    await SystemGrant.deleteMany({ principalType, principalId: normalizedPrincipalId }, options);
  }

  return {
    grantCapability,
    seedSystemGrants,
    revokeCapability,
    hasCapabilityForPrincipals,
    getCapabilitiesForPrincipal,
    deleteGrantsForPrincipal,
  };
}

export type SystemGrantMethods = ReturnType<typeof createSystemGrantMethods>;
