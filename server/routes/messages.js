const express = require('express');
const router = express.Router();
const { getMessages } = require('../../models/Message');

router.get('/:conversationId', async (req, res) => {
  const { conversationId } = req.params;
  res.status(200).send(await getMessages({ conversationId }));
});

module.exports = router;
