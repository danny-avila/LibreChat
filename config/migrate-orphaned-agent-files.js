const path = require('path');
const { logger, runAsSystem } = require('@librechat/data-schemas');
const { TOOL_RESOURCE_KEYS, collectToolResourceFileIds } = require('@librechat/api');

require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const connect = require('./connect');

const { Agent, File } = require('~/db/models');

/**
 * Cap on the number of per-agent entries we retain in `results.details`. Larger
 * runs still update every affected agent and still report accurate aggregate
 * counts — we just stop accumulating sample data past this threshold to keep
 * memory bounded on deployments with thousands of corrupted agents.
 */
const DETAIL_SAMPLE_LIMIT = 50;

/**
 * Cleans up orphaned file_id references from agent `tool_resources` — that is,
 * file_ids that remain on an agent after the underlying File document has
 * already been deleted (see issue #12776). These stubs otherwise accumulate and
 * eventually block new uploads with "Duplicate file detected."
 *
 * Safe to re-run — if there are no orphans, nothing is written.
 *
 * @param {{ dryRun?: boolean, batchSize?: number }} [options]
 */
async function migrateOrphanedAgentFiles({ dryRun = true, batchSize = 100 } = {}) {
  await connect();

  logger.info('Starting Orphaned Agent Files Migration', { dryRun, batchSize });

  /*
   * Scan and heal across every tenant. Without this wrapper the tenant
   * isolation plugin either scopes queries to a (non-existent) tenant or
   * throws under TENANT_ISOLATION_STRICT=true, making the script unusable
   * as the intended remediation path for corrupted agents.
   */
  return runAsSystem(async () => {
    const totalAgents = await Agent.countDocuments();
    logger.info(`Scanning ${totalAgents} agent(s) for orphaned file references`);

    const results = {
      dryRun,
      scannedAgents: 0,
      agentsWithOrphans: 0,
      agentsUpdated: 0,
      totalOrphansRemoved: 0,
      errors: 0,
      details: [],
    };

    const cursor = Agent.find({}, { id: 1, name: 1, tool_resources: 1 })
      .lean()
      .cursor({ batchSize });

    for await (const agent of cursor) {
      results.scannedAgents++;

      try {
        const referencedFileIds = collectToolResourceFileIds(agent.tool_resources);
        if (referencedFileIds.length === 0) {
          continue;
        }

        const existing = await File.find(
          { file_id: { $in: referencedFileIds } },
          { file_id: 1, _id: 0 },
        ).lean();
        const existingIds = new Set(existing.map((f) => f.file_id));
        const orphans = referencedFileIds.filter((id) => !existingIds.has(id));
        if (orphans.length === 0) {
          continue;
        }

        results.agentsWithOrphans++;
        results.totalOrphansRemoved += orphans.length;
        if (results.details.length < DETAIL_SAMPLE_LIMIT) {
          results.details.push({
            agentId: agent.id,
            name: agent.name,
            orphanCount: orphans.length,
            orphans,
          });
        }

        if (dryRun) {
          logger.debug(`[dry-run] Would prune ${orphans.length} orphan(s) from agent ${agent.id}`);
          continue;
        }

        const pullAllOps = {};
        for (const key of TOOL_RESOURCE_KEYS) {
          pullAllOps[`tool_resources.${key}.file_ids`] = orphans;
        }
        const updateResult = await Agent.updateOne({ _id: agent._id }, { $pullAll: pullAllOps });
        if (updateResult.modifiedCount > 0) {
          results.agentsUpdated++;
          logger.info(
            `Pruned ${orphans.length} orphan(s) from agent "${agent.name}" (${agent.id})`,
          );
        }
      } catch (error) {
        results.errors++;
        logger.error(`Failed to process agent ${agent.id}`, { error: error.message });
      }
    }

    logger.info('Orphaned Agent Files Migration completed', {
      dryRun,
      scannedAgents: results.scannedAgents,
      agentsWithOrphans: results.agentsWithOrphans,
      agentsUpdated: results.agentsUpdated,
      totalOrphansRemoved: results.totalOrphansRemoved,
      errors: results.errors,
    });

    return results;
  });
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  const batchSize =
    parseInt(process.argv.find((arg) => arg.startsWith('--batch-size='))?.split('=')[1]) || 100;

  migrateOrphanedAgentFiles({ dryRun, batchSize })
    .then((result) => {
      console.log(`\n=== ${dryRun ? 'DRY RUN ' : ''}RESULTS ===`);
      console.log(`Agents scanned: ${result.scannedAgents}`);
      console.log(`Agents with orphans: ${result.agentsWithOrphans}`);
      console.log(
        `Orphan references ${dryRun ? 'to remove' : 'removed'}: ${result.totalOrphansRemoved}`,
      );
      if (!dryRun) {
        console.log(`Agents updated: ${result.agentsUpdated}`);
      }
      if (result.errors > 0) {
        console.log(`Errors: ${result.errors}`);
      }
      if (result.details.length > 0) {
        console.log('\nAffected agents:');
        result.details.forEach((d, i) => {
          console.log(`  ${i + 1}. "${d.name}" (${d.agentId}) — ${d.orphanCount} orphan(s)`);
        });
        if (result.agentsWithOrphans > result.details.length) {
          console.log(
            `  ... and ${result.agentsWithOrphans - result.details.length} more (sample capped at ${DETAIL_SAMPLE_LIMIT})`,
          );
        }
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error('Orphaned agent files migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateOrphanedAgentFiles };
