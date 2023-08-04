const express = require('express');
const router = express.Router();
const { Tiktoken } = require('@dqbd/tiktoken/lite');
const { load } = require('@dqbd/tiktoken/load');
const registry = require('@dqbd/tiktoken/registry.json');
const models = require('@dqbd/tiktoken/model_to_encoding.json');
const requireJwtAuth = require('../../middleware/requireJwtAuth');

router.post('/', requireJwtAuth, async (req, res) => {
  try {
    const { arg } = req.body;
    const model = await load(registry[models['gpt-3.5-turbo']]);
    const encoder = new Tiktoken(model.bpe_ranks, model.special_tokens, model.pat_str);
    const tokens = encoder.encode(arg?.text ?? arg);
    encoder.free();
    res.send({ count: tokens.length });
  } catch (e) {
    console.error(e);
    res.status(500).send(e.message);
  }
});

module.exports = router;
