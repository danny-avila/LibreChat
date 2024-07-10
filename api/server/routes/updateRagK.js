const express = require('express');
const router = express.Router();
const { setRagK, getRagK } = require('~/config/ragk');

router.post('/', (req, res) => {
  const { ragK } = req.body;

  if (typeof ragK === 'undefined') {
    return res.status(400).json({ error: 'ragK field is required' });
  }

  setRagK(ragK);

  res.status(200).json({ message: 'ragK updated successfully', ragK });
});

router.get('/', (req, res) => {
  const ragK = getRagK();
  res.status(200).json({ ragK });
});

module.exports = router;
