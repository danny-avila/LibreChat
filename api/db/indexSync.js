const mongoose = require('mongoose');
const { MeiliSearch, MeiliSearchTimeOutError } = require('meilisearch');
const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const {
  isEnabled,
  FlowStateManager,
  MEILI_HTTP_REQUEST_TIMEOUT_MS,
  MEILI_INDEX_SYNC_INTERVAL_MS,
  MEILI_INDEX_SYNC_TIMEOUT_MS,
  runDistributedJob,
  waitForMeiliTask,
} = require('@librechat/api');
const { getLogStores } = require('~/cache');
const { batchResetMeiliFlags } = require('./utils');

const searchEnabled = isEnabled(process.env.SEARCH);
const indexingDisabled = isEnabled(process.env.MEILI_NO_SYNC);

const defaultSyncThreshold = 1000;
const syncThreshold = process.env.MEILI_SYNC_THRESHOLD
  ? parseInt(process.env.MEILI_SYNC_THRESHOLD, 10)
  : defaultSyncThreshold;

class MeiliSearchClient {
  static instance = null;

  static getInstance() {
    if (!MeiliSearchClient.instance) {
      if (!process.env.MEILI_HOST || !process.env.MEILI_MASTER_KEY) {
        throw new Error('Meilisearch configuration is missing.');
      }
      MeiliSearchClient.instance = new MeiliSearch({
        host: process.env.MEILI_HOST,
        apiKey: process.env.MEILI_MASTER_KEY,
        timeout: MEILI_HTTP_REQUEST_TIMEOUT_MS,
      });
    }
    return MeiliSearchClient.instance;
  }
}

/**
 * Deletes documents from MeiliSearch index that are missing the user field
 * @param {import('meilisearch').Index} index - MeiliSearch index instance
 * @param {string} indexName - Name of the index for logging
 * @param {string} primaryKey - Primary key configured for the index
 * @returns {Promise<number>} - Number of documents deleted
 */
async function deleteDocumentsWithoutUserField(index, indexName, primaryKey, signal) {
  let deletedCount = 0;
  let offset = 0;
  let previousPageSignature;
  const batchSize = 1000;

  try {
    while (true) {
      const searchResult = await index.search('', {
        limit: batchSize,
        offset: offset,
      });

      if (searchResult.hits.length === 0) {
        break;
      }

      const orphanedHits = searchResult.hits.filter((hit) => !hit.user);
      const missingPrimaryKey = orphanedHits.some((hit) => hit[primaryKey] == null);
      if (missingPrimaryKey) {
        throw new Error(`[indexSync] Cannot clean ${indexName} document without ${primaryKey}`);
      }
      const pageSignature = `${offset}:${searchResult.hits
        .map((hit) => String(hit[primaryKey]))
        .join(',')}`;
      if (pageSignature === previousPageSignature) {
        throw new Error(`[indexSync] ${indexName} cleanup made no progress`);
      }
      previousPageSignature = pageSignature;
      const idsToDelete = orphanedHits.map((hit) => hit[primaryKey]);

      if (idsToDelete.length > 0) {
        logger.info(
          `[indexSync] Deleting ${idsToDelete.length} documents without user field from ${indexName} index`,
        );
        const deletion = await index.deleteDocuments(idsToDelete);
        await waitForMeiliTask(
          MeiliSearchClient.getInstance(),
          deletion.taskUid,
          `${indexName} cleanup`,
          (error) => error instanceof MeiliSearchTimeOutError,
          { signal },
        );
        deletedCount += idsToDelete.length;
      }

      if (searchResult.hits.length < batchSize) {
        break;
      }

      offset += searchResult.hits.length - idsToDelete.length;
    }

    if (deletedCount > 0) {
      logger.info(`[indexSync] Deleted ${deletedCount} orphaned documents from ${indexName} index`);
    }
  } catch (error) {
    logger.error(`[indexSync] Error deleting documents from ${indexName}:`, error);
    throw error;
  }

  return deletedCount;
}

/**
 * Ensures indexes have proper filterable attributes configured and checks if documents have user field
 * @param {MeiliSearch} client - MeiliSearch client instance
 * @returns {Promise<{
 *   messagesSettingsUpdated: boolean,
 *   conversationsSettingsUpdated: boolean,
 *   orphanedDocsFound: boolean,
 *   missingIndexes: {messages: boolean, conversations: boolean}
 * }>} - Status of what was done
 */
async function ensureFilterableAttributes(client, signal) {
  let messagesSettingsUpdated = false;
  let conversationsSettingsUpdated = false;
  let hasOrphanedDocs = false;
  const missingIndexes = {
    messages: false,
    conversations: false,
  };

  try {
    // Check and update messages index
    try {
      const messagesIndex = client.index('messages');
      const settings = await messagesIndex.getSettings();

      if (!settings.filterableAttributes || !settings.filterableAttributes.includes('user')) {
        logger.info('[indexSync] Configuring messages index to filter by user...');
        const settingsTask = await messagesIndex.updateSettings({
          filterableAttributes: ['user'],
        });
        await waitForMeiliTask(
          client,
          settingsTask.taskUid,
          'messages settings',
          (error) => error instanceof MeiliSearchTimeOutError,
          { signal },
        );
        logger.info('[indexSync] Messages index configured for user filtering');
        messagesSettingsUpdated = true;
      }

      // Check if existing documents have user field indexed
      try {
        const searchResult = await messagesIndex.search('', { limit: 1 });
        if (searchResult.hits.length > 0 && !searchResult.hits[0].user) {
          logger.info(
            '[indexSync] Existing messages missing user field, will clean up orphaned documents...',
          );
          hasOrphanedDocs = true;
        }
      } catch (searchError) {
        if (searchError.code === 'index_not_found') {
          missingIndexes.messages = true;
        } else {
          throw searchError;
        }
      }
    } catch (error) {
      if (error.code === 'index_not_found') {
        missingIndexes.messages = true;
      } else {
        logger.warn('[indexSync] Could not check/update messages index settings:', error.message);
        throw error;
      }
    }

    // Check and update conversations index
    try {
      const convosIndex = client.index('convos');
      const settings = await convosIndex.getSettings();

      if (!settings.filterableAttributes || !settings.filterableAttributes.includes('user')) {
        logger.info('[indexSync] Configuring convos index to filter by user...');
        const settingsTask = await convosIndex.updateSettings({
          filterableAttributes: ['user'],
        });
        await waitForMeiliTask(
          client,
          settingsTask.taskUid,
          'convos settings',
          (error) => error instanceof MeiliSearchTimeOutError,
          { signal },
        );
        logger.info('[indexSync] Convos index configured for user filtering');
        conversationsSettingsUpdated = true;
      }

      // Check if existing documents have user field indexed
      try {
        const searchResult = await convosIndex.search('', { limit: 1 });
        if (searchResult.hits.length > 0 && !searchResult.hits[0].user) {
          logger.info(
            '[indexSync] Existing conversations missing user field, will clean up orphaned documents...',
          );
          hasOrphanedDocs = true;
        }
      } catch (searchError) {
        if (searchError.code === 'index_not_found') {
          missingIndexes.conversations = true;
        } else {
          throw searchError;
        }
      }
    } catch (error) {
      if (error.code === 'index_not_found') {
        missingIndexes.conversations = true;
      } else {
        logger.warn('[indexSync] Could not check/update convos index settings:', error.message);
        throw error;
      }
    }

    // If either index has orphaned documents, clean them up (but don't force resync)
    if (hasOrphanedDocs) {
      try {
        const messagesIndex = client.index('messages');
        await deleteDocumentsWithoutUserField(messagesIndex, 'messages', 'messageId', signal);
      } catch (error) {
        if (error.code === 'index_not_found') {
          missingIndexes.messages = true;
          logger.debug('[indexSync] Messages index disappeared before cleanup');
        } else {
          throw error;
        }
      }

      try {
        const convosIndex = client.index('convos');
        await deleteDocumentsWithoutUserField(convosIndex, 'convos', 'conversationId', signal);
      } catch (error) {
        if (error.code === 'index_not_found') {
          missingIndexes.conversations = true;
          logger.debug('[indexSync] Conversations index disappeared before cleanup');
        } else {
          throw error;
        }
      }

      logger.info('[indexSync] Orphaned documents cleaned up without forcing resync.');
    }

    if (messagesSettingsUpdated || conversationsSettingsUpdated) {
      logger.info('[indexSync] Index settings updated. Full re-sync will be triggered.');
    }
  } catch (error) {
    logger.error('[indexSync] Error ensuring filterable attributes:', error);
    throw error;
  }

  return {
    messagesSettingsUpdated,
    conversationsSettingsUpdated,
    orphanedDocsFound: hasOrphanedDocs,
    missingIndexes,
  };
}

async function rebuildMissingIndex(client, indexName, primaryKey, signal) {
  logger.info(`[indexSync] Recreating missing ${indexName} index...`);
  const creationTask = await client.createIndex(indexName, { primaryKey });
  await waitForMeiliTask(
    client,
    creationTask.taskUid,
    `${indexName} creation`,
    (error) => error instanceof MeiliSearchTimeOutError,
    {
      isTaskSuccessful: (task) =>
        task.status === 'succeeded' || task.error?.code === 'index_already_exists',
      signal,
    },
  );

  const index = client.index(indexName);
  const settingsTask = await index.updateSettings({
    filterableAttributes: ['user'],
  });
  await waitForMeiliTask(
    client,
    settingsTask.taskUid,
    `${indexName} settings`,
    (error) => error instanceof MeiliSearchTimeOutError,
    { signal },
  );
}

/**
 * Performs the actual sync operations for messages and conversations
 * @param {FlowStateManager} flowManager - Flow state manager instance
 * @param {string} flowId - Flow identifier
 * @param {string} flowType - Flow type
 * @param {{quiet?: boolean, signal?: AbortSignal}} options - Reconciliation options
 */
async function performSync(flowManager, flowId, flowType, options = {}) {
  const logProgress = options.quiet ? logger.debug.bind(logger) : logger.info.bind(logger);
  try {
    if (indexingDisabled === true) {
      logger.info('[indexSync] Indexing is disabled, skipping...');
      return { messagesSync: false, convosSync: false };
    }

    const Message = mongoose.models.Message;
    const Conversation = mongoose.models.Conversation;
    if (!Message || !Conversation) {
      throw new Error(
        '[indexSync] Models not registered. Ensure createModels() has been called before indexSync.',
      );
    }

    const client = MeiliSearchClient.getInstance();

    const { status } = await client.health();
    if (status !== 'available') {
      throw new Error('Meilisearch not available');
    }

    /** Ensures indexes have proper filterable attributes configured */
    const {
      messagesSettingsUpdated,
      conversationsSettingsUpdated,
      orphanedDocsFound: _orphanedDocsFound,
      missingIndexes,
    } = await ensureFilterableAttributes(client, options.signal);

    let messagesSync = false;
    let convosSync = false;

    if (missingIndexes.messages) {
      logger.warn(
        '[indexSync] Messages index is missing. Resetting message acknowledgements for recovery.',
      );
      await rebuildMissingIndex(client, 'messages', 'messageId', options.signal);
    }
    if (missingIndexes.conversations) {
      logger.warn(
        '[indexSync] Conversations index is missing. Resetting conversation acknowledgements for recovery.',
      );
      await rebuildMissingIndex(client, 'convos', 'conversationId', options.signal);
    }

    if (messagesSettingsUpdated) {
      logger.info('[indexSync] Messages settings updated. Forcing full message re-sync...');
      await batchResetMeiliFlags(Message.collection);
    } else if (missingIndexes.messages) {
      await batchResetMeiliFlags(Message.collection);
    }
    if (conversationsSettingsUpdated) {
      logger.info(
        '[indexSync] Conversations settings updated. Forcing full conversation re-sync...',
      );
      await batchResetMeiliFlags(Conversation.collection);
    } else if (missingIndexes.conversations) {
      await batchResetMeiliFlags(Conversation.collection);
    }

    let messageSyncError;
    try {
      // Check if we need to sync messages
      logProgress('[indexSync] Requesting message sync progress...');
      const messageProgress = await Message.getSyncProgress();
      const forceMessageSync = messagesSettingsUpdated || missingIndexes.messages;
      if (!messageProgress.isComplete || forceMessageSync) {
        logger.info(
          `[indexSync] Messages need syncing: ${messageProgress.totalProcessed}/${messageProgress.totalDocuments} indexed`,
        );

        const messageCount = messageProgress.totalDocuments;
        const messagesIndexed = messageProgress.totalProcessed;
        const unindexedMessages = messageCount - messagesIndexed;
        const messagesPendingIndexing = messageProgress.pendingIndexing ?? 0;
        const messagesPendingCleanup = messageProgress.pendingCleanup ?? 0;
        const noneIndexed = messagesIndexed === 0 && unindexedMessages > 0;

        if (
          forceMessageSync ||
          noneIndexed ||
          messagesPendingIndexing > 0 ||
          unindexedMessages > syncThreshold
        ) {
          if (noneIndexed && !forceMessageSync) {
            logger.info('[indexSync] No messages marked as indexed, forcing full sync');
          }
          logger.info(
            messagesPendingCleanup > 0
              ? `[indexSync] Starting message sync (${unindexedMessages} unindexed, ${messagesPendingCleanup} pending cleanup)`
              : `[indexSync] Starting message sync (${unindexedMessages} unindexed)`,
          );
          await Message.syncWithMeili();
          messagesSync = true;
        } else if (messagesPendingCleanup > 0) {
          logger.info(
            `[indexSync] Cleaning ${messagesPendingCleanup} excluded messages from search`,
          );
          await Message.cleanupExcludedMeiliIndex();
          messagesSync = true;
        } else if (unindexedMessages > 0) {
          logger.info(
            `[indexSync] ${unindexedMessages} messages unindexed (below threshold: ${syncThreshold}, skipping)`,
          );
        }
      } else {
        logProgress(
          `[indexSync] Messages are fully synced: ${messageProgress.totalProcessed}/${messageProgress.totalDocuments}`,
        );
      }
    } catch (error) {
      messageSyncError = error;
      logger.error(
        '[indexSync] Message reconciliation failed; continuing with conversations:',
        error,
      );
    }

    // Check if we need to sync conversations
    const convoProgress = await Conversation.getSyncProgress();
    const forceConvoSync = conversationsSettingsUpdated || missingIndexes.conversations;
    if (!convoProgress.isComplete || forceConvoSync) {
      logger.info(
        `[indexSync] Conversations need syncing: ${convoProgress.totalProcessed}/${convoProgress.totalDocuments} indexed`,
      );

      const convoCount = convoProgress.totalDocuments;
      const convosIndexed = convoProgress.totalProcessed;
      const unindexedConvos = convoCount - convosIndexed;
      const convosPendingIndexing = convoProgress.pendingIndexing ?? 0;
      const convosPendingCleanup = convoProgress.pendingCleanup ?? 0;
      const noneConvosIndexed = convosIndexed === 0 && unindexedConvos > 0;

      if (
        forceConvoSync ||
        noneConvosIndexed ||
        convosPendingIndexing > 0 ||
        unindexedConvos > syncThreshold
      ) {
        if (noneConvosIndexed && !forceConvoSync) {
          logger.info('[indexSync] No conversations marked as indexed, forcing full sync');
        }
        logger.info(
          convosPendingCleanup > 0
            ? `[indexSync] Starting convos sync (${unindexedConvos} unindexed, ${convosPendingCleanup} pending cleanup)`
            : `[indexSync] Starting convos sync (${unindexedConvos} unindexed)`,
        );
        await Conversation.syncWithMeili();
        convosSync = true;
      } else if (convosPendingCleanup > 0) {
        logger.info(
          `[indexSync] Cleaning ${convosPendingCleanup} excluded conversations from search`,
        );
        await Conversation.cleanupExcludedMeiliIndex();
        convosSync = true;
      } else if (unindexedConvos > 0) {
        logger.info(
          `[indexSync] ${unindexedConvos} convos unindexed (below threshold: ${syncThreshold}, skipping)`,
        );
      }
    } else {
      logProgress(
        `[indexSync] Conversations are fully synced: ${convoProgress.totalProcessed}/${convoProgress.totalDocuments}`,
      );
    }

    if (messageSyncError) {
      throw messageSyncError;
    }

    return { messagesSync, convosSync };
  } finally {
    if (indexingDisabled === true) {
      logger.info('[indexSync] Indexing is disabled, skipping cleanup...');
    } else if (flowManager && flowId && flowType) {
      try {
        await flowManager.deleteFlow(flowId, flowType);
        logger.debug('[indexSync] Flow state cleaned up');
      } catch (cleanupErr) {
        logger.debug('[indexSync] Could not clean up flow state:', cleanupErr.message);
      }
    }
  }
}

/**
 * Main index sync function that uses FlowStateManager to prevent concurrent execution
 */
async function runIndexSync(options = {}) {
  if (!options.quiet) {
    logger.info('[indexSync] Starting index synchronization check...');
  }

  // Get or create FlowStateManager instance
  const flowsCache = getLogStores(CacheKeys.FLOWS);
  if (!flowsCache) {
    logger.warn('[indexSync] Flows cache not available, falling back to direct sync');
    return await performSync(null, null, null, options);
  }

  const flowManager = new FlowStateManager(flowsCache, {
    ttl: 60000 * 10, // 10 minutes TTL for sync operations
  });

  // Use a unique flow ID for the sync operation
  const flowId = 'meili-index-sync';
  const flowType = 'MEILI_SYNC';

  try {
    // This will only execute the handler if no other instance is running the sync
    const result = await flowManager.createFlowWithHandler(flowId, flowType, () =>
      performSync(flowManager, flowId, flowType, options),
    );

    if (result.messagesSync || result.convosSync) {
      logger.info('[indexSync] Sync completed successfully');
    } else {
      logger.debug('[indexSync] No sync was needed');
    }

    return result;
  } catch (err) {
    if (err.message.includes('flow already exists')) {
      const log = options.quiet ? logger.debug.bind(logger) : logger.info.bind(logger);
      log('[indexSync] Sync already running on another instance');
      return;
    }

    if (err.message.includes('Meilisearch not configured')) {
      logger.info('[indexSync] Meilisearch not configured, search will be disabled.');
    } else {
      logger.error('[indexSync] error', err);
      throw err;
    }
  }
}

async function indexSync(options = {}) {
  if (!searchEnabled) {
    return;
  }

  const jobs = mongoose.connection.collection('distributedJobs');
  return runDistributedJob(
    jobs,
    'meili-index-sync',
    (signal) => runIndexSync({ ...options, signal }),
    {
      completionTtlMs: MEILI_INDEX_SYNC_INTERVAL_MS,
      timeoutMs: MEILI_INDEX_SYNC_TIMEOUT_MS,
      signal: options.signal,
    },
  );
}

module.exports = indexSync;
