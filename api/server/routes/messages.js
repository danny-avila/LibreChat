const express = require('express');
const router = express.Router();
const { getMessages } = require('../../models/Message');
const requireJwtAuth = require('../middleware/requireJwtAuth');

router.get('/:conversationId', requireJwtAuth, async (req, res) => {
  const { conversationId } = req.params;
  res.status(200).send(await getMessages({ conversationId }));
});

module.exports = router;
