const Keyv = require('keyv');
const express = require('express');
const { MeiliSearch } = require('meilisearch');
const { Conversation, getConvosQueried } = require('~/models/Conversation');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const { cleanUpPrimaryKeyValue } = require('~/lib/utils/misc');
const { reduceHits } = require('~/lib/utils/reduceHits');
const { isEnabled } = require('~/server/utils');
const { Message } = require('~/models/Message');
const keyvRedis = require('~/cache/keyvRedis');
const { logger } = require('~/config');

const router = express.Router();

const expiration = 60 * 1000;
const cache = isEnabled(process.env.USE_REDIS)
  ? new Keyv({ store: keyvRedis })
  : new Keyv({ namespace: 'search', ttl: expiration });

router.use(requireJwtAuth);

router.get('/sync', async function (req, res) {
  await Message.syncWithMeili();
  await Conversation.syncWithMeili();
  res.send('synced');
});

router.get('/', async function (req, res) {
  try {
    const user = req.user.id ?? '';
    const { q, cursor = 'start' } = req.query;
    const key = `${user}:search:${q}:${cursor}`;
    const cached = await cache.get(key);
    if (cached) {
      logger.debug('[/search] cache hit: ' + key);
      return res.status(200).send(cached);
    }

    const [messageResults, titleResults] = await Promise.all([
      Message.meiliSearch(q, undefined, true),
      Conversation.meiliSearch(q),
    ]);
    const messages = messageResults.hits;
    const titles = titleResults.hits;

    const sortedHits = reduceHits(messages, titles);
    const result = await getConvosQueried(user, sortedHits, cursor);

    const activeMessages = [];
    for (let i = 0; i < messages.length; i++) {
      let message = messages[i];

      if (message.conversationId.includes('--')) {
        message.conversationId = cleanUpPrimaryKeyValue(message.conversationId);
      }

      if (result.convoMap[message.conversationId]) {
        const convo = result.convoMap[message.conversationId];
        activeMessages.push({
          ...message,
          title: convo.title,
          conversationId: message.conversationId,
          cleanedConversationId: cleanUpPrimaryKeyValue(message.conversationId),
          searchMetadata: {
            matchScore: message._score,
            highlightedContent: message._formatted?.text,
            matchedTerms: message._matchesInfo,
          },
        });
      }
    }

    const activeConversations = [];
    for (const convId in result.convoMap) {
      const convo = result.convoMap[convId];
      activeConversations.push({
        title: convo.title,
        user: convo.user,
        conversationId: convo.conversationId,
      });
    }

    if (result.cache) {
      result.cache.messages = activeMessages;
      result.cache.conversations = activeConversations;
      cache.set(key, result.cache, expiration);
    }

    const response = {
      nextCursor: result.nextCursor ?? null,
      messages: activeMessages,
      conversations: activeConversations,
    };

    res.status(200).send(response);
  } catch (error) {
    logger.error('[/search] Error while searching messages & conversations', error);
    res.status(500).send({ message: 'Error searching' });
  }
});

router.get('/test', async function (req, res) {
  const { q } = req.query;
  const messages = (
    await Message.meiliSearch(q, { attributesToHighlight: ['text'] }, true)
  ).hits.map((message) => {
    const { _formatted, ...rest } = message;
    return { ...rest, searchResult: true, text: _formatted.text };
  });
  res.send(messages);
});

router.get('/enable', async function (req, res) {
  let result = false;
  try {
    const client = new MeiliSearch({
      host: process.env.MEILI_HOST,
      apiKey: process.env.MEILI_MASTER_KEY,
    });

    const { status } = await client.health();
    result = status === 'available' && !!process.env.SEARCH;
    return res.send(result);
  } catch (error) {
    return res.send(false);
  }
});

module.exports = router;
