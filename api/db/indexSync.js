const mongoose = require('mongoose');
const { MeiliSearch } = require('meilisearch');
const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const { isEnabled, FlowStateManager } = require('@librechat/api');
const { getLogStores } = require('~/cache');

const Conversation = mongoose.models.Conversation;
const Message = mongoose.models.Message;

const searchEnabled = isEnabled(process.env.SEARCH);
const indexingDisabled = isEnabled(process.env.MEILI_NO_SYNC);
let currentTimeout = null;

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
      });
    }
    return MeiliSearchClient.instance;
  }
}

/**
 * Ensures indexes have proper filterable attributes configured and checks if documents have user field
 * @param {MeiliSearch} client - MeiliSearch client instance
 * @returns {Promise<boolean>} - true if configuration was updated or re-sync is needed
 */
async function ensureFilterableAttributes(client) {
  try {
    // Check and update messages index
    try {
      const messagesIndex = client.index('messages');
      const settings = await messagesIndex.getSettings();

      if (!settings.filterableAttributes || !settings.filterableAttributes.includes('user')) {
        logger.info('[indexSync] Configuring messages index to filter by user...');
        await messagesIndex.updateSettings({
          filterableAttributes: ['user'],
        });
        logger.info('[indexSync] Messages index configured for user filtering');
        logger.info('[indexSync] Index configuration updated. Full re-sync will be triggered.');
        return true;
      }

      // Check if existing documents have user field indexed
      try {
        const searchResult = await messagesIndex.search('', { limit: 1 });
        if (searchResult.hits.length > 0 && !searchResult.hits[0].user) {
          logger.info('[indexSync] Existing messages missing user field, re-sync needed');
          return true;
        }
      } catch (searchError) {
        logger.debug('[indexSync] Could not check message documents:', searchError.message);
      }
    } catch (error) {
      if (error.code !== 'index_not_found') {
        logger.warn('[indexSync] Could not check/update messages index settings:', error.message);
      }
    }

    // Check and update conversations index
    try {
      const convosIndex = client.index('convos');
      const settings = await convosIndex.getSettings();

      if (!settings.filterableAttributes || !settings.filterableAttributes.includes('user')) {
        logger.info('[indexSync] Configuring convos index to filter by user...');
        await convosIndex.updateSettings({
          filterableAttributes: ['user'],
        });
        logger.info('[indexSync] Convos index configured for user filtering');
        logger.info('[indexSync] Index configuration updated. Full re-sync will be triggered.');
        return true;
      }

      // Check if existing documents have user field indexed
      try {
        const searchResult = await convosIndex.search('', { limit: 1 });
        if (searchResult.hits.length > 0 && !searchResult.hits[0].user) {
          logger.info('[indexSync] Existing conversations missing user field, re-sync needed');
          return true;
        }
      } catch (searchError) {
        logger.debug('[indexSync] Could not check conversation documents:', searchError.message);
      }
    } catch (error) {
      if (error.code !== 'index_not_found') {
        logger.warn('[indexSync] Could not check/update convos index settings:', error.message);
      }
    }
  } catch (error) {
    logger.error('[indexSync] Error ensuring filterable attributes:', error);
  }

  return false;
}

/**
 * Performs the actual sync operations for messages and conversations
 */
async function performSync() {
  const client = MeiliSearchClient.getInstance();

  const { status } = await client.health();
  if (status !== 'available') {
    throw new Error('Meilisearch not available');
  }

  if (indexingDisabled === true) {
    logger.info('[indexSync] Indexing is disabled, skipping...');
    return { messagesSync: false, convosSync: false };
  }

  /** Ensures indexes have proper filterable attributes configured */
  const configUpdated = await ensureFilterableAttributes(client);

  let messagesSync = false;
  let convosSync = false;

  // If configuration was just updated or documents are missing user field, force a full re-sync
  if (configUpdated) {
    logger.info('[indexSync] Forcing full re-sync to ensure user field is properly indexed...');

    // Reset sync flags to force full re-sync
    await Message.collection.updateMany({ _meiliIndex: true }, { $set: { _meiliIndex: false } });
    await Conversation.collection.updateMany(
      { _meiliIndex: true },
      { $set: { _meiliIndex: false } },
    );
  }

  // Check if we need to sync messages
  const messageProgress = await Message.getSyncProgress();
  if (!messageProgress.isComplete || configUpdated) {
    logger.info(
      `[indexSync] Messages need syncing: ${messageProgress.totalProcessed}/${messageProgress.totalDocuments} indexed`,
    );

    // Check if we should do a full sync or incremental
    const messageCount = await Message.countDocuments();
    const messagesIndexed = messageProgress.totalProcessed;
    const syncThreshold = parseInt(process.env.MEILI_SYNC_THRESHOLD || '1000', 10);

    if (messageCount - messagesIndexed > syncThreshold) {
      logger.info('[indexSync] Starting full message sync due to large difference');
      await Message.syncWithMeili();
      messagesSync = true;
    } else if (messageCount !== messagesIndexed) {
      logger.warn('[indexSync] Messages out of sync, performing incremental sync');
      await Message.syncWithMeili();
      messagesSync = true;
    }
  } else {
    logger.info(
      `[indexSync] Messages are fully synced: ${messageProgress.totalProcessed}/${messageProgress.totalDocuments}`,
    );
  }

  // Check if we need to sync conversations
  const convoProgress = await Conversation.getSyncProgress();
  if (!convoProgress.isComplete || configUpdated) {
    logger.info(
      `[indexSync] Conversations need syncing: ${convoProgress.totalProcessed}/${convoProgress.totalDocuments} indexed`,
    );

    const convoCount = await Conversation.countDocuments();
    const convosIndexed = convoProgress.totalProcessed;
    const syncThreshold = parseInt(process.env.MEILI_SYNC_THRESHOLD || '1000', 10);

    if (convoCount - convosIndexed > syncThreshold) {
      logger.info('[indexSync] Starting full conversation sync due to large difference');
      await Conversation.syncWithMeili();
      convosSync = true;
    } else if (convoCount !== convosIndexed) {
      logger.warn('[indexSync] Convos out of sync, performing incremental sync');
      await Conversation.syncWithMeili();
      convosSync = true;
    }
  } else {
    logger.info(
      `[indexSync] Conversations are fully synced: ${convoProgress.totalProcessed}/${convoProgress.totalDocuments}`,
    );
  }

  return { messagesSync, convosSync };
}

/**
 * Main index sync function that uses FlowStateManager to prevent concurrent execution
 */
async function indexSync() {
  if (!searchEnabled) {
    return;
  }

  logger.info('[indexSync] Starting index synchronization check...');

  try {
    // Get or create FlowStateManager instance
    const flowsCache = getLogStores(CacheKeys.FLOWS);
    if (!flowsCache) {
      logger.warn('[indexSync] Flows cache not available, falling back to direct sync');
      return await performSync();
    }

    const flowManager = new FlowStateManager(flowsCache, {
      ttl: 60000 * 10, // 10 minutes TTL for sync operations
    });

    // Use a unique flow ID for the sync operation
    const flowId = 'meili-index-sync';
    const flowType = 'MEILI_SYNC';

    // This will only execute the handler if no other instance is running the sync
    const result = await flowManager.createFlowWithHandler(flowId, flowType, performSync);

    if (result.messagesSync || result.convosSync) {
      logger.info('[indexSync] Sync completed successfully');
    } else {
      logger.debug('[indexSync] No sync was needed');
    }

    return result;
  } catch (err) {
    if (err.message.includes('flow already exists')) {
      logger.info('[indexSync] Sync already running on another instance');
      return;
    }

    if (err.message.includes('not found')) {
      logger.debug('[indexSync] Creating indices...');
      currentTimeout = setTimeout(async () => {
        try {
          await Message.syncWithMeili();
          await Conversation.syncWithMeili();
        } catch (err) {
          logger.error('[indexSync] Trouble creating indices, try restarting the server.', err);
        }
      }, 750);
    } else if (err.message.includes('Meilisearch not configured')) {
      logger.info('[indexSync] Meilisearch not configured, search will be disabled.');
    } else {
      logger.error('[indexSync] error', err);
    }
  }
}

process.on('exit', () => {
  logger.debug('[indexSync] Clearing sync timeouts before exiting...');
  clearTimeout(currentTimeout);
});

module.exports = indexSync;
