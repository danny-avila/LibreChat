import { logger } from '@librechat/data-schemas';
import { AccessRoleIds, ResourceType, PrincipalType, Constants } from 'librechat-data-provider';
import { ensureRequiredCollectionsExist } from '../db/utils';
import type { AccessRoleMethods, IPromptGroupDocument } from '@librechat/data-schemas';
import type { Model, Mongoose } from 'mongoose';

const { GLOBAL_PROJECT_NAME } = Constants;

export interface PromptMigrationCheckDbMethods {
  findRoleByIdentifier: AccessRoleMethods['findRoleByIdentifier'];
  getProjectByName: (
    projectName: string,
    fieldsToSelect?: string[] | null,
  ) => Promise<{
    promptGroupIds?: string[];
    [key: string]: unknown;
  } | null>;
}

export interface PromptMigrationCheckParams {
  mongoose: Mongoose;
  methods: PromptMigrationCheckDbMethods;
  PromptGroupModel: Model<IPromptGroupDocument>;
}

interface PromptGroupMigrationData {
  _id: string;
  name: string;
  author: string;
  authorName?: string;
  category?: string;
}

export interface PromptMigrationCheckResult {
  totalToMigrate: number;
  globalViewAccess: number;
  privateGroups: number;
  details?: {
    globalViewAccess: Array<{ name: string; _id: string; category: string }>;
    privateGroups: Array<{ name: string; _id: string; category: string }>;
  };
}

/**
 * Check if prompt groups need to be migrated to the new permission system
 * This performs a dry-run check similar to the migration script
 */
export async function checkPromptPermissionsMigration({
  methods,
  mongoose,
  PromptGroupModel,
}: PromptMigrationCheckParams): Promise<PromptMigrationCheckResult> {
  logger.debug('Checking if prompt permissions migration is needed');

  try {
    /** Native MongoDB database instance */
    const db = mongoose.connection.db;
    if (db) {
      await ensureRequiredCollectionsExist(db);
    }

    // Verify required roles exist
    const ownerRole = await methods.findRoleByIdentifier(AccessRoleIds.PROMPTGROUP_OWNER);
    const viewerRole = await methods.findRoleByIdentifier(AccessRoleIds.PROMPTGROUP_VIEWER);
    const editorRole = await methods.findRoleByIdentifier(AccessRoleIds.PROMPTGROUP_EDITOR);

    if (!ownerRole || !viewerRole || !editorRole) {
      logger.warn(
        'Required promptGroup roles not found. Permission system may not be fully initialized.',
      );
      return {
        totalToMigrate: 0,
        globalViewAccess: 0,
        privateGroups: 0,
      };
    }

    /** Global project prompt group IDs */
    const globalProject = await methods.getProjectByName(GLOBAL_PROJECT_NAME, ['promptGroupIds']);
    const globalPromptGroupIds = new Set(
      (globalProject?.promptGroupIds || []).map((id) => id.toString()),
    );

    // Find promptGroups without ACL entries (no batching for efficiency on startup)
    const promptGroupsToMigrate: PromptGroupMigrationData[] = await PromptGroupModel.aggregate([
      {
        $lookup: {
          from: 'aclentries',
          localField: '_id',
          foreignField: 'resourceId',
          as: 'aclEntries',
        },
      },
      {
        $addFields: {
          promptGroupAclEntries: {
            $filter: {
              input: '$aclEntries',
              as: 'aclEntry',
              cond: {
                $and: [
                  { $eq: ['$$aclEntry.resourceType', ResourceType.PROMPTGROUP] },
                  { $eq: ['$$aclEntry.principalType', PrincipalType.USER] },
                ],
              },
            },
          },
        },
      },
      {
        $match: {
          author: { $exists: true, $ne: null },
          promptGroupAclEntries: { $size: 0 },
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          author: 1,
          authorName: 1,
          category: 1,
        },
      },
    ]);

    const categories: {
      globalViewAccess: PromptGroupMigrationData[];
      privateGroups: PromptGroupMigrationData[];
    } = {
      globalViewAccess: [],
      privateGroups: [],
    };

    promptGroupsToMigrate.forEach((group) => {
      const isGlobalGroup = globalPromptGroupIds.has(group._id.toString());

      if (isGlobalGroup) {
        categories.globalViewAccess.push(group);
      } else {
        categories.privateGroups.push(group);
      }
    });

    const result: PromptMigrationCheckResult = {
      totalToMigrate: promptGroupsToMigrate.length,
      globalViewAccess: categories.globalViewAccess.length,
      privateGroups: categories.privateGroups.length,
    };

    // Add details for debugging
    if (promptGroupsToMigrate.length > 0) {
      result.details = {
        globalViewAccess: categories.globalViewAccess.map((g) => ({
          name: g.name,
          _id: g._id.toString(),
          category: g.category || 'uncategorized',
        })),
        privateGroups: categories.privateGroups.map((g) => ({
          name: g.name,
          _id: g._id.toString(),
          category: g.category || 'uncategorized',
        })),
      };
    }

    logger.debug('Prompt migration check completed', {
      totalToMigrate: result.totalToMigrate,
      globalViewAccess: result.globalViewAccess,
      privateGroups: result.privateGroups,
    });

    return result;
  } catch (error) {
    logger.error('Failed to check prompt permissions migration', error);
    // Return zero counts on error to avoid blocking startup
    return {
      totalToMigrate: 0,
      globalViewAccess: 0,
      privateGroups: 0,
    };
  }
}

/**
 * Log migration warning to console if prompt groups need migration
 */
export function logPromptMigrationWarning(result: PromptMigrationCheckResult): void {
  if (result.totalToMigrate === 0) {
    return;
  }

  // Create a visible warning box
  const border = '='.repeat(80);
  const warning = [
    '',
    border,
    '                   IMPORTANT: PROMPT PERMISSIONS MIGRATION REQUIRED',
    border,
    '',
    `  Total prompt groups to migrate: ${result.totalToMigrate}`,
    `  - Global View Access: ${result.globalViewAccess} prompt groups`,
    `  - Private Prompt Groups: ${result.privateGroups} prompt groups`,
    '',
    '  The new prompt sharing system requires migrating existing prompt groups.',
    '  Please run the following command to migrate your prompts:',
    '',
    '    npm run migrate:prompt-permissions',
    '',
    '  For a dry run (preview) of what will be migrated:',
    '',
    '    npm run migrate:prompt-permissions:dry-run',
    '',
    '  This migration will:',
    '  1. Grant owner permissions to prompt authors',
    '  2. Set public view permissions for prompts in the global project',
    '  3. Keep private prompts accessible only to their authors',
    '',
    border,
    '',
  ];

  // Use console methods directly for visibility
  console.log('\n' + warning.join('\n') + '\n');

  // Also log with logger for consistency
  logger.warn('Prompt permissions migration required', {
    totalToMigrate: result.totalToMigrate,
    globalViewAccess: result.globalViewAccess,
    privateGroups: result.privateGroups,
  });
}
