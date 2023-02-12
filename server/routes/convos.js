const express = require('express');
const router = express.Router();
const { getConvos, deleteConvos, updateConvo } = require('../../models/Conversation');

router.get('/', async (req, res) => {
  res.status(200).send(await getConvos());
});

router.post('/clear', async (req, res) => {
  let filter = {};
  const { conversationId } = req.body.arg;
  if (!!conversationId) {
    filter = { conversationId };
  }

  try {
    const dbResponse = await deleteConvos(filter);
    res.status(201).send(dbResponse);
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

router.post('/update', async (req, res) => {
  const update = req.body.arg;

  try {
    const dbResponse = await updateConvo(update);
    res.status(201).send(dbResponse);
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

module.exports = router;
