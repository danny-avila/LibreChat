const express = require('express');
const { speechToText } = require('~/server/services/Files/Audio');

const router = express.Router();

router.post('/', speechToText);

module.exports = router;
