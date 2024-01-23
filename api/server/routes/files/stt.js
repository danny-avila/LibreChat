const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('~/server/middleware/');
const multer = require('multer');
const axios = require('axios');
const upload = multer();

router.post('/', requireJwtAuth, upload.single('audio'), async (req, res) => {
  try {
    const audioBuffer = req.file.buffer;
    const audioBlob = new Blob([audioBuffer], { type: req.file.mimetype });

    const formData = new FormData();
    formData.append('file', audioBlob);
    formData.append('model', 'whisper-1');

    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
      headers: {
        Authorization: `Bearer ${process.env.WHISPER_API_KEY}`,
        'Content-Type': 'multipart/form-data',
      },
    });

    if (response && response.status && response.data && response.data.text) {
      const text = response.data.text.trim();
      res.json({ text: text });
    } else {
      throw new Error(
        `Invalid response from API. Status: ${response ? response.status : 'undefined'}`,
      );
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'An error occurred while processing the audio' });
  }
});

module.exports = router;
