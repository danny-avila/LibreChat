const express = require('express');
const router = express.Router();
const { getCategories } = require('../../models/Categories');
const { requireJwtAuth } = require('../middleware');

router.get('/', requireJwtAuth, async (req, res) => {
  res.status(200).send(await getCategories());
});

module.exports = router;
