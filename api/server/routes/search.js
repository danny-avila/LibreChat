const express = require('express');
const router = express.Router();
const { Message } = require('../../models/Message');
const { Conversation, getConvosQueried } = require('../../models/Conversation');
const { reduceMessages, reduceHits } = require('../../lib/utils/reduceHits');
// const { MeiliSearch } = require('meilisearch');
const cache = new Map();

router.get('/sync', async function (req, res) {
  await Message.syncWithMeili();
  await Conversation.syncWithMeili();
  res.send('synced');
});

router.get('/', async function (req, res) {
  try {
    const user = req?.session?.user?.username;
    const { q } = req.query;
    const pageNumber = req.query.pageNumber || 1;
    const key = `${user || ''}${q}`;

    if (cache.has(key)) {
      console.log('cache hit', key);
      const cached = cache.get(key);
      const { pages, pageSize } = cached;
      res.status(200).send({ conversations: cached[pageNumber], pages, pageNumber, pageSize });
      return;
    } else {
      cache.clear();
    }
    const message = await Message.meiliSearch(q);
    const title = await Conversation.meiliSearch(q, { attributesToHighlight: ['title'] });
    const sortedHits = reduceHits(message.hits, title.hits);
    const result = await getConvosQueried(user, sortedHits, pageNumber);
    cache.set(q, result.cache);
    delete result.cache;
    res.status(200).send(result);
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: 'Error searching' });
  }
});

router.get('/clear', async function (req, res) {
  await Message.resetIndex();
  res.send('cleared');
});

router.get('/test', async function (req, res) {
  const { q } = req.query;
  const messages = (await Message.meiliSearch(q, { attributesToHighlight: ['text'] }, true)).hits.map(message => {
    const { _formatted, ...rest } = message;
    return { ...rest, searchResult: true, text: _formatted.text };
  });
  res.send(messages);
});

module.exports = router;
