const express = require('express');
const router = express.Router();
const { Message } = require('../../models/Message');
const reduceHits = require('../../lib/utils/reduceHits');
// const { MeiliSearch } = require('meilisearch');

router.get('/sync', async function (req, res) {
  // await Message.setMeiliIndexSettings({ primaryKey: 'messageId' });
  // res.send('updated settings');
  // await Message.clearMeiliIndex();
  // res.send('deleted index');
  await Message.syncWithMeili();
  res.send('synced');
});

router.get('/', async function (req, res) {
  const { q } = req.query;
  const result = await Message.meiliSearch({ query: q });
  const sortedHits = reduceHits(result.hits);
  console.log(sortedHits);
  res.send(sortedHits);
});

router.get('/clear', async function (req, res) {
  await Message.resetIndex();
  res.send('cleared');
});

module.exports = router;
