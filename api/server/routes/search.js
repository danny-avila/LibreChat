const { Keyv } = require('keyv');
const express = require('express');
const { MeiliSearch } = require('meilisearch');
const { Conversation } = require('~/models/Conversation');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const { Message } = require('~/models/Message');
const { isEnabled } = require('~/server/utils');
const keyvRedis = require('~/cache/keyvRedis');

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
