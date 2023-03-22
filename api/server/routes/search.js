const express = require('express');
const router = express.Router();
const { MeiliSearch } = require('meilisearch');
const { Message } = require('../../models/Message');
const { Conversation, getConvosQueried } = require('../../models/Conversation');
const { reduceHits } = require('../../lib/utils/reduceHits');
const { cleanUpPrimaryKeyValue } = require('../../lib/utils/misc');
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
      const { pages, pageSize, messages } = cached;
      res.status(200).send({ conversations: cached[pageNumber], pages, pageNumber, pageSize, messages });
      return;
    } else {
      cache.clear();
    }

    // const message = await Message.meiliSearch(q);
    const messages = (
      await Message.meiliSearch(
        q,
        {
          attributesToHighlight: ['text'],
          highlightPreTag: '**',
          highlightPostTag: '**'
        },
        true
      )
    ).hits.map((message) => {
      const { _formatted, ...rest } = message;
      return {
        ...rest,
        searchResult: true,
        text: _formatted.text
      };
    });
    const titles = (await Conversation.meiliSearch(q)).hits;
    console.log('messages', messages.length, 'titles', titles.length);
    const sortedHits = reduceHits(messages, titles);
    const result = await getConvosQueried(user, sortedHits, pageNumber);

    const activeMessages = [];
    for (let i = 0; i < messages.length; i++) {
      let message = messages[i];
      if (message.conversationId.includes('--')) {
        message.conversationId = cleanUpPrimaryKeyValue(message.conversationId);
      }
      if (result.convoMap[message.conversationId] && !message.error) {
        message = { ...message, title: result.convoMap[message.conversationId].title };
        activeMessages.push(message);
      }
    }
    result.messages = activeMessages;
    result.cache.messages = activeMessages;
    cache.set(key, result.cache);
    delete result.cache;
    delete result.convoMap;
    // for debugging
    // console.log(result, messages.length);
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
      apiKey: process.env.MEILI_MASTER_KEY
    });

    const { status } = await client.health();
    // console.log(`Meilisearch: ${status}`);
    result = status === 'available' && !!process.env.SEARCH;
    return res.send(result);
  } catch (error) {
    console.error(error);
    return res.send(false);
  }
});

module.exports = router;
