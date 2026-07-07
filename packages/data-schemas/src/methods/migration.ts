import { Types } from 'mongoose';
import type { ClientSession, FilterQuery, Model } from 'mongoose';
import { PrincipalType, ResourceType } from 'librechat-data-provider';
import type { MigrationScope, OwnedCollectionEntry } from '~/admin/ownership';
import { getRegistryEntriesForScopes } from '~/admin/ownership';
import logger from '~/config/winston';
import type { IAclEntry } from '~/types';
import type { IBalance } from '~/types/balance';
import type { IConfig } from '~/types/config';
import type { IPromptGroupDocument } from '~/types/prompts';
import type { ISystemGrant } from '~/types/systemGrant';

export interface CollectionMigrationResult {
  scopeKey: MigrationScope;
  matched: number;
  modified: number;
  skipped: number;
}

export interface MigrationDeps {
  getSoleOwnedResourceIds: (
    userObjectId: Types.ObjectId,
    resourceTypes: string | string[],
  ) => Promise<Types.ObjectId[]>;
}

export interface CountUserDataParams {
  sourceUserId: string;
  scopes: MigrationScope[];
}

export interface ReassignUserDataParams {
  sourceUserId: string;
  targetUserId: string;
  targetTenantId: string;
  scopes: MigrationScope[];
  session?: ClientSession;
}

function coerceOwnerValue(
  userId: string,
  ownerType: 'string' | 'objectId',
): string | Types.ObjectId {
  return ownerType === 'objectId' ? new Types.ObjectId(userId) : userId;
}

function getModel<T>(mongoose: typeof import('mongoose'), modelName: string): Model<T> {
  const model = mongoose.models[modelName] as Model<T> | undefined;
  if (!model) {
    throw new Error(`[migration] Model not registered: ${modelName}`);
  }
  return model;
}

/** Preserve createdAt/updatedAt when reassigning ownership (sidebar groups chats by updatedAt). */
function migrationWriteOptions(session?: ClientSession) {
  return session ? { session, timestamps: false as const } : { timestamps: false as const };
}

async function countGeneric(
  mongoose: typeof import('mongoose'),
  entry: OwnedCollectionEntry,
  sourceUserId: string,
): Promise<number> {
  if (entry.special === 'acl') {
    const AclEntry = getModel<IAclEntry>(mongoose, 'AclEntry');
    return AclEntry.countDocuments({
      principalType: PrincipalType.USER,
      principalId: new Types.ObjectId(sourceUserId),
    });
  }

  if (entry.special === 'config') {
    const Config = getModel<IConfig>(mongoose, 'Config');
    return Config.countDocuments({
      principalType: PrincipalType.USER,
      principalId: sourceUserId,
    });
  }

  if (entry.special === 'systemGrant') {
    const SystemGrant = getModel<ISystemGrant>(mongoose, 'SystemGrant');
    return SystemGrant.countDocuments({
      principalType: PrincipalType.USER,
      principalId: new Types.ObjectId(sourceUserId),
    });
  }

  if (entry.special === 'prompts') {
    const PromptGroup = getModel<IPromptGroupDocument>(mongoose, 'PromptGroup');
    return PromptGroup.countDocuments({ author: new Types.ObjectId(sourceUserId) });
  }

  if (entry.special === 'mcp') {
    const MCPServer = getModel<{ author: Types.ObjectId }>(mongoose, 'MCPServer');
    return MCPServer.countDocuments({ author: new Types.ObjectId(sourceUserId) });
  }

  const Model = getModel(mongoose, entry.modelName);
  const sourceVal = coerceOwnerValue(sourceUserId, entry.ownerType);
  return Model.countDocuments({ [entry.ownerField]: sourceVal } as FilterQuery<unknown>);
}

async function reassignGeneric(
  mongoose: typeof import('mongoose'),
  entry: OwnedCollectionEntry,
  sourceUserId: string,
  targetUserId: string,
  targetTenantId: string,
  session?: ClientSession,
): Promise<CollectionMigrationResult> {
  const Model = getModel(mongoose, entry.modelName);
  const sourceVal = coerceOwnerValue(sourceUserId, entry.ownerType);
  const targetVal = coerceOwnerValue(targetUserId, entry.ownerType);
  const result = await Model.updateMany(
    { [entry.ownerField]: sourceVal } as FilterQuery<unknown>,
    { $set: { [entry.ownerField]: targetVal, tenantId: targetTenantId } },
    migrationWriteOptions(session),
  );
  return {
    scopeKey: entry.scopeKey,
    matched: result.matchedCount ?? 0,
    modified: result.modifiedCount ?? 0,
    skipped: 0,
  };
}

async function reassignConversationTags(
  mongoose: typeof import('mongoose'),
  sourceUserId: string,
  targetUserId: string,
  targetTenantId: string,
  session?: ClientSession,
): Promise<CollectionMigrationResult> {
  const ConversationTag = getModel<{ _id: Types.ObjectId; tag?: string; user?: string }>(
    mongoose,
    'ConversationTag',
  );
  const sourceTags = await ConversationTag.find({ user: sourceUserId }).lean();
  let modified = 0;
  let skipped = 0;

  for (const tag of sourceTags) {
    const tagName = tag.tag;
    if (!tagName) {
      skipped += 1;
      continue;
    }
    const conflict = await ConversationTag.findOne({
      user: targetUserId,
      tag: tagName,
      tenantId: targetTenantId,
    }).lean();
    if (conflict) {
      skipped += 1;
      continue;
    }
    await ConversationTag.updateOne(
      { _id: tag._id },
      { $set: { user: targetUserId, tenantId: targetTenantId } },
      migrationWriteOptions(session),
    );
    modified += 1;
  }

  return {
    scopeKey: 'conversationTag',
    matched: sourceTags.length,
    modified,
    skipped,
  };
}

async function reassignPromptGroups(
  mongoose: typeof import('mongoose'),
  deps: MigrationDeps,
  sourceUserId: string,
  targetUserId: string,
  targetTenantId: string,
  session?: ClientSession,
): Promise<CollectionMigrationResult> {
  const PromptGroup = getModel<IPromptGroupDocument>(mongoose, 'PromptGroup');
  const AclEntry = getModel<IAclEntry>(mongoose, 'AclEntry');
  const sourceObjectId = new Types.ObjectId(sourceUserId);
  const targetObjectId = new Types.ObjectId(targetUserId);

  const soleOwnedIds = await deps.getSoleOwnedResourceIds(sourceObjectId, ResourceType.PROMPTGROUP);
  const authoredGroups = await PromptGroup.find({ author: sourceObjectId }).select('_id').lean();
  const authoredGroupIds = authoredGroups.map((group) => group._id);

  const migratedEntries =
    authoredGroupIds.length > 0
      ? await AclEntry.find({
          resourceType: ResourceType.PROMPTGROUP,
          resourceId: { $in: authoredGroupIds },
        })
          .select('resourceId')
          .lean()
      : [];
  const migratedIds = new Set(migratedEntries.map((entry) => entry.resourceId.toString()));
  const legacyGroupIds = authoredGroupIds.filter((id) => !migratedIds.has(id.toString()));
  const reassignableGroupIds = [...soleOwnedIds, ...legacyGroupIds];

  let modified = 0;
  if (reassignableGroupIds.length > 0) {
    const updateResult = await PromptGroup.updateMany(
      { _id: { $in: reassignableGroupIds } },
      { $set: { author: targetObjectId, tenantId: targetTenantId } },
      migrationWriteOptions(session),
    );
    modified += updateResult.modifiedCount ?? 0;
  }

  return {
    scopeKey: 'promptGroup',
    matched: authoredGroups.length,
    modified,
    skipped: Math.max(0, authoredGroups.length - reassignableGroupIds.length),
  };
}

async function reassignMcpServers(
  mongoose: typeof import('mongoose'),
  deps: MigrationDeps,
  sourceUserId: string,
  targetUserId: string,
  targetTenantId: string,
  session?: ClientSession,
): Promise<CollectionMigrationResult> {
  const MCPServer = getModel<{ _id: Types.ObjectId; author: Types.ObjectId }>(
    mongoose,
    'MCPServer',
  );
  const AclEntry = getModel<IAclEntry>(mongoose, 'AclEntry');
  const sourceObjectId = new Types.ObjectId(sourceUserId);
  const targetObjectId = new Types.ObjectId(targetUserId);

  const soleOwnedIds = await deps.getSoleOwnedResourceIds(sourceObjectId, ResourceType.MCPSERVER);
  const authoredServers = await MCPServer.find({ author: sourceObjectId }).select('_id').lean();
  const authoredServerIds = authoredServers.map((server) => server._id);

  const migratedEntries =
    authoredServerIds.length > 0
      ? await AclEntry.find({
          resourceType: ResourceType.MCPSERVER,
          resourceId: { $in: authoredServerIds },
        })
          .select('resourceId')
          .lean()
      : [];
  const migratedIds = new Set(migratedEntries.map((entry) => entry.resourceId.toString()));
  const legacyServerIds = authoredServerIds.filter((id) => !migratedIds.has(id.toString()));
  const reassignableServerIds = [...soleOwnedIds, ...legacyServerIds];

  let modified = 0;
  if (reassignableServerIds.length > 0) {
    const updateResult = await MCPServer.updateMany(
      { _id: { $in: reassignableServerIds } },
      { $set: { author: targetObjectId, tenantId: targetTenantId } },
      migrationWriteOptions(session),
    );
    modified += updateResult.modifiedCount ?? 0;
  }

  return {
    scopeKey: 'mcpServer',
    matched: authoredServers.length,
    modified,
    skipped: Math.max(0, authoredServers.length - reassignableServerIds.length),
  };
}

async function reassignAclPrincipalEntries(
  mongoose: typeof import('mongoose'),
  sourceUserId: string,
  targetUserId: string,
  targetTenantId: string,
  session?: ClientSession,
): Promise<CollectionMigrationResult> {
  const AclEntry = getModel<IAclEntry>(mongoose, 'AclEntry');
  const sourceObjectId = new Types.ObjectId(sourceUserId);
  const targetObjectId = new Types.ObjectId(targetUserId);

  const result = await AclEntry.updateMany(
    {
      principalType: PrincipalType.USER,
      principalId: sourceObjectId,
    },
    { $set: { principalId: targetObjectId, tenantId: targetTenantId } },
    migrationWriteOptions(session),
  );

  return {
    scopeKey: 'aclEntry',
    matched: result.matchedCount ?? 0,
    modified: result.modifiedCount ?? 0,
    skipped: 0,
  };
}

async function migrateBalance(
  mongoose: typeof import('mongoose'),
  sourceUserId: string,
  targetUserId: string,
  targetTenantId: string,
  session?: ClientSession,
): Promise<CollectionMigrationResult> {
  const Balance = getModel<IBalance>(mongoose, 'Balance');
  const sourceObjectId = new Types.ObjectId(sourceUserId);
  const targetObjectId = new Types.ObjectId(targetUserId);
  const sourceBalance = await Balance.findOne({ user: sourceObjectId });
  if (!sourceBalance) {
    return { scopeKey: 'balance', matched: 0, modified: 0, skipped: 0 };
  }

  const targetBalance = await Balance.findOne({ user: targetObjectId });
  if (targetBalance) {
    await Balance.updateOne(
      { _id: targetBalance._id },
      {
        $inc: { tokenCredits: sourceBalance.tokenCredits ?? 0 },
        $set: { tenantId: targetTenantId },
      },
      migrationWriteOptions(session),
    );
    await Balance.deleteOne({ _id: sourceBalance._id }, session ? { session } : undefined);
    return { scopeKey: 'balance', matched: 1, modified: 1, skipped: 0 };
  }

  await Balance.updateOne(
    { _id: sourceBalance._id },
    { $set: { user: targetObjectId, tenantId: targetTenantId } },
    migrationWriteOptions(session),
  );
  return { scopeKey: 'balance', matched: 1, modified: 1, skipped: 0 };
}

async function reassignSystemGrants(
  mongoose: typeof import('mongoose'),
  sourceUserId: string,
  targetUserId: string,
  targetTenantId: string,
  session?: ClientSession,
): Promise<CollectionMigrationResult> {
  const SystemGrant = getModel<ISystemGrant>(mongoose, 'SystemGrant');
  const sourceObjectId = new Types.ObjectId(sourceUserId);
  const targetObjectId = new Types.ObjectId(targetUserId);
  const sourceGrants = await SystemGrant.find({
    principalType: PrincipalType.USER,
    principalId: sourceObjectId,
  }).lean();

  let modified = 0;
  let skipped = 0;

  for (const grant of sourceGrants) {
    const conflictFilter: FilterQuery<ISystemGrant> = {
      principalType: PrincipalType.USER,
      principalId: targetObjectId,
      capability: grant.capability,
    };
    if (grant.tenantId) {
      conflictFilter.tenantId = targetTenantId;
    } else {
      conflictFilter.tenantId = { $exists: false };
    }

    const conflict = await SystemGrant.findOne(conflictFilter).lean();
    if (conflict) {
      await SystemGrant.deleteOne({ _id: grant._id }, session ? { session } : undefined);
      skipped += 1;
      continue;
    }

    const update: Partial<ISystemGrant> = {
      principalId: targetObjectId,
      tenantId: targetTenantId,
    };
    await SystemGrant.updateOne(
      { _id: grant._id },
      { $set: update },
      migrationWriteOptions(session),
    );
    modified += 1;
  }

  return {
    scopeKey: 'systemGrant',
    matched: sourceGrants.length,
    modified,
    skipped,
  };
}

async function reassignUserConfigs(
  mongoose: typeof import('mongoose'),
  sourceUserId: string,
  targetUserId: string,
  targetTenantId: string,
  session?: ClientSession,
): Promise<CollectionMigrationResult> {
  const Config = getModel<IConfig>(mongoose, 'Config');
  const result = await Config.updateMany(
    {
      principalType: PrincipalType.USER,
      principalId: sourceUserId,
    },
    { $set: { principalId: targetUserId, tenantId: targetTenantId } },
    migrationWriteOptions(session),
  );

  return {
    scopeKey: 'config',
    matched: result.matchedCount ?? 0,
    modified: result.modifiedCount ?? 0,
    skipped: 0,
  };
}

async function reassignEntry(
  mongoose: typeof import('mongoose'),
  deps: MigrationDeps,
  entry: OwnedCollectionEntry,
  sourceUserId: string,
  targetUserId: string,
  targetTenantId: string,
  session?: ClientSession,
): Promise<CollectionMigrationResult> {
  switch (entry.special) {
    case 'conversationTag':
      return reassignConversationTags(
        mongoose,
        sourceUserId,
        targetUserId,
        targetTenantId,
        session,
      );
    case 'prompts':
      return reassignPromptGroups(
        mongoose,
        deps,
        sourceUserId,
        targetUserId,
        targetTenantId,
        session,
      );
    case 'mcp':
      return reassignMcpServers(
        mongoose,
        deps,
        sourceUserId,
        targetUserId,
        targetTenantId,
        session,
      );
    case 'acl':
      return reassignAclPrincipalEntries(
        mongoose,
        sourceUserId,
        targetUserId,
        targetTenantId,
        session,
      );
    case 'balance':
      return migrateBalance(mongoose, sourceUserId, targetUserId, targetTenantId, session);
    case 'systemGrant':
      return reassignSystemGrants(mongoose, sourceUserId, targetUserId, targetTenantId, session);
    case 'config':
      return reassignUserConfigs(mongoose, sourceUserId, targetUserId, targetTenantId, session);
    default:
      return reassignGeneric(mongoose, entry, sourceUserId, targetUserId, targetTenantId, session);
  }
}

export function createMigrationMethods(mongoose: typeof import('mongoose'), deps: MigrationDeps) {
  async function countUserData({
    sourceUserId,
    scopes,
  }: CountUserDataParams): Promise<Record<MigrationScope, number>> {
    const counts = {} as Record<MigrationScope, number>;
    const entries = getRegistryEntriesForScopes(scopes);

    for (const entry of entries) {
      try {
        counts[entry.scopeKey] = await countGeneric(mongoose, entry, sourceUserId);
      } catch (error) {
        logger.error(`[countUserData] Failed for ${entry.scopeKey}:`, error);
        counts[entry.scopeKey] = 0;
      }
    }

    return counts;
  }

  async function reassignUserData({
    sourceUserId,
    targetUserId,
    targetTenantId,
    scopes,
    session,
  }: ReassignUserDataParams): Promise<CollectionMigrationResult[]> {
    const entries = getRegistryEntriesForScopes(scopes);
    const results: CollectionMigrationResult[] = [];

    for (const entry of entries) {
      try {
        const result = await reassignEntry(
          mongoose,
          deps,
          entry,
          sourceUserId,
          targetUserId,
          targetTenantId,
          session,
        );
        results.push(result);
      } catch (error) {
        logger.error(`[reassignUserData] Failed for ${entry.scopeKey}:`, error);
        throw error;
      }
    }

    return results;
  }

  return {
    countUserData,
    reassignUserData,
  };
}

export type MigrationMethods = ReturnType<typeof createMigrationMethods>;
