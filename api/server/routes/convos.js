const express = require('express');
const router = express.Router();
const { getConvo, saveConvo, likeConvo } = require('../../models');
const { getConvosByPage, deleteConvos, getRecentConvos, getHottestConvo } = require('../../models/Conversation');
const requireJwtAuth = require('../../middleware/requireJwtAuth');
const { duplicateMessages } = require('../../models/Message');
const crypto = require('crypto');
const Conversation = require('../../models/schema/convoSchema');

router.get('/', requireJwtAuth, async (req, res) => {
  const pageNumber = req.query.pageNumber || 1;
  res.status(200).send(await getConvosByPage(req.user.id, pageNumber));
});

router.get('/hottest', requireJwtAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const allConvos = await getHottestConvo(userId);
    res.status(200).send({ rs: true, data: allConvos, msg: 'list top 3 convensations successflly' });
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

router.get('/recent', requireJwtAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const recentConvos = await getRecentConvos(userId);
    res.status(200).send(recentConvos);
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
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
  console.log('in update', update);
  try {
    const dbResponse = await saveConvo(req.user.id, update);
    res.status(201).send(dbResponse);
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

router.post('/duplicate', requireJwtAuth, async (req, res) => {
  const { conversation, msgData } = req.body.arg;

  const newConversationId = crypto.randomUUID();

  try {
    let convoObj = structuredClone(conversation);

    delete convoObj._id;
    convoObj.user = req.user.id;
    convoObj.conversationId = newConversationId;
    convoObj.isPrivate = true;
    convoObj.messages = await duplicateMessages({ newConversationId, msgData });

    const newConvo = new Conversation(convoObj);
    const dbResponse = await newConvo.save();
    res.status(201).send(dbResponse);
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

router.post('/like', async (req, res) => {
  const { conversationId, isLiked } = req.body;
  console.log('hit like router')
  try {
    const dbResponse = await likeConvo(conversationId, isLiked);
    console.log('saved in like router')

    res.status(201).send(dbResponse);
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

module.exports = router;
