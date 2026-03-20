import { logger } from '@librechat/data-schemas';
import { AccessRoleIds, ResourceType, PrincipalType, Constants } from 'librechat-data-provider';
import { ensureRequiredCollectionsExist } from '../db/utils';
import type { AccessRoleMethods, IAgent } from '@librechat/data-schemas';
import type { Model, Mongoose } from 'mongoose';

const { GLOBAL_PROJECT_NAME } = Constants;

export interface MigrationCheckDbMethods {
  findRoleByIdentifier: AccessRoleMethods['findRoleByIdentifier'];
  getProjectByName: (
    projectName: string,
    fieldsToSelect?: string[] | null,
  ) => Promise<{
    agentIds?: string[];
    [key: string]: unknown;
  } | null>;
}

export interface MigrationCheckParams {
  mongoose: Mongoose;
  methods: MigrationCheckDbMethods;
  AgentModel: Model<IAgent>;
}

interface AgentMigrationData {
  _id: string;
  id: string;
  name: string;
  author: string;
  isCollaborative: boolean;
}

export interface MigrationCheckResult {
  totalToMigrate: number;
  globalEditAccess: number;
  globalViewAccess: number;
  privateAgents: number;
  details?: {
    globalEditAccess: Array<{ name: string; id: string }>;
    globalViewAccess: Array<{ name: string; id: string }>;
    privateAgents: Array<{ name: string; id: string }>;
  };
}

/**
 * Check if agents need to be migrated to the new permission system
 * This performs a dry-run check similar to the migration script
 */
export async function checkAgentPermissionsMigration({
  methods,
  mongoose,
  AgentModel,
}: MigrationCheckParams): Promise<MigrationCheckResult> {
  logger.debug('Checking if agent permissions migration is needed');

  try {
    const db = mongoose.connection.db;
    if (db) {
      await ensureRequiredCollectionsExist(db);
    }

    // Verify required roles exist
    const ownerRole = await methods.findRoleByIdentifier(AccessRoleIds.AGENT_OWNER);
    const viewerRole = await methods.findRoleByIdentifier(AccessRoleIds.AGENT_VIEWER);
    const editorRole = await methods.findRoleByIdentifier(AccessRoleIds.AGENT_EDITOR);

    if (!ownerRole || !viewerRole || !editorRole) {
      logger.warn(
        'Required agent roles not found. Permission system may not be fully initialized.',
      );
      return {
        totalToMigrate: 0,
        globalEditAccess: 0,
        globalViewAccess: 0,
        privateAgents: 0,
      };
    }

    // Get global project agent IDs
    const globalProject = await methods.getProjectByName(GLOBAL_PROJECT_NAME, ['agentIds']);
    const globalAgentIds = new Set(globalProject?.agentIds || []);

    // Find agents without ACL entries (no batching for efficiency on startup)
    const agentsToMigrate: AgentMigrationData[] = await AgentModel.aggregate([
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
          userAclEntries: {
            $filter: {
              input: '$aclEntries',
              as: 'aclEntry',
              cond: {
                $and: [
                  { $eq: ['$$aclEntry.resourceType', ResourceType.AGENT] },
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
          userAclEntries: { $size: 0 },
        },
      },
      {
        $project: {
          _id: 1,
          id: 1,
          name: 1,
          author: 1,
          isCollaborative: 1,
        },
      },
    ]);

    const categories: {
      globalEditAccess: AgentMigrationData[];
      globalViewAccess: AgentMigrationData[];
      privateAgents: AgentMigrationData[];
    } = {
      globalEditAccess: [],
      globalViewAccess: [],
      privateAgents: [],
    };

    agentsToMigrate.forEach((agent) => {
      const isGlobal = globalAgentIds.has(agent.id);
      const isCollab = agent.isCollaborative;

      if (isGlobal && isCollab) {
        categories.globalEditAccess.push(agent);
      } else if (isGlobal && !isCollab) {
        categories.globalViewAccess.push(agent);
      } else {
        categories.privateAgents.push(agent);
      }
    });

    const result: MigrationCheckResult = {
      totalToMigrate: agentsToMigrate.length,
      globalEditAccess: categories.globalEditAccess.length,
      globalViewAccess: categories.globalViewAccess.length,
      privateAgents: categories.privateAgents.length,
    };

    // Add details for debugging
    if (agentsToMigrate.length > 0) {
      result.details = {
        globalEditAccess: categories.globalEditAccess.map((a) => ({
          name: a.name,
          id: a.id,
        })),
        globalViewAccess: categories.globalViewAccess.map((a) => ({
          name: a.name,
          id: a.id,
        })),
        privateAgents: categories.privateAgents.map((a) => ({
          name: a.name,
          id: a.id,
        })),
      };
    }

    logger.debug('Agent migration check completed', {
      totalToMigrate: result.totalToMigrate,
      globalEditAccess: result.globalEditAccess,
      globalViewAccess: result.globalViewAccess,
      privateAgents: result.privateAgents,
    });

    return result;
  } catch (error) {
    logger.error('Failed to check agent permissions migration', error);
    // Return zero counts on error to avoid blocking startup
    return {
      totalToMigrate: 0,
      globalEditAccess: 0,
      globalViewAccess: 0,
      privateAgents: 0,
    };
  }
}

/**
 * Log migration warning to console if agents need migration
 */
export function logAgentMigrationWarning(result: MigrationCheckResult): void {
  if (result.totalToMigrate === 0) {
    return;
  }

  // Create a visible warning box
  const border = '='.repeat(80);
  const warning = [
    '',
    border,
    '                    IMPORTANT: AGENT PERMISSIONS MIGRATION REQUIRED',
    border,
    '',
    `  Total agents to migrate: ${result.totalToMigrate}`,
    `  - Global Edit Access: ${result.globalEditAccess} agents`,
    `  - Global View Access: ${result.globalViewAccess} agents`,
    `  - Private Agents: ${result.privateAgents} agents`,
    '',
    '  The new agent sharing system requires migrating existing agents.',
    '  Please run the following command to migrate your agents:',
    '',
    '    npm run migrate:agent-permissions',
    '',
    '  For a dry run (preview) of what will be migrated:',
    '',
    '    npm run migrate:agent-permissions:dry-run',
    '',
    '  This migration will:',
    '  1. Grant owner permissions to agent authors',
    '  2. Set appropriate public permissions based on global project status',
    '  3. Preserve existing collaborative settings',
    '',
    border,
    '',
  ];

  // Use console methods directly for visibility
  console.log('\n' + warning.join('\n') + '\n');

  // Also log with logger for consistency
  logger.warn('Agent permissions migration required', {
    totalToMigrate: result.totalToMigrate,
    globalEditAccess: result.globalEditAccess,
    globalViewAccess: result.globalViewAccess,
    privateAgents: result.privateAgents,
  });
}
