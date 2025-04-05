const express = require('express');
const router = express.Router();

const { getRealtimeConfig } = require('~/server/services/Files/Audio');

router.get('/', async (req, res) => {
  await getRealtimeConfig(req, res);
});

module.exports = router;
