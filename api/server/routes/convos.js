const express = require('express');
const router = express.Router();
const { getConvosByPage, deleteConvos } = require('~/models/Conversation');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const { getConvo, saveConvo } = require('~/models');
const { logger } = require('~/config');

router.use(requireJwtAuth);

router.get('/', async (req, res) => {
  const pageNumber = req.query.pageNumber || 1;
  res.status(200).send(await getConvosByPage(req.user.id, pageNumber));
});

router.get('/:conversationId', async (req, res) => {
  const { conversationId } = req.params;
  const convo = await getConvo(req.user.id, conversationId);

  if (convo) {
    res.status(200).send(convo);
  } else {
    res.status(404).end();
  }
});

router.post('/clear', async (req, res) => {
  let filter = {};
  const { conversationId, source } = req.body.arg;
  if (conversationId) {
    filter = { conversationId };
  }

  // for debugging deletion source
  // logger.debug('source:', source);

  if (source === 'button' && !conversationId) {
    return res.status(200).send('No conversationId provided');
  }

  try {
    const dbResponse = await deleteConvos(req.user.id, filter);
    res.status(201).send(dbResponse);
  } catch (error) {
    logger.error('Error clearing conversations', error);
    res.status(500).send(error);
  }
});

router.post('/update', async (req, res) => {
  const update = req.body.arg;

  try {
    const dbResponse = await saveConvo(req.user.id, update);
    res.status(201).send(dbResponse);
  } catch (error) {
    logger.error('Error updating conversation', error);
    res.status(500).send(error);
  }
});

module.exports = router;
