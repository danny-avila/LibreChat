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
    logger.info("err 1");
    const client = MeiliSearchClient.getInstance();
    logger.info("err 2");

    const { status } = await client.health();
    logger.info("err 3");
    if (status !== 'available' || !process.env.SEARCH) {
      throw new Error('Meilisearch not available');
    }

    const messageCount = await Message.countDocuments();
    logger.info("err 4");
    const convoCount = await Conversation.countDocuments();
    logger.info("err 5");
    const messages = await client.index('messages').getStats();
    logger.info("err 6");
    const convos = await client.index('convos').getStats();
    logger.info("err 7");
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
    logger.info("err:", err);
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
      // res.status(500).json({ error: 'Server error' });
    }
  }
}

process.on('exit', () => {
  logger.debug('[indexSync] Clearing sync timeouts before exiting...');
  clearTimeout(currentTimeout);
});

module.exports = indexSync;
