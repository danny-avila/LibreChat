const express = require('express');
const router = express.Router();
const { Tiktoken } = require('@dqbd/tiktoken/lite');
const { load } = require('@dqbd/tiktoken/load');
const registry = require('@dqbd/tiktoken/registry.json');
const models = require('@dqbd/tiktoken/model_to_encoding.json');

router.post('/', async (req, res) => {
  const { arg } = req.body;
  // console.log(typeof req.body === 'object' ? { ...req.body, ...req.query } : req.query);
  const model = await load(registry[models['gpt-3.5-turbo']]);
  const encoder = new Tiktoken(model.bpe_ranks, model.special_tokens, model.pat_str);
  const tokens = encoder.encode(arg.text);
  encoder.free();
  res.send({ count: tokens.length });
});

module.exports = router;
