import {
  ResourceType,
  PrincipalType,
  PermissionBits,
  AccessRoleIds,
} from 'librechat-data-provider';
import type { Types, Model } from 'mongoose';

export interface Principal {
  type: string;
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  source?: string;
  idOnTheSource?: string;
  accessRoleId: string;
  isImplicit?: boolean;
}

export interface EnricherDependencies {
  AclEntry: Model<{
    principalType: string;
    principalId: Types.ObjectId;
    resourceType: string;
    resourceId: Types.ObjectId;
    permBits: number;
    roleId: Types.ObjectId;
    grantedBy: Types.ObjectId;
    grantedAt: Date;
  }>;
  AccessRole: Model<{
    accessRoleId: string;
    permBits: number;
  }>;
  logger: { error: (msg: string, ...args: unknown[]) => void };
}

export interface EnrichResult {
  principals: Principal[];
  entriesToBackfill: Types.ObjectId[];
}

/** Enriches REMOTE_AGENT principals with implicit AGENT owners */
export async function enrichRemoteAgentPrincipals(
  deps: EnricherDependencies,
  resourceId: string | Types.ObjectId,
  principals: Principal[],
): Promise<EnrichResult> {
  const { AclEntry } = deps;

  const resourceObjectId =
    typeof resourceId === 'string' && /^[a-f\d]{24}$/i.test(resourceId)
      ? deps.AclEntry.base.Types.ObjectId.createFromHexString(resourceId)
      : resourceId;

  const agentOwnerEntries = await AclEntry.aggregate([
    {
      $match: {
        resourceType: ResourceType.AGENT,
        resourceId: resourceObjectId,
        principalType: PrincipalType.USER,
        permBits: { $bitsAllSet: PermissionBits.SHARE },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'principalId',
        foreignField: '_id',
        as: 'userInfo',
      },
    },
    {
      $project: {
        principalId: 1,
        userInfo: { $arrayElemAt: ['$userInfo', 0] },
      },
    },
  ]);

  const enrichedPrincipals = [...principals];
  const entriesToBackfill: Types.ObjectId[] = [];

  for (const entry of agentOwnerEntries) {
    if (!entry.userInfo) {
      continue;
    }

    const alreadyIncluded = enrichedPrincipals.some(
      (p) => p.type === PrincipalType.USER && p.id === entry.principalId.toString(),
    );

    if (!alreadyIncluded) {
      enrichedPrincipals.unshift({
        type: PrincipalType.USER,
        id: entry.userInfo._id.toString(),
        name: entry.userInfo.name || entry.userInfo.username,
        email: entry.userInfo.email,
        avatar: entry.userInfo.avatar,
        source: 'local',
        idOnTheSource: entry.userInfo.idOnTheSource || entry.userInfo._id.toString(),
        accessRoleId: AccessRoleIds.REMOTE_AGENT_OWNER,
        isImplicit: true,
      });

      entriesToBackfill.push(entry.principalId);
    }
  }

  return { principals: enrichedPrincipals, entriesToBackfill };
}

/** Backfills REMOTE_AGENT ACL entries for AGENT owners (fire-and-forget) */
export function backfillRemoteAgentPermissions(
  deps: EnricherDependencies,
  resourceId: string | Types.ObjectId,
  entriesToBackfill: Types.ObjectId[],
): void {
  if (entriesToBackfill.length === 0) {
    return;
  }

  const { AclEntry, AccessRole, logger } = deps;

  const resourceObjectId =
    typeof resourceId === 'string' && /^[a-f\d]{24}$/i.test(resourceId)
      ? AclEntry.base.Types.ObjectId.createFromHexString(resourceId)
      : resourceId;

  AccessRole.findOne({ accessRoleId: AccessRoleIds.REMOTE_AGENT_OWNER })
    .lean()
    .then((role) => {
      if (!role) {
        logger.error('[backfillRemoteAgentPermissions] REMOTE_AGENT_OWNER role not found');
        return;
      }

      const bulkOps = entriesToBackfill.map((principalId) => ({
        updateOne: {
          filter: {
            principalType: PrincipalType.USER,
            principalId,
            resourceType: ResourceType.REMOTE_AGENT,
            resourceId: resourceObjectId,
          },
          update: {
            $setOnInsert: {
              principalType: PrincipalType.USER,
              principalId,
              principalModel: 'User',
              resourceType: ResourceType.REMOTE_AGENT,
              resourceId: resourceObjectId,
              permBits: role.permBits,
              roleId: role._id,
              grantedBy: principalId,
              grantedAt: new Date(),
            },
          },
          upsert: true,
        },
      }));

      return AclEntry.bulkWrite(bulkOps, { ordered: false });
    })
    .catch((err) => {
      logger.error('[backfillRemoteAgentPermissions] Failed to backfill:', err);
    });
}
