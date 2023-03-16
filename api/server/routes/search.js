const express = require('express');
const router = express.Router();
const { Message } = require('../../models/Message');

router.get('/sync', async function (req, res) {
  console.log(Message);
  await Message.syncWithMeili();
  const result = await Message.meiliSearch({ query: 'computing' });
  console.log(result);
  res.send(result);
})

module.exports = router;
