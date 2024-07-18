const express = require('express');
const router = express.Router();
const { saveConvo, saveMessage, getMessages, updateMessage, deleteMessages } = require('~/models');
const { requireJwtAuth, validateMessageReq } = require('~/server/middleware');
const { countTokens } = require('~/server/utils');

router.use(requireJwtAuth);

/* Note: It's necessary to add `validateMessageReq` within route definition for correct params */
router.get('/:conversationId', validateMessageReq, async (req, res) => {
  const { conversationId } = req.params;
  res.status(200).send(await getMessages({ conversationId }, '-_id -__v -user'));
});

// CREATE
router.post('/:conversationId', validateMessageReq, async (req, res) => {
  const message = req.body;
  const savedMessage = await saveMessage(req, { ...message, user: req.user.id });
  await saveConvo(req.user.id, savedMessage);
  res.status(201).send(savedMessage);
});

// READ
router.get('/:conversationId/:messageId', validateMessageReq, async (req, res) => {
  const { conversationId, messageId } = req.params;
  res.status(200).send(await getMessages({ conversationId, messageId }, '-_id -__v -user'));
});

// UPDATE
router.put('/:conversationId/:messageId', validateMessageReq, async (req, res) => {
  const { messageId, model } = req.params;
  const { text } = req.body;
  const tokenCount = await countTokens(text, model);
  const result = await updateMessage(req, { messageId, text, tokenCount });
  res.status(201).json(result);
});

// DELETE
router.delete('/:conversationId/:messageId', validateMessageReq, async (req, res) => {
  const { messageId } = req.params;
  await deleteMessages({ messageId });
  res.status(204).send();
});

module.exports = router;
