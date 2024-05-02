const { MeiliSearch } = require('meilisearch');
const Conversation = require('~/models/schema/convoSchema');
const Message = require('~/models/schema/messageSchema');
const { logger } = require('~/config');

const searchEnabled = process.env?.SEARCH?.toLowerCase() === 'true';
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

// eslint-disable-next-line no-unused-vars
async function indexSync(req, res, next) {
  if (!searchEnabled) {
    return;
  }

  try {
    const client = MeiliSearchClient.getInstance();

    const { status } = await client.health();
    if (status !== 'available' || !process.env.SEARCH) {
      throw new Error('Meilisearch not available');
    }

    const messageCount = await Message.countDocuments();
    const convoCount = await Conversation.countDocuments();
    const messages = await client.index('messages').getStats();
    const convos = await client.index('convos').getStats();
    const messagesIndexed = messages.numberOfDocuments;
    const convosIndexed = convos.numberOfDocuments;

    logger.debug(`[indexSync] There are ${messageCount} messages and ${messagesIndexed} indexed`);
    logger.debug(`[indexSync] There are ${convoCount} convos and ${convosIndexed} indexed`);

    if (messageCount !== messagesIndexed) {
      logger.debug('[indexSync] Messages out of sync, indexing');
      Message.syncWithMeili();
    }

    if (convoCount !== convosIndexed) {
      logger.debug('[indexSync] Convos out of sync, indexing');
      Conversation.syncWithMeili();
    }
  } catch (err) {
    logger.error('[indexSync] error', err);
    // Handle specific errors appropriately
  }
}

process.on('exit', () => {
  logger.debug('[indexSync] Clearing sync timeouts before exiting...');
  clearTimeout(currentTimeout);
});

module.exports = indexSync;
