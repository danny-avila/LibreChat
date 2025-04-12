const { Keyv } = require('keyv');
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
    let user = req.user.id ?? '';
    const { q } = req.query;
    const pageNumber = req.query.pageNumber || 1;
    const key = `${user}:search:${q}`;
    const cached = await cache.get(key);
    if (cached) {
      logger.debug('[/search] cache hit: ' + key);
      const { pages, pageSize, messages } = cached;
      res
        .status(200)
        .send({ conversations: cached[pageNumber], pages, pageNumber, pageSize, messages });
      return;
    }

    const messages = (await Message.meiliSearch(q, undefined, true)).hits;
    const titles = (await Conversation.meiliSearch(q)).hits;

    const sortedHits = reduceHits(messages, titles);
    const result = await getConvosQueried(user, sortedHits, pageNumber);

    const activeMessages = [];
    for (let i = 0; i < messages.length; i++) {
      let message = messages[i];
      if (message.conversationId.includes('--')) {
        message.conversationId = cleanUpPrimaryKeyValue(message.conversationId);
      }
      if (result.convoMap[message.conversationId]) {
        const convo = result.convoMap[message.conversationId];
        const { title, chatGptLabel, model } = convo;
        message = { ...message, ...{ title, chatGptLabel, model } };
        activeMessages.push(message);
      }
    }
    result.messages = activeMessages;
    if (result.cache) {
      result.cache.messages = activeMessages;
      cache.set(key, result.cache, expiration);
      delete result.cache;
    }
    delete result.convoMap;

    res.status(200).send(result);
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
