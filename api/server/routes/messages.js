const express = require('express');
const router = express.Router();
const {
  getMessages,
  updateMessage,
  saveConvo,
  saveMessage,
  deleteMessages,
} = require('../../models');
const { requireJwtAuth, validateMessageReq } = require('../middleware/');

router.get('/:conversationId', requireJwtAuth, validateMessageReq, async (req, res) => {
  const { conversationId } = req.params;
  res.status(200).send(await getMessages({ conversationId }));
});

// CREATE
router.post('/:conversationId', requireJwtAuth, validateMessageReq, async (req, res) => {
  const message = req.body;
  const savedMessage = await saveMessage(message);
  await saveConvo(req.user.id, savedMessage);
  res.status(201).send(savedMessage);
});

// READ
router.get('/:conversationId/:messageId', requireJwtAuth, validateMessageReq, async (req, res) => {
  const { conversationId, messageId } = req.params;
  res.status(200).send(await getMessages({ conversationId, messageId }));
});

// UPDATE
router.put('/:conversationId/:messageId', requireJwtAuth, validateMessageReq, async (req, res) => {
  const { messageId } = req.params;
  const { text } = req.body;
  res.status(201).send(await updateMessage({ messageId, text }));
});

// DELETE
router.delete(
  '/:conversationId/:messageId',
  requireJwtAuth,
  validateMessageReq,
  async (req, res) => {
    const { messageId } = req.params;
    await deleteMessages({ messageId });
    res.status(204).send();
  },
);

module.exports = router;
