const express = require('express');
const router = express.Router();
const { countTokens } = require('../utils');
const requireJwtAuth = require('../middleware/requireJwtAuth');

router.post('/', requireJwtAuth, async (req, res) => {
  try {
    const { arg } = req.body;
    const count = await countTokens(arg?.text ?? arg);
    res.send({ count });
  } catch (e) {
    console.error(e);
    res.status(500).send(e.message);
  }
});

module.exports = router;
