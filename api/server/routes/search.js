const express = require('express');
const router = express.Router();
const { Message } = require('../../models/Message');
const { Conversation, getConvosQueried } = require('../../models/Conversation');
const {reduceMessages, reduceHits} = require('../../lib/utils/reduceHits');
// const { MeiliSearch } = require('meilisearch');

router.get('/sync', async function (req, res) {
  await Message.syncWithMeili();
  await Conversation.syncWithMeili();
  res.send('synced');
});

router.get('/', async function (req, res) {
  const { q } = req.query;
  console.log(req.query);
  const pageNumber = req.query.pageNumber || 1;
  // const message = await Message.meiliSearch(q, { attributesToHighlight: ['text', 'sender'] });
  const message = await Message.meiliSearch(q);
  const title = await Conversation.meiliSearch(q, { attributesToHighlight: ['title'] });
  // console.log('titles', title);
  // console.log(sortedHits);
  const sortedHits = reduceHits(message.hits, title.hits);
  const result = await getConvosQueried(req?.session?.user?.username, sortedHits, pageNumber);
  // const sortedHits = reduceMessages(message.hits);
  // res.status(200).send(sortedHits || result);
  res.status(200).send(result);
});

router.get('/clear', async function (req, res) {
  await Message.resetIndex();
  res.send('cleared');
});

module.exports = router;
