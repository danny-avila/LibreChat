const express = require('express');
const router = express.Router();
const { Message } = require('../../models/Message');
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
  console.log(result);
  res.send(result);
});

module.exports = router;
