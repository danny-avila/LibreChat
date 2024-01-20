const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('~/server/middleware/');
const multer = require('multer');
const upload = multer();

router.post('/', requireJwtAuth, upload.single('audio'), async (req, res) => {
  try {
    console.log(req.body);

    await new Promise((resolve) => setTimeout(resolve, 4000));

    res.json({ text: 'This is the transcribed text' });
  } catch (error) {
    res.status(500).json({ message: 'An error occurred while uploading the audio' });
  }
});

module.exports = router;
