const express = require('express');

const { getBanner } = require('~/models/Banner');
const optionalJwtAuth = require('~/server/middleware/optionalJwtAuth');
const router = express.Router();

router.get('/', optionalJwtAuth, async (req, res) => {
  try {
    res.status(200).send(await getBanner(req.user));
  } catch (error) {
    res.status(500).json({ message: 'Error getting banner' });
  }
});

module.exports = router;
