const express = require('express');

const {
  getConversationTags,
  updateConversationTag,
  createConversationTag,
  deleteConversationTag,
  rebuildConversationTags,
} = require('~/models/ConversationTag');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const router = express.Router();
router.use(requireJwtAuth);

router.get('/', async (req, res) => {
  const tags = await getConversationTags(req.user.id);

  if (tags) {
    res.status(200).json(tags);
  } else {
    res.status(404).end();
  }
});

router.post('/', async (req, res) => {
  const tag = await createConversationTag(req.user.id, req.body);
  res.status(200).json(tag);
});

router.post('/rebuild', async (req, res) => {
  const tag = await rebuildConversationTags(req.user.id);
  res.status(200).json(tag);
});

router.put('/:tag', async (req, res) => {
  const tag = await updateConversationTag(req.user.id, req.params.tag, req.body);
  res.status(200).json(tag);
});

router.delete('/:tag', async (req, res) => {
  const tag = await deleteConversationTag(req.user.id, req.params.tag);
  res.status(200).json(tag);
});

module.exports = router;
