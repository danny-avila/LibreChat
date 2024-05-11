const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireJwtAuth } = require('~/server/middleware/');
const { speechToText } = require('~/server/services/Files/Audio');

const upload = multer();

router.post('/', requireJwtAuth, upload.single('audio'), async (req, res) => {
  await speechToText(req, res);
});

module.exports = router;
