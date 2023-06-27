const express = require('express');
const router = express.Router();
const { getConvo, saveConvo } = require('../../models');
const { getConvosByPage, deleteConvos, getRecentConvos } = require('../../models/Conversation');
const requireJwtAuth = require('../../middleware/requireJwtAuth');

router.get('/', requireJwtAuth, async (req, res) => {
  const pageNumber = req.query.pageNumber || 1;
  res.status(200).send(await getConvosByPage(req.user.id, pageNumber));
});

router.get('/:conversationId', requireJwtAuth, async (req, res) => {
  const { conversationId } = req.params;
  const convo = await getConvo(req.user.id, conversationId);

  if (convo) res.status(200).send(convo.toObject());
  else res.status(404).end();
});

router.post('/clear', requireJwtAuth, async (req, res) => {
  let filter = {};
  const { conversationId, source } = req.body.arg;
  if (conversationId) {
    filter = { conversationId };
  }

  console.log('source:', source);

  if (source === 'button' && !conversationId) {
    return res.status(200).send('No conversationId provided');
  }

  try {
    const dbResponse = await deleteConvos(req.user.id, filter);
    res.status(201).send(dbResponse);
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

router.post('/update', requireJwtAuth, async (req, res) => {
  const update = req.body.arg;

  try {
    const dbResponse = await saveConvo(req.user.id, update);
    res.status(201).send(dbResponse);
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

router.get('/recent', requireJwtAuth, async (req, res) => {
  try {
    const recentConvos = await getRecentConvos();
    res.status(200).send(recentConvos);
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

module.exports = router;
