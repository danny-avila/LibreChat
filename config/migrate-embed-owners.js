const path = require('path');
const axios = require('axios');
const { logger, runAsSystem } = require('@librechat/data-schemas');
const { generateShortLivedToken } = require('@librechat/api');
const { EToolResources } = require('librechat-data-provider');

require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const connect = require('./connect');

const { Agent, File } = require('~/db/models');

/**
 * Cap on retained per-file samples in `results.details`. Larger runs still
 * update every resolvable file and still report accurate aggregate counts.
 * Mirrors `migrate-orphaned-agent-files.js`.
 */
const DETAIL_SAMPLE_LIMIT = 50;

/** Requests only read `/ids`; a slow service must not hang the migration. */
const REQUEST_TIMEOUT_MS = 15000;

/**
 * Backfills `File.entity_id` for files whose vector chunks were embedded under
 * an agent before the field existed (issue #14988).
 *
 * Mongo cannot answer "which entity owns these chunks": the owner was stamped
 * only in the vector store, and a file can sit in several agents'
 * `tool_resources` while exactly one agent's id was stamped at embed time. So
 * the owner is recovered from rag_api itself, which resolves a request's scope
 * as *user ∪ entity*:
 *
 *     GET /ids?entity_id=<agent>   →  the user's files ∪ that agent's files
 *     GET /ids                     →  the user's files
 *     difference                   →  exactly the files that agent owns
 *
 * A file no difference claims is never guessed at. It is reported: as
 * `userOwned` when the user's own scope lists it (nothing to backfill), and as
 * `unrecoverable` when nothing lists it — chunks owned by an entity that Mongo
 * can no longer name, usually a deleted agent.
 *
 * Requires `RAG_API_URL` to be reachable. Safe to re-run: files that already
 * record an owner are never scanned.
 *
 * @param {{ dryRun?: boolean, batchSize?: number }} [options]
 */
async function migrateEmbedOwners({ dryRun = true, batchSize = 100 } = {}) {
  if (!process.env.RAG_API_URL) {
    throw new Error(
      'RAG_API_URL is not set. The embed owner exists only in the vector store, so this migration cannot run without it.',
    );
  }

  await connect();

  logger.info('Starting Embed Owner Migration', { dryRun, batchSize });

  /*
   * Scan across every tenant, like `migrate-orphaned-agent-files.js`: without
   * this the tenant isolation plugin scopes queries to a non-existent tenant
   * or throws under TENANT_ISOLATION_STRICT=true.
   */
  return runAsSystem(async () => {
    const results = {
      dryRun,
      scannedFiles: 0,
      /* Owners the scope difference identified. A dry run reports the same
       * number an apply run would; only `filesUpdated` distinguishes them. */
      resolved: 0,
      filesUpdated: 0,
      userOwned: 0,
      ambiguous: [],
      unrecoverable: [],
      errors: 0,
      details: [],
    };

    /** file_id → Set(agent id) for every agent that lists it for file search. */
    const agentsByFileId = new Map();
    const agentCursor = Agent.find({}, { id: 1, tool_resources: 1 }).lean().cursor({ batchSize });
    for await (const agent of agentCursor) {
      const fileIds = agent.tool_resources?.[EToolResources.file_search]?.file_ids ?? [];
      for (const fileId of fileIds) {
        if (!agentsByFileId.has(fileId)) {
          agentsByFileId.set(fileId, new Set());
        }
        agentsByFileId.get(fileId).add(agent.id);
      }
    }

    /** user id → candidate files owned by that user. One `/ids` pair per user. */
    const candidatesByUser = new Map();
    const fileCursor = File.find(
      { embedded: true, entity_id: { $exists: false } },
      { file_id: 1, user: 1 },
    )
      .lean()
      .cursor({ batchSize });

    for await (const file of fileCursor) {
      results.scannedFiles++;
      const userId = file.user?.toString();
      if (!userId) {
        /* `user` is required by the schema, so this is a legacy or hand-edited
         * row. There is no token to mint and therefore no scope to read: report
         * it rather than crash the run or attribute it to somebody. */
        results.unrecoverable.push(file.file_id);
        continue;
      }
      if (!candidatesByUser.has(userId)) {
        candidatesByUser.set(userId, []);
      }
      candidatesByUser.get(userId).push(file);
    }

    for (const [userId, files] of candidatesByUser) {
      /* A short-lived token for the file's owner, the same mechanism the app
       * uses for every rag_api call. Read-only: this loop calls `/ids` only. */
      const token = generateShortLivedToken(userId);
      const scopedIds = async (entityId) => {
        const { data } = await axios.get(`${process.env.RAG_API_URL}/ids`, {
          headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
          ...(entityId ? { params: { entity_id: entityId } } : {}),
          timeout: REQUEST_TIMEOUT_MS,
        });
        return new Set(data);
      };

      let userScope;
      /** agent id → the file ids that agent owns, per the scope difference. */
      const ownedByAgent = new Map();
      try {
        userScope = await scopedIds();

        const agentIds = new Set();
        for (const file of files) {
          for (const agentId of agentsByFileId.get(file.file_id) ?? []) {
            agentIds.add(agentId);
          }
        }

        for (const agentId of agentIds) {
          const widened = await scopedIds(agentId);
          const owned = new Set();
          for (const fileId of widened) {
            if (!userScope.has(fileId)) {
              owned.add(fileId);
            }
          }
          ownedByAgent.set(agentId, owned);
        }
      } catch (error) {
        /* Fail closed for this user: a half-read scope cannot distinguish
         * "the agent does not own it" from "the service did not answer", and
         * guessing writes a wrong owner into the field that scopes deletes. */
        results.errors++;
        logger.error(`Failed to read rag_api scope for user ${userId}; skipped their files`, {
          error: error.message,
        });
        continue;
      }

      for (const file of files) {
        const claimants = [...(agentsByFileId.get(file.file_id) ?? [])].filter((agentId) =>
          ownedByAgent.get(agentId)?.has(file.file_id),
        );

        if (claimants.length > 1) {
          results.ambiguous.push({ fileId: file.file_id, agents: claimants });
          logger.warn(
            `File ${file.file_id} is claimed by ${claimants.length} agents; left untouched`,
          );
          continue;
        }

        if (claimants.length === 0) {
          if (userScope.has(file.file_id)) {
            results.userOwned++;
          } else {
            results.unrecoverable.push(file.file_id);
            logger.warn(
              `File ${file.file_id} is owned by an entity rag_api reports but Mongo cannot name; left untouched`,
            );
          }
          continue;
        }

        const [entityId] = claimants;
        results.resolved++;
        if (results.details.length < DETAIL_SAMPLE_LIMIT) {
          results.details.push({ fileId: file.file_id, entityId });
        }

        if (dryRun) {
          logger.debug(`[dry-run] Would set entity_id=${entityId} on file ${file.file_id}`);
          continue;
        }

        const updateResult = await File.updateOne(
          { _id: file._id },
          { $set: { entity_id: entityId } },
        );
        if (updateResult.modifiedCount > 0) {
          results.filesUpdated++;
          logger.info(`Recorded embed owner ${entityId} on file ${file.file_id}`);
        }
      }
    }

    logger.info('Embed Owner Migration completed', {
      dryRun,
      scannedFiles: results.scannedFiles,
      resolved: results.resolved,
      filesUpdated: results.filesUpdated,
      userOwned: results.userOwned,
      ambiguous: results.ambiguous.length,
      unrecoverable: results.unrecoverable.length,
      errors: results.errors,
    });

    return results;
  });
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  const batchSize =
    parseInt(process.argv.find((arg) => arg.startsWith('--batch-size='))?.split('=')[1]) || 100;

  migrateEmbedOwners({ dryRun, batchSize })
    .then((result) => {
      console.log(`\n=== ${dryRun ? 'DRY RUN ' : ''}RESULTS ===`);
      console.log(`Files scanned: ${result.scannedFiles}`);
      console.log(
        `Owners ${dryRun ? 'to record' : 'recorded'}: ${dryRun ? result.resolved : result.filesUpdated}`,
      );
      console.log(`Already user-owned (nothing to record): ${result.userOwned}`);
      if (result.details.length > 0) {
        console.log('\nResolved owners:');
        result.details.forEach((detail, index) => {
          console.log(`  ${index + 1}. ${detail.fileId} → ${detail.entityId}`);
        });
        if (result.resolved > result.details.length) {
          console.log(
            `  ... and ${result.resolved - result.details.length} more (sample capped at ${DETAIL_SAMPLE_LIMIT})`,
          );
        }
      }
      if (result.ambiguous.length > 0) {
        console.log('\nAmbiguous — claimed by more than one agent, left untouched:');
        result.ambiguous.forEach(({ fileId, agents }) => {
          console.log(`  ${fileId} → ${agents.join(', ')}`);
        });
      }
      if (result.unrecoverable.length > 0) {
        console.log('\nOwner unrecoverable — entity-owned chunks Mongo cannot attribute:');
        result.unrecoverable.forEach((fileId) => console.log(`  ${fileId}`));
      }
      if (result.errors > 0) {
        console.log(`\nErrors: ${result.errors} (those users' files were skipped, not guessed)`);
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error('Embed owner migration failed:', error.message);
      process.exit(1);
    });
}

module.exports = { migrateEmbedOwners };
