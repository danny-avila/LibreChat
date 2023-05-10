const express = require('express');
const router = express.Router();
const { getMessages } = require('../../models/Message');
const requireJwtAuth = require('../../middleware/requireJwtAuth');

router.get('/:conversationId', requireJwtAuth, async (req, res) => {
  const { conversationId } = req.params;
  try {
    const messages = await getMessages({ conversationId });
    res.status(200).send(messages);
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while retrieving messages');
  }
});

module.exports = router;
