const express = require('express');
const router = express.Router();
const { Message } = require('../../models/Message');
const { Conversation, getConvosQueried } = require('../../models/Conversation');
const { reduceMessages, reduceHits } = require('../../lib/utils/reduceHits');
// const { MeiliSearch } = require('meilisearch');

router.get('/sync', async function (req, res) {
  await Message.syncWithMeili();
  await Conversation.syncWithMeili();
  res.send('synced');
});

router.get('/', async function (req, res) {
  try {
    const { q } = req.query;
    console.log(req.query, req.params);
    const pageNumber = req.query.pageNumber || 1;
    const message = await Message.meiliSearch(q);
    const title = await Conversation.meiliSearch(q, { attributesToHighlight: ['title'] });
    const sortedHits = reduceHits(message.hits, title.hits);
    const result = await getConvosQueried(
      req?.session?.user?.username,
      sortedHits,
      pageNumber
    );
    console.log('result', result.pageNumber, result.pages, result.pageSize);
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

module.exports = router;
