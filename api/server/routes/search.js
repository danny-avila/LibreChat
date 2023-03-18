const express = require('express');
const router = express.Router();
const { Message } = require('../../models/Message');
const { Conversation } = require('../../models/Conversation');
const {reduceMessages, reduceHits} = require('../../lib/utils/reduceHits');
// const { MeiliSearch } = require('meilisearch');

router.get('/sync', async function (req, res) {
  await Message.syncWithMeili();
  await Conversation.syncWithMeili();
  res.send('synced');
});

router.get('/', async function (req, res) {
  const { q } = req.query;
  const message = await Message.meiliSearch(q, { attributesToHighlight: ['text', 'sender'] });
  const title = await Conversation.meiliSearch(q, { attributesToHighlight: ['title'] });
  // console.log('titles', title);
  // console.log(sortedHits);
  const sortedHits = reduceHits(message.hits, title.hits);
  // const sortedHits = reduceMessages(message.hits);
  res.status(200).send({sortedHits});
});

router.get('/clear', async function (req, res) {
  await Message.resetIndex();
  res.send('cleared');
});

module.exports = router;
