const express = require('express');
const router = express.Router();
const { getPrompts } = require('../../models/Prompt');

router.get('/', async (req, res) => {
  let filter = {};
  // const { search } = req.body.arg;
  // if (!!search) {
  //   filter = { conversationId };
  // }
  res.status(200).send(await getPrompts(filter));
});

module.exports = router;
